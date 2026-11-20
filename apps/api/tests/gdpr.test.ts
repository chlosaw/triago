import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { applyRetention } from '../src/jobs/data-retention.js';
import { prisma } from '../src/lib/db.js';

const app = createApp();
const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

beforeEach(async () => {
  await prisma.$executeRawUnsafe('truncate organisations, users cascade');
});

afterAll(async () => {
  await prisma.$disconnect();
});

let counter = 0;
async function signUp(organisation: string) {
  counter += 1;
  const res = await request(app)
    .post('/api/auth/register')
    .send({ name: 'Ada', email: `ada${counter}@example.com`, password: 'long-enough-password', organisation })
    .expect(201);
  const token = res.body.accessToken as string;
  const me = await request(app).get('/api/auth/me').set(auth(token));
  return { token, orgId: me.body.org.id as string, userId: me.body.user.id as string };
}

async function ticketWithEverything(token: string) {
  const { body } = await request(app).post('/api/tickets').set(auth(token)).send({ title: 'Personal data' });
  const id = body.ticket.id as string;
  await request(app).post(`/api/tickets/${id}/notes`).set(auth(token)).send({ body: 'A note' });
  await request(app)
    .post(`/api/tickets/${id}/attachments`)
    .set(auth(token))
    .set('Content-Type', 'application/octet-stream')
    .set('X-Filename', 'a.txt')
    .send(Buffer.from('file'));
  return id;
}

describe('deleting an organisation', () => {
  it('removes all its data and members, and leaves other organisations alone', async () => {
    const a = await signUp('Company A');
    const b = await signUp('Company B');
    await ticketWithEverything(a.token);
    const bTicket = await ticketWithEverything(b.token);
    // A member of A who also belongs to B keeps their account.
    await prisma.membership.create({ data: { orgId: a.orgId, userId: b.userId, role: 'agent' } });

    await request(app).delete('/api/org').set(auth(a.token)).send({ confirmName: 'Company A' }).expect(204);

    expect(await prisma.organisation.findUnique({ where: { id: a.orgId } })).toBeNull();
    for (const table of ['ticket', 'message', 'attachment', 'ticketEvent', 'refreshToken'] as const) {
      // @ts-expect-error -- every one of these models has orgId
      expect(await prisma[table].count({ where: { orgId: a.orgId } }), table).toBe(0);
    }
    expect(await prisma.user.findUnique({ where: { id: a.userId } })).toBeNull();
    expect(await prisma.user.findUnique({ where: { id: b.userId } })).not.toBeNull();

    // Company B is untouched.
    await request(app).get(`/api/tickets/${bTicket}`).set(auth(b.token)).expect(200);
    expect(await prisma.attachment.count({ where: { orgId: b.orgId } })).toBe(1);
  });

  it('needs the exact name and an admin', async () => {
    const a = await signUp('Company A');
    await request(app).delete('/api/org').set(auth(a.token)).send({ confirmName: 'Company' }).expect(400);

    await prisma.membership.update({
      where: { orgId_userId: { orgId: a.orgId, userId: a.userId } },
      data: { role: 'agent' }
    });
    // The role is read from the database for writes (see the membership check), so this is refused at once.
    await request(app).delete('/api/org').set(auth(a.token)).send({ confirmName: 'Company A' }).expect(403);
    expect(await prisma.organisation.count()).toBe(1);
  });
});

describe('data retention', () => {
  it('deletes closed tickets past the retention period, and keeps open or recent ones', async () => {
    const a = await signUp('Company A');
    const b = await signUp('Company B');
    await request(app).patch('/api/org/settings').set(auth(a.token)).send({ retentionDays: 90 }).expect(200);

    const oldClosed = await ticketWithEverything(a.token);
    const oldOpen = await ticketWithEverything(a.token);
    const recentClosed = await ticketWithEverything(a.token);
    const bOldClosed = await ticketWithEverything(b.token); // B keeps everything (retention off)
    for (const id of [oldClosed, recentClosed, bOldClosed]) {
      await request(app)
        .patch(`/api/tickets/${id}`)
        .set(auth(id === bOldClosed ? b.token : a.token))
        .send({ status: 'closed' });
    }
    await prisma.$executeRaw`update tickets set updated_at = now() - interval '100 days'
                              where id in (${oldClosed}::uuid, ${oldOpen}::uuid, ${bOldClosed}::uuid)`;

    const { tickets } = await applyRetention();
    expect(tickets).toBe(1);
    const left = (await prisma.ticket.findMany({ select: { id: true } })).map((t) => t.id).sort();
    expect(left).toEqual([oldOpen, recentClosed, bOldClosed].sort());
    expect(await prisma.attachment.count({ where: { ticketId: oldClosed } })).toBe(0);
  });

  it('rejects a retention period that is not offered', async () => {
    const a = await signUp('Company A');
    await request(app).patch('/api/org/settings').set(auth(a.token)).send({ retentionDays: 7 }).expect(400);
  });

  it('removes session tokens that can no longer be used', async () => {
    const a = await signUp('Company A');
    const familyId = crypto.randomUUID();
    await prisma.refreshToken.createMany({
      data: [
        { userId: a.userId, orgId: a.orgId, familyId, tokenHash: 'expired', expiresAt: new Date(Date.now() - 1000) },
        {
          userId: a.userId,
          orgId: a.orgId,
          familyId,
          tokenHash: 'revoked-long-ago',
          expiresAt: new Date(Date.now() + 1e9),
          revokedAt: new Date(Date.now() - 40 * 86_400_000)
        },
        {
          userId: a.userId,
          orgId: a.orgId,
          familyId,
          tokenHash: 'revoked-recently',
          expiresAt: new Date(Date.now() + 1e9),
          revokedAt: new Date()
        }
      ]
    });
    const { tokens } = await applyRetention();
    expect(tokens).toBe(2);
    // The sign-up session and the recently revoked one (kept to spot reuse) remain.
    expect(await prisma.refreshToken.count()).toBe(2);
  });
});

describe('membership is re-checked for every change', () => {
  it('locks out a removed member straight away, even with a token that has not expired', async () => {
    const a = await signUp('Company A');
    const { body } = await request(app).post('/api/tickets').set(auth(a.token)).send({ title: 'T' }).expect(201);
    await prisma.membership.delete({ where: { orgId_userId: { orgId: a.orgId, userId: a.userId } } });

    await request(app).patch(`/api/tickets/${body.ticket.id}`).set(auth(a.token)).send({ title: 'X' }).expect(401);
    await request(app).post('/api/tickets').set(auth(a.token)).send({ title: 'New' }).expect(401);
  });
});

describe('attachment limits', () => {
  it('lets only the uploader or an admin delete a file', async () => {
    const a = await signUp('Company A');
    const ticket = await ticketWithEverything(a.token);
    const [file] = await prisma.attachment.findMany({ where: { ticketId: ticket } });

    // A second member of A, as an agent.
    const agent = await signUp('Agent home');
    await prisma.membership.create({ data: { orgId: a.orgId, userId: agent.userId, role: 'agent' } });
    // Sign-in picks the oldest membership (their own org), so sign a token for A directly.
    const { signAccessToken } = await import('../src/middleware/auth.js');
    const agentInA = signAccessToken({ userId: agent.userId, orgId: a.orgId, role: 'agent' });

    await request(app).delete(`/api/tickets/${ticket}/attachments/${file!.id}`).set(auth(agentInA)).expect(403);
    await request(app).delete(`/api/tickets/${ticket}/attachments/${file!.id}`).set(auth(a.token)).expect(204);
  });

  it('refuses uploads past the organisation storage quota', async () => {
    const a = await signUp('Company A');
    const ticket = await ticketWithEverything(a.token);
    // Pretend the org already stores almost 500 MB.
    await prisma.attachment.updateMany({ where: { orgId: a.orgId }, data: { size: 500 * 1024 * 1024 - 2 } });

    const res = await request(app)
      .post(`/api/tickets/${ticket}/attachments`)
      .set(auth(a.token))
      .set('Content-Type', 'application/octet-stream')
      .set('X-Filename', 'b.txt')
      .send(Buffer.from('more'))
      .expect(409);
    expect(res.body.error.code).toBe('STORAGE_FULL');
  });
});
