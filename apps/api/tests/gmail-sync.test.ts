import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';

// Gmail's API is replaced by a fake mailbox; everything else is real.
const mailbox = vi.hoisted(() => ({ messages: new Map<string, string>(), pages: [] as string[][] }));
vi.mock('../src/modules/gmail/google.js', async (original) => {
  const real = await original<typeof import('../src/modules/gmail/google.js')>();
  return {
    ...real,
    accessToken: async () => 'access-token',
    listMessages: async (_token: string, _query: string, _max: number, pageToken?: string | null) => {
      if (mailbox.pages.length) {
        const index = pageToken ? Number(pageToken) : 0;
        return {
          ids: mailbox.pages[index] ?? [],
          nextPageToken: index + 1 < mailbox.pages.length ? String(index + 1) : null
        };
      }
      return { ids: [...mailbox.messages.keys()].reverse(), nextPageToken: null };
    },
    getRawMessage: async (_token: string, id: string) => ({
      raw: Buffer.from(mailbox.messages.get(id) ?? ''),
      internalDate: new Date('2026-11-01T10:00:00Z')
    })
  };
});

const { createApp } = await import('../src/app.js');
const { prisma } = await import('../src/lib/db.js');
const { encrypt } = await import('../src/modules/gmail/crypto.js');
const { runBackfill, syncGmail } = await import('../src/modules/gmail/gmail.service.js');

const app = createApp();

beforeEach(async () => {
  await prisma.$executeRawUnsafe('truncate organisations, users cascade');
  mailbox.messages.clear();
  mailbox.pages = [];
});

afterAll(async () => {
  await prisma.$disconnect();
});

async function connectedOrg() {
  const res = await request(app)
    .post('/api/auth/register')
    .send({ name: 'Ada', email: 'ada@example.com', password: 'long-enough-password', organisation: 'Acme' })
    .expect(201);
  const me = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${res.body.accessToken}`);
  const orgId = me.body.org.id as string;
  await prisma.gmailConnection.create({
    data: { orgId, email: 'support@acme.test', refreshToken: encrypt('refresh-token') }
  });
  return { orgId, token: res.body.accessToken as string };
}

const mime = (id: string, subject: string) =>
  [`From: Sam <sam@fernway.io>`, `Subject: ${subject}`, `Message-ID: <${id}@fernway.io>`, '', `Body of ${id}`].join(
    '\r\n'
  );

describe('Gmail import', () => {
  it('imports each message once', async () => {
    const { orgId } = await connectedOrg();
    mailbox.messages.set('m1', mime('m1', 'Password reset never arrives'));
    mailbox.messages.set('m2', mime('m2', 'Export fails'));

    expect((await syncGmail(orgId)).imported).toHaveLength(2);
    expect((await syncGmail(orgId)).imported).toHaveLength(0);
    expect(await prisma.ticket.count()).toBe(2);
  });

  it('saves an unparseable message as a placeholder ticket instead of retrying it forever', async () => {
    const { orgId } = await connectedOrg();
    mailbox.messages.set('broken', '');
    const PostalMime = (await import('postal-mime')).default;
    const parse = vi.spyOn(PostalMime, 'parse').mockRejectedValueOnce(new Error('bad MIME'));

    expect((await syncGmail(orgId)).imported).toHaveLength(1);
    const ticket = await prisma.ticket.findFirstOrThrow();
    expect(ticket).toMatchObject({
      title: '(unreadable email)',
      manualTriage: 'unreadable',
      externalId: 'gmail:broken'
    });

    // The next sync doesn't fetch it again.
    expect((await syncGmail(orgId)).imported).toHaveLength(0);
    parse.mockRestore();
  });

  it('backfills older mail page by page', async () => {
    const { orgId } = await connectedOrg();
    for (const id of ['a', 'b', 'c']) mailbox.messages.set(id, mime(id, `Old ${id}`));
    mailbox.pages = [['c', 'b'], ['a']];

    await runBackfill({ orgId, days: 90, pageToken: null });
    expect(await prisma.ticket.count()).toBe(3);
  });

  it('starts a backfill from the API for admins only, and only with Gmail connected', async () => {
    const { token } = await connectedOrg();
    mailbox.messages.set('a', mime('a', 'Old'));
    await request(app)
      .post('/api/gmail/backfill')
      .set('Authorization', `Bearer ${token}`)
      .send({ days: 30 })
      .expect(202);
    await request(app)
      .post('/api/gmail/backfill')
      .set('Authorization', `Bearer ${token}`)
      .send({ days: 7 })
      .expect(400);
  });
});
