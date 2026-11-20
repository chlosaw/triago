import { OrgSettings, type GmailStatus, type Ticket } from '@triago/shared';
import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';
import PostalMime from 'postal-mime';
import { config } from '../../config.js';
import { GMAIL_BACKFILL, SYNC_GMAIL_ORG, enqueue } from '../../jobs/queue.js';
import { prisma } from '../../lib/db.js';
import { HttpError } from '../../lib/errors.js';
import { logger } from '../../lib/logger.js';
import { safeError } from '../../middleware/error-handler.js';
import type { AuthContext } from '../../middleware/auth.js';
import { storeEmail } from '../emails/intake.service.js';
import { htmlToText } from '../inbound/sendgrid.js';
import { getTicket } from '../tickets/tickets.service.js';
import { decrypt, encrypt } from './crypto.js';
import * as google from './google.js';

const STATE_AUDIENCE = 'triago-gmail-connect';
/**
 * Saving an email is cheap (the AI draft is a separate background job), so a sync
 * can take a fair batch. The rest comes in on the next run, two minutes later.
 */
const MAX_PER_SYNC = 25;
/** The regular sync looks at the last week; older mail comes in through a backfill. */
const LOOKBACK_DAYS = 7;
/** Backfill choices offered in Settings. */
export const BACKFILL_DAYS = [30, 90, 365] as const;
const BACKFILL_PAGE = 100;

export async function gmailStatus(orgId: string): Promise<GmailStatus> {
  const row = await prisma.gmailConnection.findUnique({ where: { orgId } });
  return {
    available: config.google !== null,
    email: row?.email ?? null,
    connectedAt: row?.createdAt.toISOString() ?? null,
    lastSyncedAt: row?.lastSyncedAt?.toISOString() ?? null
  };
}

const sha256 = (value: string) => crypto.createHash('sha256').update(value).digest('hex');

/**
 * The OAuth `state`: a short-lived signed token naming the org and admin, bound to the
 * browser that started the flow. The nonce goes to that browser in a cookie and only
 * its hash goes in the state, so a consent link forwarded to someone else is useless.
 */
export function createConnectState(auth: AuthContext): { state: string; nonce: string } {
  const nonce = crypto.randomBytes(32).toString('base64url');
  const state = jwt.sign({ org: auth.orgId, sub: auth.userId, nonce: sha256(nonce) }, config.jwtSecret, {
    algorithm: 'HS256',
    expiresIn: '10m',
    audience: STATE_AUDIENCE,
    issuer: config.jwtIssuer
  });
  return { state, nonce };
}

/** Checks the state's signature and expiry and that it belongs to this browser's nonce cookie. */
export function verifyConnectState(state: string, nonce: string | null): { org: string; sub: string } {
  let claims: { org: string; sub: string; nonce?: string };
  try {
    claims = jwt.verify(state, config.jwtSecret, {
      algorithms: ['HS256'],
      audience: STATE_AUDIENCE,
      issuer: config.jwtIssuer
    }) as typeof claims;
  } catch {
    throw new HttpError(400, 'BAD_STATE', 'The Gmail sign-in link expired. Try connecting again.');
  }
  const expected = Buffer.from(claims.nonce ?? '');
  const actual = Buffer.from(nonce ? sha256(nonce) : '');
  if (!nonce || expected.length !== actual.length || !crypto.timingSafeEqual(expected, actual)) {
    throw new HttpError(
      400,
      'STATE_MISMATCH',
      'This Gmail sign-in was started in another browser. Click Connect Gmail here to try again.'
    );
  }
  return { org: claims.org, sub: claims.sub };
}

/** The Google consent screen URL, and the nonce the caller must set as a cookie. */
export function connectUrl(auth: AuthContext): { url: string; nonce: string } {
  const { state, nonce } = createConnectState(auth);
  return { url: google.consentUrl(state), nonce };
}

/** Finishes the OAuth flow: checks the state, stores the encrypted refresh token, and returns the mailbox. */
export async function completeConnect(code: string, state: string, nonce: string | null): Promise<string> {
  const claims = verifyConnectState(state, nonce);
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
function searchQuery(settings: OrgSettings, days: number): string {
  const where = settings.mailboxLabel === 'inbox' ? 'in:inbox' : `label:${settings.mailboxLabel}`;
  const bulk = settings.skipBulkMail ? ' -category:promotions -category:social -category:updates -category:forums' : '';
  return `${where} newer_than:${days}d -from:me${bulk}`;
}

/** A fresh access token and the org's search settings, or a clear error for the person to act on. */
async function openMailbox(orgId: string): Promise<{ token: string; settings: OrgSettings }> {
  const [row, org] = await Promise.all([
    prisma.gmailConnection.findUnique({ where: { orgId } }),
    prisma.organisation.findUnique({ where: { id: orgId }, select: { settings: true } })
  ]);
  if (!row || !org) throw new HttpError(409, 'GMAIL_NOT_CONNECTED', 'Connect Gmail in Settings first.');
  const refreshToken = decrypt(row.refreshToken);
  if (!refreshToken) throw new HttpError(409, 'GMAIL_RECONNECT', 'Reconnect Gmail in Settings.');
  try {
    return { token: await google.accessToken(refreshToken), settings: OrgSettings.parse(org.settings) };
  } catch (error) {
    if (error instanceof google.GoogleError && error.reason === 'invalid_grant') {
      throw new HttpError(409, 'GMAIL_RECONNECT', 'Gmail access was revoked or expired. Reconnect Gmail in Settings.');
    }
    throw new HttpError(502, 'GMAIL_UNAVAILABLE', 'Could not reach Gmail. Try again in a minute.');
  }
}

/** The ids on this page that this organisation has not imported yet, oldest first. */
async function unseen(orgId: string, ids: string[]): Promise<string[]> {
  const seen = await prisma.ticket.findMany({
    where: { orgId, externalId: { in: ids.map((id) => `gmail:${id}`) } },
    select: { externalId: true }
  });
  const seenIds = new Set(seen.map((ticket) => ticket.externalId));
  // Gmail lists newest first; import oldest first so ticket numbers follow arrival order.
  return ids.filter((id) => !seenIds.has(`gmail:${id}`)).reverse();
}

/**
 * Imports new mail from the connected Gmail mailbox into the New column. Each email
 * is saved straight away; its AI draft follows as a background job.
 */
export async function syncGmail(orgId: string): Promise<{ imported: Ticket[]; remaining: number }> {
  const { token, settings } = await openMailbox(orgId);
  const { ids } = await google.listMessages(token, searchQuery(settings, LOOKBACK_DAYS), 100);
  const fresh = await unseen(orgId, ids);
  const batch = fresh.slice(0, MAX_PER_SYNC);

  const imported: Ticket[] = [];
  for (const id of batch) {
    const ticketId = await importMessage(orgId, token, id);
    if (ticketId) imported.push(await getTicket(orgId, ticketId));
  }
  await prisma.gmailConnection.update({ where: { orgId }, data: { lastSyncedAt: new Date() } });
  return { imported, remaining: fresh.length - batch.length };
}

/**
 * Saves one Gmail message as a ticket. A message that can't be parsed still becomes a
 * placeholder ticket (with a link to open it in Gmail), so it is neither lost nor
 * fetched again on every sync. Returns the new ticket id, or null if it was a duplicate.
 */
export async function importMessage(orgId: string, token: string, id: string): Promise<string | null> {
  const { raw, internalDate } = await google.getRawMessage(token, id);
  const receivedAt = Number.isNaN(internalDate.getTime()) ? new Date() : internalDate;
  let parsed;
  try {
    parsed = await PostalMime.parse(new Uint8Array(raw));
  } catch {
    logger.warn({ orgId }, 'Gmail message could not be parsed; saved as a placeholder');
  }

  const result = parsed
    ? await storeEmail(orgId, {
        externalId: `gmail:${id}`,
        messageId: parsed.messageId,
        fromName: parsed.from?.name ?? '',
        fromEmail: parsed.from?.address ?? null,
        subject: parsed.subject ?? '',
        text: parsed.text ?? htmlToText(parsed.html ?? ''),
        receivedAt
      })
    : await storeEmail(orgId, {
        externalId: `gmail:${id}`,
        fromName: '',
        fromEmail: null,
        subject: '(unreadable email)',
        text: `Triago could not read this email's format. Open it in Gmail: https://mail.google.com/mail/u/0/#all/${encodeURIComponent(id)}`,
        receivedAt,
        hold: 'unreadable'
      });
  return result.status === 'created' ? result.ticketId : null;
}

/** Background job: queues one sync per connected organisation, so one slow mailbox can't hold up the rest. */
export async function syncAllMailboxes(): Promise<void> {
  const rows = await prisma.gmailConnection.findMany({ select: { orgId: true } });
  for (const { orgId } of rows) {
    await enqueue(SYNC_GMAIL_ORG, { orgId }, ({ orgId }) => syncOneMailbox(orgId), { singletonKey: orgId });
  }
}

/** One organisation's scheduled sync. Errors are logged, not thrown: the next run tries again. */
export async function syncOneMailbox(orgId: string): Promise<void> {
  try {
    const { imported } = await syncGmail(orgId);
    if (imported.length) logger.info({ orgId, imported: imported.length }, 'Imported Gmail messages');
  } catch (error) {
    logger.warn({ orgId, err: safeError(error) }, 'Gmail sync failed');
  }
}

export interface BackfillJob {
  orgId: string;
  days: number;
  pageToken: string | null;
}

/** Starts importing older mail (up to `days` back) in the background, one page per job. */
export async function startBackfill(orgId: string, days: number): Promise<void> {
  if (!(await isConnected(orgId))) throw new HttpError(409, 'GMAIL_NOT_CONNECTED', 'Connect Gmail in Settings first.');
  await enqueue<BackfillJob>(GMAIL_BACKFILL, { orgId, days, pageToken: null }, runBackfill, { singletonKey: orgId });
}

/**
 * One page of a backfill: saves up to 100 older emails, then queues the next page.
 * Without a job queue (tests), it walks every page inline.
 */
export async function runBackfill(job: BackfillJob): Promise<void> {
  const { token, settings } = await openMailbox(job.orgId);
  const page = await google.listMessages(token, searchQuery(settings, job.days), BACKFILL_PAGE, job.pageToken);
  for (const id of await unseen(job.orgId, page.ids)) await importMessage(job.orgId, token, id);
  logger.info({ orgId: job.orgId, page: page.ids.length, more: page.nextPageToken !== null }, 'Gmail backfill page');
  if (page.nextPageToken) {
    await enqueue<BackfillJob>(GMAIL_BACKFILL, { ...job, pageToken: page.nextPageToken }, runBackfill);
  }
}
