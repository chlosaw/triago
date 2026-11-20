import { config } from '../config.js';
import { logger } from './logger.js';

export interface Mail {
  to: string;
  subject: string;
  text: string;
}

/** Mail "sent" in tests, so they can read the reset link. */
export const testOutbox: Mail[] = [];

/**
 * Sends a plain-text email. Production uses SendGrid's mail send API
 * (SENDGRID_API_KEY + MAIL_FROM). In development without those, the mail is
 * printed to the console instead; in tests it goes to `testOutbox`.
 * Never throws: a mail failure is logged, and the caller's answer doesn't change.
 */
export async function sendMail(mail: Mail): Promise<void> {
  if (config.env === 'test') {
    testOutbox.push(mail);
    return;
  }
  if (!config.mail) {
    if (config.isProduction) {
      logger.error('Outgoing mail is not configured (SENDGRID_API_KEY, MAIL_FROM); an email was not sent');
    } else {
      logger.info({ to: mail.to, subject: mail.subject }, `Email (not sent, no mail provider):\n${mail.text}`);
    }
    return;
  }
  try {
    const response = await fetch('https://api.sendgrid.com/v3/mail/send', {
      method: 'POST',
      headers: { Authorization: `Bearer ${config.mail.apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        personalizations: [{ to: [{ email: mail.to }] }],
        from: { email: config.mail.from, name: 'Triago' },
        subject: mail.subject,
        content: [{ type: 'text/plain', value: mail.text }]
      }),
      signal: AbortSignal.timeout(10_000)
    });
    if (!response.ok) logger.error({ status: response.status }, 'SendGrid refused an email');
  } catch (error) {
    logger.error({ err: error }, 'Could not reach SendGrid');
  }
}
