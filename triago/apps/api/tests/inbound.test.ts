import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { prisma } from '../src/lib/db.js';
import { headerValue, parseFromHeader, toPayload } from '../src/modules/inbound/sendgrid.js';

const app = createApp();
const SECRET = 'test-inbound-secret-that-is-long-enough';
const WEBHOOK = `/api/inbound/sendgrid/${SECRET}`;

beforeEach(async () => {
  await prisma.$executeRawUnsafe('truncate organisations, users cascade');
});

afterAll(async () => {
  await prisma.$disconnect();
});

async function signUp() {
  const res = await request(app)
    .post('/api/auth/register')
    .send({ name: 'Ada', email: 'ada@example.com', password: 'long-enough-password', organisation: 'Acme' })
    .expect(201);
  const token = res.body.accessToken as string;
  const org = await request(app).get('/api/org').set('Authorization', `Bearer ${token}`).expect(200);
  return { token, address: org.body.org.inboundAddress as string };
}

const rawEmail = (to: string, messageId = '<abc123@harbor.dev>') =>
  [
    'From: Grace Liu <grace@harbor.dev>',
    `To: ${to}`,
    'Subject: Charged twice for October',
    `Message-ID: ${messageId}`,
    'Content-Type: text/plain; charset=utf-8',
    '',
    'Our card was charged twice for invoice INV-2291. Please refund the duplicate.'
  ].join('\r\n');

/** Posts the form SendGrid sends with "POST the raw, full MIME message" enabled. */
function deliverRaw(to: string, fields: Record<string, string> = {}, url = WEBHOOK) {
  const req = request(app)
    .post(url)
    .field('email', rawEmail(to))
    .field('envelope', JSON.stringify({ to: [to], from: 'grace@harbor.dev' }))
    .field('charsets', JSON.stringify({ to: 'UTF-8', from: 'UTF-8', subject: 'UTF-8' }));
  for (const [name, value] of Object.entries(fields)) req.field(name, value);
  return req;
}

const queue = async (token: string) =>
  (await request(app).get('/api/tickets?status=new').set('Authorization', `Bearer ${token}`).expect(200)).body
    .tickets as { id: string; title: string; category: string; requester: { name: string; email: string } }[];

describe('inbound email (SendGrid)', () => {
  it('gives each organisation an address on the inbound domain', async () => {
    const { address } = await signUp();
    expect(address).toMatch(/^[0-9a-f]{10}@in\.triago\.test$/);
  });

  it('turns a raw MIME email into a drafted ticket, once', async () => {
    const { token, address } = await signUp();

    const first = await deliverRaw(address).expect(201);
    expect(first.body).toMatchObject({ status: 'created', classifier: 'keywords' });
    expect(await queue(token)).toMatchObject([
      {
        title: 'Charged twice for October',
        category: 'billing',
        requester: { name: 'Grace Liu', email: 'grace@harbor.dev' }
      }
    ]);

    // SendGrid retries on errors; the same Message-ID is recognised.
    await deliverRaw(address)
      .expect(200)
      .expect((res) => expect(res.body.status).toBe('duplicate'));
    expect(await prisma.ticket.count()).toBe(1);
  });

  it('also accepts the default parsed format', async () => {
    const { token, address } = await signUp();
    await request(app)
      .post(WEBHOOK)
      .field('from', 'Sam Ruiz <sam@fernway.io>')
      .field('to', address)
      .field('subject', 'Password reset email never arrives')
      .field('text', 'I tried three times today and nothing arrives.')
      .field('headers', 'Subject: Password reset email never arrives\nMessage-ID:\n <reset-1@fernway.io>\n')
      .field('envelope', JSON.stringify({ to: [address], from: 'sam@fernway.io' }))
      .expect(201);

    const [ticket] = await queue(token);
    expect(ticket).toMatchObject({ title: 'Password reset email never arrives', requester: { name: 'Sam Ruiz' } });
    expect(await prisma.ticket.findFirst({ select: { externalId: true } })).toEqual({
      externalId: 'inbound:<reset-1@fernway.io>'
    });
  });

  it('answers a wrong token like any unknown path', async () => {
    const { address } = await signUp();
    await deliverRaw(address, {}, '/api/inbound/sendgrid/wrong-token').expect(404);
    await deliverRaw(address, {}, `/api/inbound/sendgrid/${SECRET}x`).expect(404);
    expect(await prisma.ticket.count()).toBe(0);
  });

  it('drops mail SendGrid should not retry: unknown address, other domain, spam', async () => {
    const { address } = await signUp();
    await deliverRaw('nobody1234@in.triago.test')
      .expect(200)
      .expect((res) => expect(res.body.status).toBe('ignored'));
    await deliverRaw('someone@example.com')
      .expect(200)
      .expect((res) => expect(res.body).toEqual({ status: 'dropped', reason: 'no_recipient' }));
    await deliverRaw(address, { spam_score: '7.2' })
      .expect(200)
      .expect((res) => expect(res.body.reason).toBe('spam'));
    expect(await prisma.ticket.count()).toBe(0);
  });
});

describe('SendGrid field parsing', () => {
  it('decodes fields with the charset SendGrid reports', async () => {
    const payload = await toPayload({
      envelope: Buffer.from(JSON.stringify({ to: ['abc@in.triago.test'], from: 'a@b.co' })),
      charsets: Buffer.from(JSON.stringify({ text: 'iso-8859-1', subject: 'UTF-8' })),
      from: Buffer.from('Zoë <zoe@b.co>'),
      subject: Buffer.from('Café menu', 'utf8'),
      text: Buffer.from('Le café est fermé', 'latin1')
    });
    expect(payload).toMatchObject({ subject: 'Café menu', text: 'Le café est fermé', from: { name: 'Zoë' } });
  });

  it('reads display names and folded headers', () => {
    expect(parseFromHeader('"Liu, Grace" <grace@harbor.dev>')).toEqual({
      name: 'Liu, Grace',
      address: 'grace@harbor.dev'
    });
    expect(parseFromHeader('grace@harbor.dev')).toEqual({ name: '', address: 'grace@harbor.dev' });
    expect(headerValue('Message-ID:\r\n <x@y>\r\nSubject: hi', 'message-id')).toBe('<x@y>');
  });
});
