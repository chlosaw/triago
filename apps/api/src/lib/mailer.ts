import { Resend } from 'resend';
import { config } from '../config.js';
import { logger } from './logger.js';

export interface Mail {
  to: string;
  subject: string;
  text: string;
}

/** Mail "sent" in tests, so they can read the links in it. */
export const testOutbox: Mail[] = [];

const resend = config.mail ? new Resend(config.mail.apiKey) : null;

/**
 * Sends a plain-text email through Resend (RESEND_API_KEY + MAIL_FROM). In
 * development without those, the mail is printed to the console instead; in
 * tests it goes to `testOutbox`. Never throws: a mail failure is logged, and
 * the caller's answer doesn't change.
 */
export async function sendMail(mail: Mail): Promise<void> {
  if (config.env === 'test') {
    testOutbox.push(mail);
    return;
  }
  if (!resend || !config.mail) {
    if (config.isProduction) {
      logger.error('Outgoing mail is not configured (RESEND_API_KEY, MAIL_FROM); an email was not sent');
    } else {
      logger.info({ to: mail.to, subject: mail.subject }, `Email (not sent, no mail provider):\n${mail.text}`);
    }
    return;
  }
  try {
    // Resend reports API errors in the result rather than throwing them.
    const { error } = await resend.emails.send({
      from: config.mail.from,
      to: mail.to,
      subject: mail.subject,
      text: mail.text
    });
    if (error) logger.error({ resendError: error.name, message: error.message }, 'Resend refused an email');
  } catch (error) {
    logger.error({ err: error }, 'Could not reach Resend');
  }
}
