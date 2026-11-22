import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { applyRetention } from '../src/jobs/data-retention.js';
import { prisma } from '../src/lib/db.js';
import { testOutbox } from '../src/lib/mailer.js';

const app = createApp();
const auth = (token: string) => ({ Authorization: `Bearer ${token}` });
const PASSWORD = 'long-enough-password';

beforeEach(async () => {
  await prisma.$executeRawUnsafe('truncate organisations, users cascade');
  testOutbox.length = 0;
});

afterAll(async () => {
  await prisma.$disconnect();
});

async function register(email: string, organisation: string) {
  const res = await request(app)
    .post('/api/auth/register')
    .send({ name: email.split('@')[0], email, password: PASSWORD, organisation })
    .expect(201);
  const token = res.body.accessToken as string;
  const me = await request(app).get('/api/auth/me').set(auth(token));
  return { token, orgId: me.body.org.id as string, userId: me.body.user.id as string };
}

/** Invites someone and returns the token from the emailed link. */
async function invite(adminToken: string, email: string, role: 'admin' | 'agent' = 'agent') {
  await request(app).post('/api/org/invitations').set(auth(adminToken)).send({ email, role }).expect(201);
  const mail = testOutbox.at(-1)!;
  expect(mail.to).toBe(email);
  return new URL(/https?:\/\/\S+/.exec(mail.text)![0]).searchParams.get('token')!;
}

const accept = (body: object) => request(app).post('/api/auth/invitations/accept').send(body);

describe('inviting teammates', () => {
  it('lets a new person create an account from the link and join as the invited role', async () => {
    const owner = await register('owner@acme.test', 'Acme');
    const token = await invite(owner.token, 'sam@acme.test', 'agent');

    const preview = await request(app).get(`/api/auth/invitations/${token}`).expect(200);
    expect(preview.body).toEqual({
      orgName: 'Acme',
      email: 'sam@acme.test',
      role: 'agent',
      invitedBy: 'owner',
      accountExists: false
    });

    const joined = await accept({ token, name: 'Sam', password: 'sams-new-password' }).expect(200);
    const me = await request(app).get('/api/auth/me').set(auth(joined.body.accessToken)).expect(200);
    expect(me.body).toMatchObject({ org: { name: 'Acme' }, role: 'agent', user: { name: 'Sam' } });

    // The owner now sees two members, so tickets can be assigned to Sam.
    const org = await request(app).get('/api/org').set(auth(owner.token));
    expect(org.body.members.map((m: { name: string }) => m.name).sort()).toEqual(['Sam', 'owner']);
    const { body } = await request(app).post('/api/tickets').set(auth(owner.token)).send({ title: 'T' });
    await request(app)
      .patch(`/api/tickets/${body.ticket.id}`)
      .set(auth(owner.token))
      .send({ assigneeId: me.body.user.id })
      .expect(200);
  });

  it('asks someone with an account for their password, then adds the organisation to their list', async () => {
    const owner = await register('owner@acme.test', 'Acme');
    const existing = await register('jo@elsewhere.test', 'Elsewhere');
    const token = await invite(owner.token, 'jo@elsewhere.test', 'admin');

    expect((await request(app).get(`/api/auth/invitations/${token}`)).body.accountExists).toBe(true);
    await accept({ token, password: 'wrong-password' }).expect(401);
    const joined = await accept({ token, password: PASSWORD }).expect(200);

    const me = await request(app).get('/api/auth/me').set(auth(joined.body.accessToken));
    expect(me.body).toMatchObject({ org: { name: 'Acme' }, role: 'admin' });
    expect(me.body.orgs.map((o: { name: string }) => o.name)).toEqual(['Elsewhere', 'Acme']);

    // And can switch back.
    const switched = await request(app)
      .post('/api/auth/switch-org')
      .set(auth(joined.body.accessToken))
      .send({ orgId: existing.orgId })
      .expect(200);
    const back = await request(app).get('/api/auth/me').set(auth(switched.body.accessToken));
    expect(back.body.org.name).toBe('Elsewhere');
  });

  it('works once, expires, and only the newest link for an address counts', async () => {
    const owner = await register('owner@acme.test', 'Acme');
    const first = await invite(owner.token, 'sam@acme.test');
    const second = await invite(owner.token, 'sam@acme.test');

    await accept({ token: first, name: 'Sam', password: 'sams-new-password' }).expect(400);
    await accept({ token: second, name: 'Sam', password: 'sams-new-password' }).expect(200);
    await accept({ token: second, name: 'Sam', password: 'sams-new-password' }).expect(400);

    const third = await invite(owner.token, 'kim@acme.test');
    await prisma.invitation.updateMany({ where: { email: 'kim@acme.test' }, data: { expiresAt: new Date(0) } });
    await request(app).get(`/api/auth/invitations/${third}`).expect(400);
    await accept({ token: third, name: 'Kim', password: 'kims-new-password' }).expect(400);
  });

  it('lets admins list and revoke pending invitations, and refuses agents', async () => {
    const owner = await register('owner@acme.test', 'Acme');
    const token = await invite(owner.token, 'sam@acme.test');
    const list = await request(app).get('/api/org/invitations').set(auth(owner.token)).expect(200);
    expect(list.body.invitations).toMatchObject([{ email: 'sam@acme.test', role: 'agent', invitedBy: 'owner' }]);

    await request(app).delete(`/api/org/invitations/${list.body.invitations[0].id}`).set(auth(owner.token)).expect(204);
    await accept({ token, name: 'Sam', password: 'sams-new-password' }).expect(400);

    const agentToken = await invite(owner.token, 'agent@acme.test');
    const agent = (await accept({ token: agentToken, name: 'Agent', password: 'agent-password-1' })).body.accessToken;
    await request(app).post('/api/org/invitations').set(auth(agent)).send({ email: 'x@acme.test' }).expect(403);
    await request(app).get('/api/org/invitations').set(auth(agent)).expect(403);
  });

  it('refuses to invite an existing member, and is off in the demo', async () => {
    const owner = await register('owner@acme.test', 'Acme');
    await request(app)
      .post('/api/org/invitations')
      .set(auth(owner.token))
      .send({ email: 'OWNER@acme.test' })
      .expect(409);

    const demo = await request(app).post('/api/auth/demo').expect(201);
    await request(app)
      .post('/api/org/invitations')
      .set(auth(demo.body.accessToken))
      .send({ email: 'stranger@example.com' })
      .expect(403);
    expect(testOutbox).toHaveLength(0);
  });

  it("can't be used to reach another organisation's invitations", async () => {
    const a = await register('a@a.test', 'A');
    const b = await register('b@b.test', 'B');
    await invite(a.token, 'sam@a.test');
    const [row] = await prisma.invitation.findMany();
    await request(app).delete(`/api/org/invitations/${row!.id}`).set(auth(b.token)).expect(404);
    expect((await request(app).get('/api/org/invitations').set(auth(b.token))).body.invitations).toEqual([]);
  });
});

describe('managing members', () => {
  async function teamOfTwo() {
    const owner = await register('owner@acme.test', 'Acme');
    const token = await invite(owner.token, 'sam@acme.test', 'agent');
    const sam = (await accept({ token, name: 'Sam', password: 'sams-new-password' })).body.accessToken as string;
    const samId = (await request(app).get('/api/auth/me').set(auth(sam))).body.user.id as string;
    return { owner, sam, samId };
  }

  it('lets an admin change roles, but never leaves the organisation without an admin', async () => {
    const { owner, samId } = await teamOfTwo();
    await request(app)
      .patch(`/api/org/members/${owner.userId}`)
      .set(auth(owner.token))
      .send({ role: 'agent' })
      .expect(409);

    await request(app).patch(`/api/org/members/${samId}`).set(auth(owner.token)).send({ role: 'admin' }).expect(204);
    await request(app)
      .patch(`/api/org/members/${owner.userId}`)
      .set(auth(owner.token))
      .send({ role: 'agent' })
      .expect(204);
    expect(await prisma.membership.count({ where: { orgId: owner.orgId, role: 'admin' } })).toBe(1);
  });

  it('removes a member: their access ends at once, their tickets are unassigned, their account goes', async () => {
    const { owner, sam, samId } = await teamOfTwo();
    const { body } = await request(app)
      .post('/api/tickets')
      .set(auth(owner.token))
      .send({ title: 'T', assigneeId: samId });

    await request(app).delete(`/api/org/members/${samId}`).set(auth(owner.token)).expect(204);

    await request(app).post('/api/tickets').set(auth(sam)).send({ title: 'Still here?' }).expect(401);
    expect((await prisma.ticket.findUniqueOrThrow({ where: { id: body.ticket.id } })).assigneeId).toBeNull();
    expect(await prisma.user.findUnique({ where: { id: samId } })).toBeNull();
  });

  it('lets an agent leave, but not remove others', async () => {
    const { owner, sam, samId } = await teamOfTwo();
    await request(app).delete(`/api/org/members/${owner.userId}`).set(auth(sam)).expect(403);
    await request(app).delete(`/api/org/members/${samId}`).set(auth(sam)).expect(204);
    expect(await prisma.membership.count({ where: { orgId: owner.orgId } })).toBe(1);
  });

  it('keeps the account of a removed member who belongs to another organisation', async () => {
    const owner = await register('owner@acme.test', 'Acme');
    const jo = await register('jo@elsewhere.test', 'Elsewhere');
    await accept({ token: await invite(owner.token, 'jo@elsewhere.test'), password: PASSWORD }).expect(200);

    await request(app).delete(`/api/org/members/${jo.userId}`).set(auth(owner.token)).expect(204);
    expect(await prisma.user.findUnique({ where: { id: jo.userId } })).not.toBeNull();
    await request(app).get('/api/auth/me').set(auth(jo.token)).expect(200);
  });

  it("can't switch into an organisation you don't belong to", async () => {
    const a = await register('a@a.test', 'A');
    const b = await register('b@b.test', 'B');
    await request(app).post('/api/auth/switch-org').set(auth(a.token)).send({ orgId: b.orgId }).expect(403);
  });

  it('cleans up old invitations at night', async () => {
    const owner = await register('owner@acme.test', 'Acme');
    await invite(owner.token, 'sam@acme.test');
    await prisma.invitation.updateMany({ data: { expiresAt: new Date(Date.now() - 2 * 86_400_000) } });
    expect((await applyRetention()).invitations).toBe(1);
  });
});

describe('reporter and my open tickets', () => {
  it('shows who created a manual ticket as its reporter, and counts my open tickets', async () => {
    const owner = await register('owner@acme.test', 'Acme');
    const created = await request(app)
      .post('/api/tickets')
      .set(auth(owner.token))
      .send({ title: 'Mine', status: 'open', assigneeId: owner.userId })
      .expect(201);
    expect(created.body.ticket.reporter).toEqual({ name: 'owner', email: 'owner@acme.test' });

    await request(app).post('/api/tickets').set(auth(owner.token)).send({ title: 'Unassigned' });
    const closed = await request(app)
      .post('/api/tickets')
      .set(auth(owner.token))
      .send({ title: 'Done', status: 'closed', assigneeId: owner.userId });
    expect(closed.status).toBe(201);

    const stats = await request(app).get('/api/stats').set(auth(owner.token)).expect(200);
    expect(stats.body.mine).toBe(1);
  });

  it("uses the email's sender as the reporter of an email ticket", async () => {
    const owner = await register('owner@acme.test', 'Acme');
    const { body } = await request(app).post('/api/emails/sync').set(auth(owner.token)).expect(201);
    expect(body.imported.reporter).toEqual({
      name: body.imported.requester.name,
      email: body.imported.requester.email
    });
  });
});
