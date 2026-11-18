import crypto from 'node:crypto';
import { z } from 'zod';
import { config } from '../../config.js';
import { Prisma } from '../../generated/prisma/client.js';
import { prisma } from '../../lib/db.js';
import { logger } from '../../lib/logger.js';
import { draftTicket } from '../emails/llm-classifier.js';
import { insertTicket } from '../tickets/tickets.service.js';

/** One inbound email, normalised from the provider's webhook (see sendgrid.ts). */
export const InboundEmailPayload = z.object({
  /** The envelope recipient: <slug>@INBOUND_EMAIL_DOMAIN. */
  to: z.email().max(320),
  from: z.object({
    email: z.email().max(320),
    name: z.string().trim().max(200).default('')
  }),
  subject: z.string().trim().max(998).default(''),
  /** Plain-text body; HTML-only mail is converted to text first. */
  text: z.string().max(100_000, 'Email body is too long.'),
  messageId: z.string().trim().max(998).optional()
});
export type InboundEmailPayload = z.infer<typeof InboundEmailPayload>;

export type InboundResult =
  | { status: 'created'; ticketId: string; classifier: string }
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

  const externalId = `inbound:${email.messageId ?? contentHash(email)}`;
  // Check before classifying, so a redelivery doesn't pay for a second model call.
  const seen = await prisma.ticket.findFirst({ where: { orgId: org.id, externalId }, select: { id: true } });
  if (seen) return { status: 'duplicate' };

  const subject = email.subject || '(no subject)';
  const draft = await draftTicket({
    fromName: email.from.name,
    fromEmail: email.from.email,
    subject,
    body: email.text
  });

  try {
    const ticketId = await prisma.$transaction((tx) =>
      insertTicket(
        tx,
        org.id,
        {
          title: draft.title || subject,
          summary: draft.summary,
          category: draft.category,
          priority: draft.priority,
          aiConfidence: draft.confidence,
          source: 'email',
          requesterName: email.from.name || email.from.email,
          requesterEmail: email.from.email,
          externalId,
          body: email.text,
          classifier: draft.classifier
        },
        null
      )
    );
    logger.info({ orgId: org.id, ticketId, classifier: draft.classifier }, 'Inbound email drafted into a ticket');
    return { status: 'created', ticketId, classifier: draft.classifier };
  } catch (error) {
    // The same email arrived twice at once; the other delivery created the ticket.
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') return { status: 'duplicate' };
    throw error;
  }
}

/** Stand-in id for mail without a Message-ID header. */
function contentHash(email: InboundEmailPayload): string {
  return crypto
    .createHash('sha256')
    .update(JSON.stringify([email.from.email, email.subject, email.text]))
    .digest('hex')
    .slice(0, 32);
}
