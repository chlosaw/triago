import type { ReplyResult } from '@triago/shared';
import { config } from '../../config.js';
import { prisma } from '../../lib/db.js';
import { HttpError, notFound } from '../../lib/errors.js';
import { sendMail } from '../../lib/mailer.js';
import type { AuthContext } from '../../middleware/auth.js';
import { toMessage } from './notes.service.js';

// A reply is an outbound message: emailed to the ticket's requester, then kept on
// the ticket. The email goes first, so a reply is only saved if it actually left.

export async function sendReply(auth: AuthContext, ticketId: string, body: string): Promise<ReplyResult> {
  const ticket = await prisma.ticket.findFirst({
    where: { orgId: auth.orgId, id: ticketId },
    select: {
      number: true,
      title: true,
      requesterEmail: true,
      messageId: true,
      org: { select: { name: true, ticketPrefix: true, isDemo: true, inboundSlug: true } }
    }
  });
  if (!ticket) throw notFound('Ticket');
  if (!ticket.requesterEmail) {
    throw new HttpError(400, 'NO_REQUESTER', 'This ticket has no customer email address to reply to.');
  }
  const agent = await prisma.user.findUniqueOrThrow({ where: { id: auth.userId }, select: { name: true } });

  // Demo sandboxes hold made-up customers: save the reply, but never email anyone.
  const sent = !ticket.org.isDemo;
  if (sent) {
    const key = `${ticket.org.ticketPrefix}-${ticket.number}`;
    const delivered = await sendMail({
      to: ticket.requesterEmail,
      subject: `Re: ${ticket.title} [${key}]`,
      text: `${body}\n\n${agent.name}\n${ticket.org.name}`,
      // With an inbound address set up, the customer's answer comes back into Triago.
      ...(config.inboundEmailDomain && config.inboundWebhookSecret
        ? { replyTo: `${ticket.org.inboundSlug}@${config.inboundEmailDomain}` }
        : {}),
      ...threadHeaders(ticket.messageId)
    });
    if (!delivered) {
      throw new HttpError(502, 'MAIL_FAILED', 'The reply could not be sent. Nothing was saved; try again.');
    }
  }

  const reply = await prisma.$transaction(async (tx) => {
    const message = await tx.message.create({
      data: {
        orgId: auth.orgId,
        ticketId,
        kind: 'outbound',
        authorId: auth.userId,
        fromName: agent.name,
        body
      }
    });
    await tx.ticketEvent.create({
      data: {
        orgId: auth.orgId,
        ticketId,
        actorId: auth.userId,
        type: 'replied',
        data: { messageId: message.id, sent }
      }
    });
    return message;
  });
  return { reply: toMessage(reply), sent };
}

/**
 * In-Reply-To and References, so the reply threads under the customer's email in
 * their mail app. Message-IDs are stored without angle brackets; line breaks are
 * dropped so a stored id can never start a new header.
 */
function threadHeaders(messageId: string | null): { headers?: Record<string, string> } {
  const id = messageId?.replace(/[\r\n<>]/g, '').trim();
  if (!id) return {};
  return { headers: { 'In-Reply-To': `<${id}>`, References: `<${id}>` } };
}
