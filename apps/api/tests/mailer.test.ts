import { beforeEach, describe, expect, it, vi } from 'vitest';

// Pretend we're in production with Resend configured; the real Resend client is replaced.
const send = vi.hoisted(() => vi.fn());
vi.mock('resend', () => ({
  Resend: class {
    constructor(readonly apiKey: string) {}
    emails = { send };
  }
}));
vi.mock('../src/config.js', () => ({
  config: {
    env: 'production',
    isProduction: true,
    mail: { apiKey: 're_test_key', from: 'Triago <no-reply@triago.test>' }
  }
}));

const { sendMail } = await import('../src/lib/mailer.js');
const { logger } = await import('../src/lib/logger.js');

beforeEach(() => {
  send.mockReset();
});

const mail = { to: 'sam@acme.test', subject: 'Reset your Triago password', text: 'Link: https://x' };

describe('sending email through Resend', () => {
  it('sends a plain-text email from MAIL_FROM', async () => {
    send.mockResolvedValue({ data: { id: 'email_1' }, error: null });
    await expect(sendMail(mail)).resolves.toBe(true);
    expect(send).toHaveBeenCalledWith({
      from: 'Triago <no-reply@triago.test>',
      to: 'sam@acme.test',
      subject: 'Reset your Triago password',
      text: 'Link: https://x'
    });
  });

  it('logs an error Resend returns, without throwing', async () => {
    send.mockResolvedValue({ data: null, error: { name: 'validation_error', message: 'Domain not verified' } });
    const error = vi.spyOn(logger, 'error').mockImplementation(() => undefined);
    await expect(sendMail(mail)).resolves.toBe(false);
    expect(error).toHaveBeenCalledWith(
      { resendError: 'validation_error', message: 'Domain not verified' },
      'Resend refused an email'
    );
    error.mockRestore();
  });

  it('logs a network failure, without throwing', async () => {
    send.mockRejectedValue(new Error('ECONNRESET'));
    const error = vi.spyOn(logger, 'error').mockImplementation(() => undefined);
    await expect(sendMail(mail)).resolves.toBe(false);
    expect(error).toHaveBeenCalledWith(expect.objectContaining({ err: expect.any(Error) }), 'Could not reach Resend');
    error.mockRestore();
  });
});
