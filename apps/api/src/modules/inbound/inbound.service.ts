import crypto from 'node:crypto';
import { MANUAL_TRIAGE_REASONS } from '@triago/shared';
import { z } from 'zod';
import { config } from '../../config.js';
import { prisma } from '../../lib/db.js';
import { logger } from '../../lib/logger.js';
import { storeEmail, type HoldReason } from '../emails/intake.service.js';

/** One inbound email, normalised from the provider's webhook (see sendgrid.ts). */
export const InboundEmailPayload = z.object({
  /** The envelope recipient: <slug>@INBOUND_EMAIL_DOMAIN. */
  to: z.email().max(320),
  from: z.object({
    /** Empty when the sender's address is missing or malformed; the email is kept anyway. */
    email: z.union([z.email().max(320), z.literal('')]),
    name: z.string().trim().max(200).default('')
  }),
  subject: z.string().trim().max(998).default(''),
  /** Plain-text body; HTML-only mail is converted to text first. Cut to size when stored. */
  text: z.string(),
  messageId: z.string().trim().max(998).optional(),
  /** Keep the email but don't send it to the AI (spam, too large, unreadable, over the hourly budget). */
  hold: z.enum(MANUAL_TRIAGE_REASONS).optional()
});
export type InboundEmailPayload = z.infer<typeof InboundEmailPayload>;

export type InboundResult =
  | { status: 'created'; ticketId: string; manualTriage: string | null }
  | { status: 'duplicate' }
  | { status: 'ignored'; reason: 'unknown_recipient' };

/** The organisation slug an address points at, or null for another domain. */
export function slugFromAddress(address: string): string | null {
  const [local, domain] = address.toLowerCase().split('@');
  if (!local || !domain || domain !== config.inboundEmailDomain) return null;
  return local;
}

/**
 * Turns an inbound email into a drafted ticket in the recipient's organisation.
 * Unknown recipients are ignored rather than refused, so the endpoint does not
 * reveal which addresses exist. Redelivered emails are recognised by Message-ID.
 */
export async function receiveEmail(email: InboundEmailPayload): Promise<InboundResult> {
  const slug = slugFromAddress(email.to);
  const org = slug
    ? await prisma.organisation.findUnique({ where: { inboundSlug: slug }, select: { id: true } })
    : null;
  if (!org) return { status: 'ignored', reason: 'unknown_recipient' };

  const result = await storeEmail(org.id, {
    externalId: `inbound:${email.messageId ?? contentHash(email)}`,
    messageId: email.messageId,
    fromName: email.from.name,
    fromEmail: email.from.email || null,
    subject: email.subject,
    text: email.text,
    hold: email.hold as HoldReason | undefined
  });
  if (result.status === 'created') {
    logger.info({ orgId: org.id, ticketId: result.ticketId, manualTriage: result.manualTriage }, 'Inbound email saved');
  }
  return result;
}

/** Stand-in id for mail without a Message-ID header. */
function contentHash(email: InboundEmailPayload): string {
  return crypto
    .createHash('sha256')
    .update(JSON.stringify([email.from.email, email.subject, email.text]))
    .digest('hex')
    .slice(0, 32);
}
