import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';

// The real mailer is replaced, so a test can make delivery succeed or fail.
vi.mock('../src/lib/mailer.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../src/lib/mailer.js')>()),
  sendMail: vi.fn()
}));

const { createApp } = await import('../src/app.js');
const { prisma } = await import('../src/lib/db.js');
const { sendMail } = await import('../src/lib/mailer.js');

const app = createApp();
const send = vi.mocked(sendMail);

beforeEach(async () => {
  await prisma.$executeRawUnsafe('truncate organisations, users cascade');
  send.mockReset();
  send.mockResolvedValue(true);
});

afterAll(async () => {
  await prisma.$disconnect();
});

const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

let counter = 0;
async function signUp() {
  counter += 1;
  const res = await request(app)
    .post('/api/auth/register')
    .send({ name: 'Ada', email: `ada${counter}@example.com`, password: 'long-enough-password', organisation: 'Acme' })
    .expect(201);
  return res.body.accessToken as string;
}

/** Imports one sample email as a ticket; returns its id and the customer's address. */
async function emailTicket(token: string) {
  const { body } = await request(app).post('/api/emails/sync').set(auth(token)).expect(201);
  return { id: body.imported.id as string, email: body.imported.requester.email as string };
}

describe('replying to the customer', () => {
  it('emails the requester, threads under their email, and keeps the reply on the ticket', async () => {
    const token = await signUp();
    const ticket = await emailTicket(token);
    await prisma.ticket.update({ where: { id: ticket.id }, data: { messageId: 'abc123@mail.example.com' } });

    const res = await request(app)
      .post(`/api/tickets/${ticket.id}/replies`)
      .set(auth(token))
      .send({ body: '  Thanks, we are on it.  ' })
      .expect(201);
    expect(res.body).toMatchObject({ sent: true, reply: { kind: 'outbound', body: 'Thanks, we are on it.' } });

    expect(send).toHaveBeenCalledOnce();
    const mail = send.mock.calls[0]![0];
    expect(mail.to).toBe(ticket.email);
    expect(mail.subject).toMatch(/^Re: .+ \[[A-Z]+-1\]$/);
    expect(mail.text).toContain('Thanks, we are on it.');
    expect(mail.headers).toEqual({
      'In-Reply-To': '<abc123@mail.example.com>',
      References: '<abc123@mail.example.com>'
    });
    // Inbound email is configured in tests, so the customer's answer comes back to the organisation.
    expect(mail.replyTo).toMatch(/@in\.triago\.test$/);

    const detail = await request(app).get(`/api/tickets/${ticket.id}`).set(auth(token)).expect(200);
    expect(detail.body.messages.map((m: { kind: string }) => m.kind)).toEqual(['inbound', 'outbound']);
    const events = await request(app).get(`/api/tickets/${ticket.id}/events`).set(auth(token)).expect(200);
    expect(events.body.events.at(-1)).toMatchObject({ type: 'replied', actor: 'Ada', data: { sent: true } });
  });

  it('saves nothing and says so when the email cannot be sent', async () => {
    const token = await signUp();
    const ticket = await emailTicket(token);
    send.mockResolvedValue(false);

    const res = await request(app)
      .post(`/api/tickets/${ticket.id}/replies`)
      .set(auth(token))
      .send({ body: 'Hello' })
      .expect(502);
    expect(res.body.error.code).toBe('MAIL_FAILED');
    expect(await prisma.message.count({ where: { ticketId: ticket.id, kind: 'outbound' } })).toBe(0);
  });

  it('refuses tickets without a customer address, empty replies, and other organisations', async () => {
    const token = await signUp();
    const manual = await request(app).post('/api/tickets').set(auth(token)).send({ title: 'Internal' }).expect(201);
    const noAddress = await request(app)
      .post(`/api/tickets/${manual.body.ticket.id}/replies`)
      .set(auth(token))
      .send({ body: 'Hello' })
      .expect(400);
    expect(noAddress.body.error.code).toBe('NO_REQUESTER');

    const ticket = await emailTicket(token);
    await request(app).post(`/api/tickets/${ticket.id}/replies`).set(auth(token)).send({ body: '   ' }).expect(400);

    const other = await signUp();
    await request(app).post(`/api/tickets/${ticket.id}/replies`).set(auth(other)).send({ body: 'Hi' }).expect(404);
    expect(send).not.toHaveBeenCalled();
  });

  it('never emails the made-up customers in a demo sandbox', async () => {
    const demo = await request(app).post('/api/auth/demo').expect(201);
    const token = demo.body.accessToken as string;
    const ticket = await prisma.ticket.findFirstOrThrow({
      where: { requesterEmail: { not: null } },
      select: { id: true }
    });

    const res = await request(app)
      .post(`/api/tickets/${ticket.id}/replies`)
      .set(auth(token))
      .send({ body: 'Hello' })
      .expect(201);
    expect(res.body.sent).toBe(false);
    expect(send).not.toHaveBeenCalled();
  });
});
