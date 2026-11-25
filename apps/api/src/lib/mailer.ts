import { Resend } from 'resend';
import { config } from '../config.js';
import { logger } from './logger.js';

export interface Mail {
  to: string;
  subject: string;
  text: string;
  /** Where the recipient's answer should go, e.g. the organisation's inbound address. */
  replyTo?: string;
  /** Extra headers, e.g. In-Reply-To and References so a reply threads under the customer's email. */
  headers?: Record<string, string>;
}

/** Mail "sent" in tests, so they can read the links in it. */
export const testOutbox: Mail[] = [];

const resend = config.mail ? new Resend(config.mail.apiKey) : null;

/**
 * Sends a plain-text email through Resend (RESEND_API_KEY + MAIL_FROM). In
 * development without those, the mail is printed to the console instead; in
 * tests it goes to `testOutbox`. Never throws: a mail failure is logged and
 * reported as `false`, so callers that must know (a reply to a customer) can
 * say so, and callers that don't (an invitation) can ignore it.
 */
export async function sendMail(mail: Mail): Promise<boolean> {
  if (config.env === 'test') {
    testOutbox.push(mail);
    return true;
  }
  if (!resend || !config.mail) {
    if (config.isProduction) {
      logger.error('Outgoing mail is not configured (RESEND_API_KEY, MAIL_FROM); an email was not sent');
      return false;
    }
    logger.info({ to: mail.to, subject: mail.subject }, `Email (not sent, no mail provider):\n${mail.text}`);
    return true;
  }
  try {
    // Resend reports API errors in the result rather than throwing them.
    const { error } = await resend.emails.send({
      from: config.mail.from,
      to: mail.to,
      subject: mail.subject,
      text: mail.text,
      ...(mail.replyTo ? { replyTo: mail.replyTo } : {}),
      ...(mail.headers ? { headers: mail.headers } : {})
    });
    if (error) {
      logger.error({ resendError: error.name, message: error.message }, 'Resend refused an email');
      return false;
    }
    return true;
  } catch (error) {
    logger.error({ err: error }, 'Could not reach Resend');
    return false;
  }
}
