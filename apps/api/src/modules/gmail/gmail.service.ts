import { OrgSettings, type GmailStatus, type Ticket } from '@triago/shared';
import jwt from 'jsonwebtoken';
import PostalMime from 'postal-mime';
import { config } from '../../config.js';
import { Prisma } from '../../generated/prisma/client.js';
import { prisma } from '../../lib/db.js';
import { HttpError } from '../../lib/errors.js';
import { logger } from '../../lib/logger.js';
import type { AuthContext } from '../../middleware/auth.js';
import { draftTicket } from '../emails/llm-classifier.js';
import { htmlToText } from '../inbound/sendgrid.js';
import { getTicket, insertTicket } from '../tickets/tickets.service.js';
import { decrypt, encrypt } from './crypto.js';
import * as google from './google.js';

const STATE_AUDIENCE = 'triago-gmail-connect';
/** Each sync drafts at most this many emails, because every draft can call a paid model. */
const MAX_PER_SYNC = 5;
/** Only recent mail is imported, so connecting an old mailbox doesn't flood the queue. */
const LOOKBACK = 'newer_than:7d';
const MAX_BODY_CHARS = 100_000;

export async function gmailStatus(orgId: string): Promise<GmailStatus> {
  const row = await prisma.gmailConnection.findUnique({ where: { orgId } });
  return {
    available: config.google !== null,
    email: row?.email ?? null,
    connectedAt: row?.createdAt.toISOString() ?? null,
    lastSyncedAt: row?.lastSyncedAt?.toISOString() ?? null
  };
}

/** The Google consent screen URL. The state is a short-lived signed token naming the org and admin. */
export function connectUrl(auth: AuthContext): string {
  const state = jwt.sign({ org: auth.orgId, sub: auth.userId }, config.jwtSecret, {
    algorithm: 'HS256',
    expiresIn: '10m',
    audience: STATE_AUDIENCE,
    issuer: config.jwtIssuer
  });
  return google.consentUrl(state);
}

/** Finishes the OAuth flow: checks the state, stores the encrypted refresh token, and returns the mailbox. */
export async function completeConnect(code: string, state: string): Promise<string> {
  let claims: { org: string; sub: string };
  try {
    claims = jwt.verify(state, config.jwtSecret, {
      algorithms: ['HS256'],
      audience: STATE_AUDIENCE,
      issuer: config.jwtIssuer
    }) as typeof claims;
  } catch {
    throw new HttpError(400, 'BAD_STATE', 'The Gmail sign-in link expired. Try connecting again.');
  }
  // The admin may have lost the role, or left the organisation, since starting.
  const member = await prisma.membership.findUnique({
    where: { orgId_userId: { orgId: claims.org, userId: claims.sub } }
  });
  if (member?.role !== 'admin') throw new HttpError(403, 'FORBIDDEN', 'Only admins can connect Gmail.');

  const tokens = await google.exchangeCode(code);
  if (!tokens.scope?.split(' ').includes(google.GMAIL_SCOPE)) {
    throw new HttpError(400, 'SCOPE_DENIED', 'Allow Triago to read your email to connect Gmail.');
  }
  if (!tokens.refresh_token) throw new HttpError(400, 'NO_REFRESH_TOKEN', 'Google did not grant offline access.');
  const { emailAddress } = await google.getProfile(tokens.access_token!);

  const data = { email: emailAddress, refreshToken: encrypt(tokens.refresh_token), connectedById: claims.sub };
  await prisma.gmailConnection.upsert({
    where: { orgId: claims.org },
    create: { orgId: claims.org, ...data },
    update: { ...data, lastSyncedAt: null, createdAt: new Date() }
  });
  logger.info({ orgId: claims.org }, 'Gmail connected');
  return emailAddress;
}

export async function disconnect(orgId: string): Promise<void> {
  const row = await prisma.gmailConnection.findUnique({ where: { orgId } });
  if (!row) return;
  const token = decrypt(row.refreshToken);
  if (token) await google.revoke(token);
  await prisma.gmailConnection.delete({ where: { orgId } });
}

export async function isConnected(orgId: string): Promise<boolean> {
  return (await prisma.gmailConnection.count({ where: { orgId } })) > 0;
}

/** The Gmail search for the organisation's watched label and bulk-mail setting. */
function searchQuery(settings: OrgSettings): string {
  const where = settings.mailboxLabel === 'inbox' ? 'in:inbox' : `label:${settings.mailboxLabel}`;
  const bulk = settings.skipBulkMail ? ' -category:promotions -category:social -category:updates -category:forums' : '';
  return `${where} ${LOOKBACK} -from:me${bulk}`;
}

/**
 * Imports new mail from the connected Gmail mailbox into the New column, each
 * with an AI draft. Messages already imported are recognised by Gmail id.
 */
export async function syncGmail(orgId: string): Promise<{ imported: Ticket[]; remaining: number }> {
  const [row, org] = await Promise.all([
    prisma.gmailConnection.findUnique({ where: { orgId } }),
    prisma.organisation.findUnique({ where: { id: orgId }, select: { settings: true } })
  ]);
  if (!row || !org) throw new HttpError(409, 'GMAIL_NOT_CONNECTED', 'Connect Gmail in Settings first.');
  const refreshToken = decrypt(row.refreshToken);
  if (!refreshToken) throw new HttpError(409, 'GMAIL_RECONNECT', 'Reconnect Gmail in Settings.');

  let token: string;
  try {
    token = await google.accessToken(refreshToken);
  } catch (error) {
    if (error instanceof google.GoogleError && error.reason === 'invalid_grant') {
      throw new HttpError(409, 'GMAIL_RECONNECT', 'Gmail access was revoked or expired. Reconnect Gmail in Settings.');
    }
    throw new HttpError(502, 'GMAIL_UNAVAILABLE', 'Could not reach Gmail. Try again in a minute.');
  }

  const ids = await google.listMessageIds(token, searchQuery(OrgSettings.parse(org.settings)), 50);
  const seen = await prisma.ticket.findMany({
    where: { orgId, externalId: { in: ids.map((id) => `gmail:${id}`) } },
    select: { externalId: true }
  });
  const seenIds = new Set(seen.map((ticket) => ticket.externalId));
  // Gmail lists newest first; import oldest first so ticket numbers follow arrival order.
  const fresh = ids.filter((id) => !seenIds.has(`gmail:${id}`)).reverse();
  const batch = fresh.slice(0, MAX_PER_SYNC);

  const imported: Ticket[] = [];
  for (const id of batch) {
    const ticket = await importMessage(orgId, token, id);
    if (ticket) imported.push(ticket);
  }
  await prisma.gmailConnection.update({ where: { orgId }, data: { lastSyncedAt: new Date() } });
  return { imported, remaining: fresh.length - batch.length };
}

async function importMessage(orgId: string, token: string, id: string): Promise<Ticket | null> {
  const { raw, internalDate } = await google.getRawMessage(token, id);
  let email;
  try {
    email = await PostalMime.parse(new Uint8Array(raw));
  } catch {
    logger.warn({ orgId }, 'Skipped a Gmail message that could not be parsed');
    return null;
  }
  const fromEmail = email.from?.address ?? '';
  const fromName = email.from?.name || fromEmail;
  const subject = email.subject?.trim() || '(no subject)';
  const body = (email.text ?? htmlToText(email.html ?? '')).slice(0, MAX_BODY_CHARS).trim() || subject;

  const draft = await draftTicket({ fromName, fromEmail, subject, body });
  try {
    return await prisma.$transaction(async (tx) => {
      const ticketId = await insertTicket(
        tx,
        orgId,
        {
          title: draft.title || subject,
          summary: draft.summary,
          category: draft.category,
          priority: draft.priority,
          aiConfidence: draft.confidence,
          source: 'email',
          requesterName: fromName,
          requesterEmail: fromEmail || null,
          externalId: `gmail:${id}`,
          receivedAt: Number.isNaN(internalDate.getTime()) ? new Date() : internalDate,
          body,
          classifier: draft.classifier
        },
        null
      );
      return getTicket(orgId, ticketId, tx);
    });
  } catch (error) {
    // A concurrent sync imported the same message.
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') return null;
    throw error;
  }
}

/** Background job: pulls new mail for every connected organisation. One failing mailbox doesn't stop the rest. */
export async function syncAllMailboxes(): Promise<void> {
  const rows = await prisma.gmailConnection.findMany({ select: { orgId: true } });
  for (const { orgId } of rows) {
    try {
      const { imported } = await syncGmail(orgId);
      if (imported.length) logger.info({ orgId, imported: imported.length }, 'Imported Gmail messages');
    } catch (error) {
      logger.warn({ orgId, err: error }, 'Gmail sync failed');
    }
  }
}
