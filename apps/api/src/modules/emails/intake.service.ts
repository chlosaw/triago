import type { ManualTriageReason } from '@triago/shared';
import { Prisma } from '../../generated/prisma/client.js';
import { DRAFT_TICKET, enqueue } from '../../jobs/queue.js';
import { prisma } from '../../lib/db.js';
import { logger } from '../../lib/logger.js';
import { safeError } from '../../middleware/error-handler.js';
import { applyAiDraft, insertTicket } from '../tickets/tickets.service.js';
import { classify } from './classifier.js';
import { aiConfigured, draftTicket, type ChatClient } from './llm-classifier.js';
import { looksLikePromptInjection } from './prepare.js';

/**
 * The one way an email becomes a ticket, whatever channel it came from.
 *
 * The rule: an email is never lost. It is saved as a ticket first, with an
 * instant keyword draft, before anything that can fail or be slow. The AI
 * draft then runs as a background job and improves the ticket if nobody has
 * edited it yet. Mail that the AI should not see (over a limit, spam,
 * unreadable) is still saved, with a reason a person can see.
 */

/** Longest email text stored on a ticket; anything past it is cut with a note. */
export const MAX_STORED_CHARS = 100_000;

export type HoldReason = Exclude<ManualTriageReason, 'drafting' | 'ai_failed'>;

export interface IncomingEmail {
  /** Channel-specific id, e.g. "gmail:<id>" or "inbound:<message-id>". */
  externalId: string;
  /** The Message-ID header, used to recognise the same email arriving through another channel. */
  messageId?: string | null;
  fromName: string;
  fromEmail: string | null;
  subject: string;
  text: string;
  receivedAt?: Date;
  /** Save without asking the AI, flagged for a person. Spam is filed under Closed. */
  hold?: HoldReason;
}

export type StoreResult =
  { status: 'created'; ticketId: string; manualTriage: ManualTriageReason | null } | { status: 'duplicate' };

export interface DraftJob {
  orgId: string;
  ticketId: string;
  subject: string;
}

/** Message-IDs are compared without angle brackets or case, capped to a sane length. */
export function normaliseMessageId(value: string | null | undefined): string | null {
  const id = value?.trim().replace(/^<|>$/g, '').toLowerCase();
  return id ? id.slice(0, 998) : null;
}

export async function storeEmail(
  orgId: string,
  email: IncomingEmail,
  options: { aiEnabled?: boolean; queueDraft?: (job: DraftJob) => Promise<void> } = {}
): Promise<StoreResult> {
  const messageId = normaliseMessageId(email.messageId);
  const seen = await prisma.ticket.findFirst({
    where: { orgId, OR: [{ externalId: email.externalId }, ...(messageId ? [{ messageId }] : [])] },
    select: { id: true }
  });
  if (seen) return { status: 'duplicate' };

  const subject = email.subject.trim() || '(no subject)';
  let body = email.text.trim() || '(This email has no text.)';
  if (body.length > MAX_STORED_CHARS) {
    body = `${body.slice(0, MAX_STORED_CHARS)}\n\n[Triago: the rest of this email was cut off at ${MAX_STORED_CHARS.toLocaleString('en')} characters.]`;
  }
  const fromEmail = email.fromEmail?.trim() || null;
  const fromName = email.fromName.trim() || fromEmail || 'Unknown sender';

  // Free and instant, so the ticket is useful even if the AI never answers.
  const rules = classify({ fromName, fromEmail: fromEmail ?? '', subject, body });
  const aiEnabled = options.aiEnabled ?? aiConfigured();
  const manualTriage: ManualTriageReason | null = email.hold ?? (aiEnabled ? 'drafting' : null);
  const spam = email.hold === 'spam';

  let ticketId: string;
  try {
    ticketId = await prisma.$transaction((tx) =>
      insertTicket(
        tx,
        orgId,
        {
          title: rules.title || subject,
          summary: rules.summary,
          category: rules.category,
          priority: rules.priority,
          aiConfidence: manualTriage === 'drafting' ? null : rules.confidence,
          status: spam ? 'dismissed' : 'new',
          triagedAt: spam ? new Date() : null,
          source: 'email',
          requesterName: fromName,
          requesterEmail: fromEmail,
          externalId: email.externalId,
          messageId,
          manualTriage,
          receivedAt: email.receivedAt,
          body,
          // The AI's own result is logged on a `drafted` event when it arrives.
          classifier: manualTriage === 'drafting' ? undefined : 'keywords'
        },
        null
      )
    );
  } catch (error) {
    // The same email arrived twice at once; the other delivery saved it.
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') return { status: 'duplicate' };
    throw error;
  }

  if (manualTriage === 'drafting') {
    const job = { orgId, ticketId, subject };
    try {
      await (options.queueDraft ?? queueDraft)(job);
    } catch (error) {
      // The email is saved either way; flag it so a person picks it up.
      logger.warn({ orgId, ticketId, err: safeError(error) }, 'Could not queue the AI draft');
      await prisma.ticket.update({ where: { id: ticketId }, data: { manualTriage: 'ai_failed' } });
    }
  }
  return { status: 'created', ticketId, manualTriage };
}

/** Queues the AI draft; runs it inline when there is no job queue. */
export function queueDraft(job: DraftJob): Promise<void> {
  return enqueue(DRAFT_TICKET, job, (data) => draftWithAi(data), {
    retryLimit: 2,
    retryDelay: 30,
    retryBackoff: true,
    singletonKey: job.ticketId
  });
}

/** The background job: asks the AI for a draft and applies it. Never throws for a model failure. */
export async function draftWithAi(job: DraftJob, groq?: ChatClient | null): Promise<string> {
  const ticket = await prisma.ticket.findFirst({
    where: { orgId: job.orgId, id: job.ticketId },
    select: { manualTriage: true, requesterName: true, requesterEmail: true }
  });
  if (ticket?.manualTriage !== 'drafting') return 'skipped';
  const message = await prisma.message.findFirst({
    where: { orgId: job.orgId, ticketId: job.ticketId, kind: 'inbound' },
    orderBy: { createdAt: 'asc' },
    select: { body: true }
  });

  const draft = await draftTicket(
    {
      fromName: ticket.requesterName,
      fromEmail: ticket.requesterEmail ?? '',
      subject: job.subject,
      body: message?.body ?? ''
    },
    groq,
    { orgId: job.orgId, purpose: 'draft' }
  );
  const injectionSuspected = looksLikePromptInjection(`${job.subject}\n${message?.body ?? ''}`);
  return applyAiDraft(job.orgId, job.ticketId, {
    title: draft.title || job.subject,
    summary: draft.summary,
    category: draft.category,
    priority: draft.priority,
    // A draft the email may have steered is never shown as a confident one.
    aiConfidence: injectionSuspected ? Math.min(draft.confidence, 0.4) : draft.confidence,
    classifier: draft.classifier,
    failed: draft.aiFailed === true,
    injectionSuspected
  });
}
