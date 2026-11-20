import { describe, expect, it } from 'vitest';
import { logUrl } from '../src/app.js';
import { Prisma } from '../src/generated/prisma/client.js';
import { safeError } from '../src/middleware/error-handler.js';

describe('what reaches the logs', () => {
  it('drops query strings and the inbound webhook secret from request paths', () => {
    expect(logUrl('/api/tickets?q=grace%40harbor.dev&status=new')).toBe('/api/tickets');
    expect(logUrl('/api/gmail/callback?code=secret-code&state=abc')).toBe('/api/gmail/callback');
    expect(logUrl('/api/inbound/sendgrid/the-secret?x=1')).toBe('/api/inbound/sendgrid/[redacted]');
  });

  it("keeps Prisma's error code but not its message, which can quote email content", () => {
    const error = new Prisma.PrismaClientKnownRequestError(
      'Invalid `prisma.message.create()` invocation: { body: "Customer card 4111 1111 1111 1111" }',
      { code: 'P2000', clientVersion: 'test', meta: { modelName: 'Message' } }
    );
    const logged = safeError(error);
    expect(logged).toMatchObject({ type: 'PrismaClientKnownRequestError', code: 'P2000', model: 'Message' });
    expect(JSON.stringify(logged)).not.toMatch(/4111|Customer/);
  });

  it('passes other errors through unchanged', () => {
    const error = new Error('boom');
    expect(safeError(error)).toBe(error);
  });
});
