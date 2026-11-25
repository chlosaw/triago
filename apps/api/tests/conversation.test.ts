import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { prisma } from '../src/lib/db.js';
import { storeEmail } from '../src/modules/emails/intake.service.js';
import type { ChatClient } from '../src/modules/emails/llm-classifier.js';
import { draftReply } from '../src/modules/tickets/replies.service.js';

const app = createApp();

beforeEach(async () => {
  await prisma.$executeRawUnsafe('truncate organisations, users cascade');
});

afterAll(async () => {
  await prisma.$disconnect();
});

const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

async function signUp() {
  const res = await request(app)
    .post('/api/auth/register')
    .send({ name: 'Ada Lovelace', email: 'ada@example.com', password: 'long-enough-password', organisation: 'Acme' })
    .expect(201);
  const token = res.body.accessToken as string;
  const me = await request(app).get('/api/auth/me').set(auth(token));
  return { token, orgId: me.body.org.id as string, userId: me.body.user.id as string };
}

/** A ticket from Grace's first email; returns its id and key, e.g. "ACM-1". */
async function firstEmail(orgId: string) {
  const result = await storeEmail(
    orgId,
    {
      externalId: 'inbound:first',
      messageId: '<first@harbor.dev>',
      fromName: 'Grace Hopper',
      fromEmail: 'grace@harbor.dev',
      subject: 'Charged twice',
      text: 'My card was charged twice for INV-2291.'
    },
    { aiEnabled: false }
  );
  if (result.status !== 'created') throw new Error('expected a ticket');
  const ticket = await prisma.ticket.findUniqueOrThrow({
    where: { id: result.ticketId },
    select: { number: true, org: { select: { ticketPrefix: true } } }
  });
  return { id: result.ticketId, key: `${ticket.org.ticketPrefix}-${ticket.number}` };
}

const answer = (key: string, overrides: Partial<Parameters<typeof storeEmail>[1]> = {}) => ({
  externalId: 'inbound:answer',
  messageId: '<answer@harbor.dev>',
  fromName: 'Grace Hopper',
  fromEmail: 'GRACE@harbor.dev',
  subject: `Re: Duplicate charge [${key}]`,
  text: 'Yes, both charges were on 3 November.\n\nOn Tue, 4 Nov 2026 at 10:00, Acme wrote:\n> Which dates?',
  ...overrides
});

describe("the customer's answer to a reply", () => {
  it('lands on the same ticket, without the quoted history, and reopens it', async () => {
    const { token, orgId } = await signUp();
    const ticket = await firstEmail(orgId);
    await request(app).patch(`/api/tickets/${ticket.id}`).set(auth(token)).send({ status: 'waiting' }).expect(200);

    const result = await storeEmail(orgId, answer(ticket.key), { aiEnabled: false });
    expect(result).toEqual({ status: 'appended', ticketId: ticket.id });
    expect(await prisma.ticket.count()).toBe(1);

    const { body } = await request(app).get(`/api/tickets/${ticket.id}`).set(auth(token)).expect(200);
    expect(body.ticket.status).toBe('open');
    expect(body.messages.map((m: { body: string }) => m.body)).toEqual([
      'My card was charged twice for INV-2291.',
      'Yes, both charges were on 3 November.'
    ]);
    const events = await request(app).get(`/api/tickets/${ticket.id}/events`).set(auth(token));
    expect(events.body.events.at(-1)).toMatchObject({
      type: 'customer_replied',
      data: { reopenedFrom: 'waiting' }
    });
  });

  it('is stored once even when it arrives twice', async () => {
    const { orgId } = await signUp();
    const ticket = await firstEmail(orgId);
    await storeEmail(orgId, answer(ticket.key), { aiEnabled: false });
    // Same email through another channel: different channel id, same Message-ID.
    const again = await storeEmail(orgId, answer(ticket.key, { externalId: 'gmail:xyz' }), { aiEnabled: false });
    expect(again).toEqual({ status: 'duplicate' });
    expect(await prisma.message.count({ where: { ticketId: ticket.id } })).toBe(2);
  });

  it('becomes a new ticket when someone else quotes the key', async () => {
    const { orgId } = await signUp();
    const ticket = await firstEmail(orgId);
    const result = await storeEmail(orgId, answer(ticket.key, { fromEmail: 'mallory@evil.test' }), {
      aiEnabled: false
    });
    expect(result.status).toBe('created');
    expect(await prisma.message.count({ where: { ticketId: ticket.id } })).toBe(1);
  });

  it('never threads spam or a key from another organisation', async () => {
    const { orgId } = await signUp();
    const ticket = await firstEmail(orgId);
    const spam = await storeEmail(orgId, answer(ticket.key, { hold: 'spam' }), { aiEnabled: false });
    expect(spam.status).toBe('created');

    const wrongPrefix = await storeEmail(
      orgId,
      answer('ZZZ-1', { externalId: 'inbound:other', messageId: '<other@harbor.dev>' }),
      { aiEnabled: false }
    );
    expect(wrongPrefix.status).toBe('created');
  });
});

describe('AI-drafted replies', () => {
  const model = (content: string | null, finish = 'stop'): ChatClient => ({
    chat: async () => ({ choices: [{ message: { content }, finish_reason: finish }] })
  });

  it('suggests a template reply when no model is configured, and saves nothing', async () => {
    const { token, orgId } = await signUp();
    const ticket = await firstEmail(orgId);
    const { body } = await request(app).post(`/api/tickets/${ticket.id}/reply-draft`).set(auth(token)).expect(200);
    expect(body.engine).toBe('template');
    expect(body.body).toMatch(/^Hi Grace,/);
    expect(await prisma.message.count({ where: { ticketId: ticket.id, kind: 'outbound' } })).toBe(0);
  });

  it("uses the model's reply and sends it the whole thread", async () => {
    const { orgId, userId } = await signUp();
    const ticket = await firstEmail(orgId);
    let sent = '';
    const groq: ChatClient = {
      chat: async (request) => {
        sent = request.messages[1]!.content;
        return {
          choices: [
            {
              message: { content: JSON.stringify({ reply: 'Hi Grace, we refunded one charge.' }) },
              finish_reason: 'stop'
            }
          ]
        };
      }
    };
    const draft = await draftReply({ orgId, userId, role: 'admin' }, ticket.id, groq);
    expect(draft).toEqual({ body: 'Hi Grace, we refunded one charge.', engine: 'ai' });
    expect(sent).toContain('charged twice for INV-2291');
  });

  it('falls back to the template when the model fails or answers junk', async () => {
    const { orgId, userId } = await signUp();
    const ticket = await firstEmail(orgId);
    const who = { orgId, userId, role: 'admin' as const };
    const failing: ChatClient = {
      chat: async () => {
        throw new Error('timeout');
      }
    };
    for (const groq of [failing, model('not json'), model('{"reply": ""}'), model(null, 'length')]) {
      const draft = await draftReply(who, ticket.id, groq);
      expect(draft).toMatchObject({ engine: 'template', aiFailed: true });
      expect(draft.body).toMatch(/^Hi Grace,/);
    }
  });

  it('refuses tickets with no customer and other organisations', async () => {
    const { token } = await signUp();
    const manual = await request(app).post('/api/tickets').set(auth(token)).send({ title: 'Internal' }).expect(201);
    await request(app).post(`/api/tickets/${manual.body.ticket.id}/reply-draft`).set(auth(token)).expect(400);
    await request(app)
      .post('/api/tickets/00000000-0000-4000-8000-000000000000/reply-draft')
      .set(auth(token))
      .expect(404);
  });
});
