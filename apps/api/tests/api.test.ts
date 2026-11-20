import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { cleanupDemoSandboxes } from '../src/jobs/cleanup-demo-sandboxes.js';
import { prisma } from '../src/lib/db.js';

const app = createApp();

beforeEach(async () => {
  await prisma.$executeRawUnsafe('truncate organisations, users cascade');
});

afterAll(async () => {
  await prisma.$disconnect();
});

let counter = 0;

/** Registers a new user and organisation; returns an authed agent plus the raw cookie. */
async function signUp(organisation = 'Acme') {
  counter += 1;
  const res = await request(app)
    .post('/api/auth/register')
    .send({ name: 'Ada', email: `ada${counter}@example.com`, password: 'long-enough-password', organisation })
    .expect(201);
  return { token: res.body.accessToken as string, cookie: res.headers['set-cookie']![0]!.split(';')[0]! };
}

const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

describe('auth', () => {
  it('registers an admin of a new organisation', async () => {
    const { token } = await signUp('Fernway');
    const me = await request(app).get('/api/auth/me').set(auth(token)).expect(200);
    expect(me.body).toMatchObject({ role: 'admin', org: { name: 'Fernway', isDemo: false }, user: { name: 'Ada' } });
  });

  it('rejects a duplicate email and a wrong password', async () => {
    await request(app)
      .post('/api/auth/register')
      .send({ name: 'A', email: 'dup@example.com', password: 'long-enough-password', organisation: 'X' })
      .expect(201);
    await request(app)
      .post('/api/auth/register')
      .send({ name: 'B', email: 'DUP@example.com', password: 'long-enough-password', organisation: 'Y' })
      .expect(409);
    await request(app)
      .post('/api/auth/login')
      .send({ email: 'dup@example.com', password: 'wrong-password' })
      .expect(401);
    await request(app)
      .post('/api/auth/login')
      .send({ email: 'dup@example.com', password: 'long-enough-password' })
      .expect(200);
  });

  it('rotates refresh tokens and revokes the family when an old one is reused', async () => {
    const { cookie } = await signUp();
    const rotated = await request(app).post('/api/auth/refresh').set('Cookie', cookie).expect(200);
    const newCookie = rotated.headers['set-cookie']![0]!.split(';')[0]!;
    // Move the rotation outside the concurrent-tab grace window.
    await prisma.$executeRawUnsafe(
      `update refresh_tokens set revoked_at = now() - interval '1 minute' where revoked_at is not null`
    );

    // Replaying the first token is treated as theft…
    await request(app).post('/api/auth/refresh').set('Cookie', cookie).expect(401);
    // …so the token issued after it stops working too.
    await request(app).post('/api/auth/refresh').set('Cookie', newCookie).expect(401);
  });

  it('lets two tabs refresh with the same token at once', async () => {
    const { cookie } = await signUp();
    const [a, b] = await Promise.all([
      request(app).post('/api/auth/refresh').set('Cookie', cookie),
      request(app).post('/api/auth/refresh').set('Cookie', cookie)
    ]);
    expect([a.status, b.status]).toEqual([200, 200]);

    // The session survives: the newest token still works.
    const latest = b.headers['set-cookie']![0]!.split(';')[0]!;
    await request(app).post('/api/auth/refresh').set('Cookie', latest).expect(200);
  });

  it('does not extend the grace window past a logout', async () => {
    const { cookie } = await signUp();
    await request(app).post('/api/auth/logout').set('Cookie', cookie).expect(204);
    await request(app).post('/api/auth/refresh').set('Cookie', cookie).expect(401);
  });

  it('rejects missing and tampered access tokens', async () => {
    const { token } = await signUp();
    await request(app).get('/api/tickets').expect(401);
    await request(app)
      .get('/api/tickets')
      .set(auth(`${token}x`))
      .expect(401);
  });
});

describe('tenant isolation', () => {
  it("never exposes another organisation's tickets", async () => {
    const a = await signUp('Org A');
    const b = await signUp('Org B');
    const { body } = await request(app).post('/api/tickets').set(auth(a.token)).send({ title: 'Secret' }).expect(201);
    const id = body.ticket.id;

    const list = await request(app).get('/api/tickets').set(auth(b.token)).expect(200);
    expect(list.body.tickets).toEqual([]);

    await request(app).get(`/api/tickets/${id}`).set(auth(b.token)).expect(404);
    await request(app).get(`/api/tickets/${id}/events`).set(auth(b.token)).expect(404);
    await request(app).patch(`/api/tickets/${id}`).set(auth(b.token)).send({ title: 'Mine now' }).expect(404);
    await request(app).post(`/api/tickets/${id}/return-to-queue`).set(auth(b.token)).expect(404);
    await request(app).delete(`/api/tickets/${id}`).set(auth(b.token)).expect(404);

    const still = await request(app).get(`/api/tickets/${id}`).set(auth(a.token)).expect(200);
    expect(still.body.ticket.title).toBe('Secret');
  });

  it('refuses to assign a ticket to someone outside the organisation', async () => {
    const a = await signUp('Org A');
    const b = await signUp('Org B');
    const other = await request(app).get('/api/auth/me').set(auth(b.token));
    const { body } = await request(app).post('/api/tickets').set(auth(a.token)).send({ title: 'T' });

    await request(app)
      .patch(`/api/tickets/${body.ticket.id}`)
      .set(auth(a.token))
      .send({ assigneeId: other.body.user.id })
      .expect(400);
  });
});

describe('triage', () => {
  it('accepts a draft, records the corrections, and can undo', async () => {
    const demo = await request(app).post('/api/auth/demo').expect(201);
    const token = demo.body.accessToken;

    const queue = await request(app).get('/api/tickets?status=new').set(auth(token)).expect(200);
    expect(queue.body.tickets.length).toBeGreaterThan(0);
    const draft = queue.body.tickets[0];

    const accepted = await request(app)
      .post(`/api/tickets/${draft.id}/accept`)
      .set(auth(token))
      .send({ priority: 'low' })
      .expect(200);
    expect(accepted.body.ticket).toMatchObject({ status: 'open', priority: 'low' });

    await request(app).post(`/api/tickets/${draft.id}/accept`).set(auth(token)).send({}).expect(409);

    const { body } = await request(app).get(`/api/tickets/${draft.id}/events`).set(auth(token)).expect(200);
    const acceptedEvent = body.events.find((event: { type: string }) => event.type === 'accepted');
    expect(acceptedEvent.data.corrections).toEqual({ priority: { from: draft.priority, to: 'low' } });

    await request(app).post(`/api/tickets/${draft.id}/return-to-queue`).set(auth(token)).expect(200);
    const dismissed = await request(app).post(`/api/tickets/${draft.id}/dismiss`).set(auth(token)).expect(200);
    expect(dismissed.body.ticket.status).toBe('dismissed');
  });

  it('moves tickets between the four statuses and logs each change', async () => {
    const { token } = await signUp();
    const { body } = await request(app).post('/api/tickets').set(auth(token)).send({ title: 'Manual' });
    const id = body.ticket.id;
    expect(body.ticket.status).toBe('open');

    await request(app).patch(`/api/tickets/${id}`).set(auth(token)).send({ status: 'waiting' }).expect(200);
    const backToNew = await request(app).patch(`/api/tickets/${id}`).set(auth(token)).send({ status: 'new' });
    expect(backToNew.status).toBe(200);
    expect(backToNew.body.ticket).toMatchObject({ status: 'new', triagedAt: null });
    // Dismissing only happens through triage.
    await request(app).patch(`/api/tickets/${id}`).set(auth(token)).send({ status: 'dismissed' }).expect(400);

    const events = await request(app).get(`/api/tickets/${id}/events`).set(auth(token));
    expect(events.body.events.map((event: { type: string }) => event.type)).toEqual([
      'created',
      'field_changed',
      'field_changed'
    ]);
    expect(events.body.events[1].data).toEqual({ field: 'status', from: 'open', to: 'waiting' });
  });

  it('creates a ticket with every field from the new-ticket dialog', async () => {
    const { token } = await signUp();
    const me = await request(app).get('/api/auth/me').set(auth(token));
    const { body } = await request(app)
      .post('/api/tickets')
      .set(auth(token))
      .send({
        title: 'Export fails',
        summary: 'CSV export times out.',
        priority: 'urgent',
        status: 'new',
        assigneeId: me.body.user.id,
        links: [{ url: 'https://example.com/logs', title: 'Logs' }]
      })
      .expect(201);
    expect(body.ticket).toMatchObject({
      status: 'new',
      priority: 'urgent',
      triagedAt: null,
      assignee: { id: me.body.user.id },
      links: [{ url: 'https://example.com/logs', title: 'Logs' }]
    });

    await request(app)
      .post('/api/tickets')
      .set(auth(token))
      .send({ title: 'Bad link', links: [{ url: 'javascript:alert(1)' }] })
      .expect(400);

    const mine = await request(app).get('/api/tickets?assignee=me').set(auth(token)).expect(200);
    expect(mine.body.tickets.map((ticket: { id: string }) => ticket.id)).toEqual([body.ticket.id]);
  });

  it('stores, downloads and deletes attachments', async () => {
    const { token } = await signUp();
    const { body } = await request(app).post('/api/tickets').set(auth(token)).send({ title: 'With file' });
    const id = body.ticket.id;

    const upload = await request(app)
      .post(`/api/tickets/${id}/attachments`)
      .set(auth(token))
      .set('Content-Type', 'application/octet-stream')
      .set('X-Filename', encodeURIComponent('../screen shot.png'))
      .set('X-Content-Type', 'image/png')
      .send(Buffer.from('fake image bytes'))
      .expect(201);
    expect(upload.body.attachment).toMatchObject({ filename: 'screen shot.png', contentType: 'image/png', size: 16 });

    const detail = await request(app).get(`/api/tickets/${id}`).set(auth(token)).expect(200);
    expect(detail.body.attachments).toHaveLength(1);

    const file = await request(app)
      .get(`/api/tickets/${id}/attachments/${upload.body.attachment.id}`)
      .set(auth(token))
      .buffer(true)
      .parse((res, done) => {
        const chunks: Buffer[] = [];
        res.on('data', (chunk: Buffer) => chunks.push(chunk));
        res.on('end', () => done(null, Buffer.concat(chunks)));
      })
      .expect(200);
    expect(file.headers['content-disposition']).toContain('attachment');
    expect((file.body as Buffer).toString()).toBe('fake image bytes');

    // Another organisation can't see it.
    const other = await signUp('Other');
    await request(app)
      .get(`/api/tickets/${id}/attachments/${upload.body.attachment.id}`)
      .set(auth(other.token))
      .expect(404);

    await request(app)
      .delete(`/api/tickets/${id}/attachments/${upload.body.attachment.id}`)
      .set(auth(token))
      .expect(204);
  });

  it('corrects spelling and punctuation without touching links', async () => {
    const { token } = await signUp();
    const { body } = await request(app)
      .post('/api/text/correct')
      .set(auth(token))
      .send({ text: 'i dont recieve teh invoice ,see https://x.io/a?b=1,c' })
      .expect(200);
    expect(body).toEqual({
      text: "I don't receive the invoice, see https://x.io/a?b=1,c",
      changed: true,
      engine: 'rules'
    });
  });

  it('imports each sample email once', async () => {
    const { token } = await signUp();
    const first = await request(app).post('/api/emails/sync').set(auth(token)).expect(201);
    expect(first.body.imported).toMatchObject({ status: 'new', source: 'email' });

    let remaining = first.body.remaining;
    while (remaining > 0) {
      remaining = (await request(app).post('/api/emails/sync').set(auth(token))).body.remaining;
    }
    const done = await request(app).post('/api/emails/sync').set(auth(token)).expect(200);
    expect(done.body.imported).toBeNull();
  });
});

describe('ticket list', () => {
  /** Follows nextCursor until the last page; returns the pages' ticket ids. */
  async function allPages(token: string, query: string) {
    const pages: string[][] = [];
    let cursor: string | null = null;
    do {
      const url: string = `/api/tickets?${query}${cursor ? `&cursor=${cursor}` : ''}`;
      const { body }: { body: { tickets: { id: string }[]; nextCursor: string | null } } = await request(app)
        .get(url)
        .set(auth(token))
        .expect(200);
      pages.push(body.tickets.map((ticket) => ticket.id));
      cursor = body.nextCursor;
    } while (cursor);
    return pages;
  }

  it('pages through every ticket exactly once, even with identical timestamps', async () => {
    const { token } = await signUp();
    for (let i = 0; i < 7; i += 1) {
      await request(app)
        .post('/api/tickets')
        .set(auth(token))
        .send({ title: `T${i}` });
    }
    // Same received_at for all: only the id tie-breaker keeps pages stable.
    await prisma.$executeRawUnsafe(`update tickets set received_at = '2026-01-01T00:00:00.123456Z'`);

    const pages = await allPages(token, 'limit=3');
    expect(pages.map((page) => page.length)).toEqual([3, 3, 1]);
    expect(new Set(pages.flat()).size).toBe(7);
  });

  it('sorts by acceptance time when asked', async () => {
    const demo = await request(app).post('/api/auth/demo');
    const token = demo.body.accessToken;
    const queue = await request(app).get('/api/tickets?status=new').set(auth(token));
    // The oldest email in the queue, accepted now, must come first by triage time.
    const oldest = queue.body.tickets.at(-1);
    await request(app).post(`/api/tickets/${oldest.id}/accept`).set(auth(token)).send({}).expect(200);

    const byTriage = await request(app).get('/api/tickets?status=open&sort=triaged').set(auth(token));
    expect(byTriage.body.tickets[0].id).toBe(oldest.id);
    const byReceived = await request(app).get('/api/tickets?status=open&sort=received').set(auth(token));
    expect(byReceived.body.tickets[0].id).not.toBe(oldest.id);
  });

  it('rejects a malformed cursor', async () => {
    const { token } = await signUp();
    await request(app).get('/api/tickets?cursor=not-a-cursor').set(auth(token)).expect(400);
  });
});

describe('roles', () => {
  it('lets only admins delete tickets and change settings', async () => {
    const admin = await signUp();
    const me = await request(app).get('/api/auth/me').set(auth(admin.token));

    await request(app)
      .post('/api/auth/register')
      .send({ name: 'Agent', email: 'agent@example.com', password: 'long-enough-password', organisation: 'Tmp' });
    // Move the agent into the admin's organisation with the agent role.
    const agentUser = await prisma.user.findUniqueOrThrow({ where: { email: 'agent@example.com' } });
    await prisma.membership.create({ data: { orgId: me.body.org.id, userId: agentUser.id, role: 'agent' } });
    await prisma.organisation.deleteMany({ where: { name: 'Tmp' } });
    const agent = await request(app)
      .post('/api/auth/login')
      .send({ email: 'agent@example.com', password: 'long-enough-password' })
      .expect(200);

    const { body } = await request(app)
      .post('/api/tickets')
      .set(auth(agent.body.accessToken))
      .send({ title: 'T' })
      .expect(201);
    await request(app).delete(`/api/tickets/${body.ticket.id}`).set(auth(agent.body.accessToken)).expect(403);
    await request(app)
      .patch('/api/org/settings')
      .set(auth(agent.body.accessToken))
      .send({ dailyDigest: true })
      .expect(403);

    await request(app).delete(`/api/tickets/${body.ticket.id}`).set(auth(admin.token)).expect(204);
    await request(app).patch('/api/org/settings').set(auth(admin.token)).send({ model: 'llama' }).expect(200);
    const settings = await request(app).patch('/api/org/settings').set(auth(admin.token)).send({ dailyDigest: true });
    // The second patch must not reset the first.
    expect(settings.body.settings).toMatchObject({ dailyDigest: true, model: 'llama' });
  });
});

describe('stats', () => {
  it('summarises the demo organisation', async () => {
    const demo = await request(app).post('/api/auth/demo');
    const { body } = await request(app).get('/api/stats').set(auth(demo.body.accessToken)).expect(200);
    expect(body.awaitingTriage).toBe(5);
    expect(body.last7Days).toHaveLength(7);
    expect(body.medianTriageMinutes).toBeGreaterThan(0);
  });

  it("buckets days in the viewer's time zone", async () => {
    const { token } = await signUp();
    await request(app).post('/api/emails/sync').set(auth(token)).expect(201);
    // 23:30 UTC yesterday is 08:30 the next morning in Tokyo.
    const rows = await prisma.$queryRawUnsafe<{ at: Date }[]>(
      `update tickets set received_at = date_trunc('day', now() at time zone 'UTC') at time zone 'UTC' - interval '30 minutes'
       returning received_at as at`
    );
    const utcDay = rows[0]!.at.toISOString().slice(0, 10);
    const tokyoDay = new Date(rows[0]!.at.getTime() + 9 * 3600 * 1000).toISOString().slice(0, 10);

    const dayWithEmail = async (tz: string) => {
      const { body } = await request(app).get(`/api/stats?tz=${tz}`).set(auth(token)).expect(200);
      return body.last7Days.find((day: { received: number }) => day.received === 1)?.day;
    };
    expect(await dayWithEmail('UTC')).toBe(utcDay);
    expect(await dayWithEmail('Asia/Tokyo')).toBe(tokyoDay);
    await request(app).get('/api/stats?tz=Mars/Olympus').set(auth(token)).expect(400);
  });
});

describe('demo cleanup job', () => {
  it('deletes sandboxes older than a day and keeps the rest', async () => {
    await request(app).post('/api/auth/demo').expect(201);
    await request(app).post('/api/auth/demo').expect(201);
    const { token } = await signUp('Real customer');
    // Age one sandbox past its lifetime.
    await prisma.$executeRawUnsafe(
      `update organisations set created_at = now() - interval '2 days'
        where id = (select id from organisations where is_demo order by created_at limit 1)`
    );
    await prisma.$executeRawUnsafe(
      `update users set created_at = now() - interval '2 days'
        where id = (select id from users where email like '%@demo.triago.app' order by created_at limit 1)`
    );

    await cleanupDemoSandboxes();

    expect(await prisma.organisation.count({ where: { isDemo: true } })).toBe(1);
    expect(await prisma.user.count({ where: { email: { endsWith: '@demo.triago.app' } } })).toBe(1);
    // Real organisations are untouched.
    await request(app).get('/api/auth/me').set(auth(token)).expect(200);
  });
});

describe('security hardening', () => {
  it('blocks cookie endpoints called from another site', async () => {
    const { cookie } = await signUp();
    await request(app)
      .post('/api/auth/refresh')
      .set('Cookie', cookie)
      .set('Origin', 'https://evil.example')
      .expect(403);
    await request(app).post('/api/auth/refresh').set('Cookie', cookie).set('Sec-Fetch-Site', 'cross-site').expect(403);
    // The app's own origin still works.
    await request(app)
      .post('/api/auth/refresh')
      .set('Cookie', cookie)
      .set('Origin', 'http://localhost:5173')
      .expect(200);
  });

  it('sets a strict, httpOnly refresh cookie', async () => {
    const res = await request(app).post('/api/auth/demo').expect(201);
    const cookie = res.headers['set-cookie']![0]!;
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/SameSite=Strict/i);
  });

  it('rejects an access token signed for a different audience', async () => {
    const jwt = (await import('jsonwebtoken')).default;
    const { token } = await signUp();
    const claims = jwt.decode(token) as { sub: string; org: string; role: string };
    const forged = jwt.sign(
      { sub: claims.sub, org: claims.org, role: claims.role },
      'test-secret-that-is-long-enough',
      {
        expiresIn: 60
      }
    );
    await request(app).get('/api/tickets').set(auth(forged)).expect(401);
  });

  it('answers malformed and oversized JSON with 4xx, not 500', async () => {
    await request(app)
      .post('/api/auth/login')
      .set('Content-Type', 'application/json')
      .send('{"email":')
      .expect(400)
      .expect((res) => expect(res.body.error.code).toBe('MALFORMED_BODY'));
    await request(app)
      .post('/api/auth/login')
      .set('Content-Type', 'application/json')
      .send(JSON.stringify({ email: 'a@b.co', password: 'x'.repeat(200_000) }))
      .expect(413);
  });

  it('treats SQL in inputs as plain data', async () => {
    const { token } = await signUp();
    await request(app)
      .post('/api/auth/login')
      .send({ email: "admin@example.com' or '1'='1", password: "' or 1=1 --" })
      .expect(400);
    await request(app).get('/api/tickets').query({ q: "'; drop table tickets; --" }).set(auth(token)).expect(200);
    await request(app)
      .get(`/api/tickets/${encodeURIComponent("1' or '1'='1")}`)
      .set(auth(token))
      .expect(400);
    // The search ran as a literal string: the table is still there.
    await request(app).get('/api/tickets').set(auth(token)).expect(200);
  });

  it('sends security headers and never lets API responses be cached', async () => {
    const res = await request(app).get('/api/health').expect(200);
    expect(res.headers['cache-control']).toBe('no-store');
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['content-security-policy']).toContain("default-src 'none'");
    expect(res.headers['x-powered-by']).toBeUndefined();
  });

  it('ignores a spoofed X-Forwarded-For when no proxy is trusted', async () => {
    const seen: string[] = [];
    const probe = createApp();
    // req.ip must come from the socket, not a header any client can set.
    probe.get('/probe', (req, res) => {
      seen.push(req.ip ?? '');
      res.end();
    });
    await request(probe).get('/probe').set('X-Forwarded-For', '203.0.113.9');
    expect(seen.at(-1)).not.toBe('203.0.113.9');
  });
});

/** Adds a second user to the admin's organisation with the agent role; returns their access token. */
async function addAgent(adminToken: string, email: string) {
  const me = await request(app).get('/api/auth/me').set(auth(adminToken));
  await request(app)
    .post('/api/auth/register')
    .send({ name: 'Agent', email, password: 'long-enough-password', organisation: `Tmp-${email}` });
  const user = await prisma.user.findUniqueOrThrow({ where: { email } });
  await prisma.membership.create({ data: { orgId: me.body.org.id, userId: user.id, role: 'agent' } });
  await prisma.organisation.deleteMany({ where: { name: `Tmp-${email}` } });
  const res = await request(app).post('/api/auth/login').send({ email, password: 'long-enough-password' }).expect(200);
  return res.body.accessToken as string;
}

describe('notes', () => {
  it('adds, edits and deletes notes with ownership checks', async () => {
    const admin = await signUp();
    const agent = await addAgent(admin.token, 'note-agent@example.com');
    const { body: created } = await request(app)
      .post('/api/tickets')
      .set(auth(admin.token))
      .send({ title: 'Needs a note' })
      .expect(201);
    const ticketId = created.ticket.id as string;

    await request(app).post(`/api/tickets/${ticketId}/notes`).set(auth(agent)).send({ body: '  ' }).expect(400);
    const { body: added } = await request(app)
      .post(`/api/tickets/${ticketId}/notes`)
      .set(auth(agent))
      .send({ body: 'Called the customer.' })
      .expect(201);
    const noteUrl = `/api/tickets/${ticketId}/notes/${added.note.id}`;
    expect(added.note).toMatchObject({ kind: 'note', body: 'Called the customer.', fromName: 'Agent', editedAt: null });

    // Only the author edits; the admin can delete, another agent cannot.
    await request(app).patch(noteUrl).set(auth(admin.token)).send({ body: 'Hijacked' }).expect(403);
    const { body: edited } = await request(app)
      .patch(noteUrl)
      .set(auth(agent))
      .send({ body: 'Called the customer twice.' })
      .expect(200);
    expect(edited.note.editedAt).not.toBeNull();

    const show = await request(app).get(`/api/tickets/${ticketId}`).set(auth(admin.token)).expect(200);
    expect(show.body.messages.map((m: { body: string }) => m.body)).toEqual(['Called the customer twice.']);

    const otherAgent = await addAgent(admin.token, 'other-agent@example.com');
    await request(app).delete(noteUrl).set(auth(otherAgent)).expect(403);
    await request(app).delete(noteUrl).set(auth(admin.token)).expect(204);
    await request(app).delete(noteUrl).set(auth(admin.token)).expect(404);

    const events = await request(app).get(`/api/tickets/${ticketId}/events`).set(auth(admin.token));
    expect(events.body.events.map((e: { type: string }) => e.type)).toEqual(['created', 'note_added', 'note_deleted']);
  });

  it("hides another organisation's notes", async () => {
    const a = await signUp('A');
    const b = await signUp('B');
    const { body } = await request(app).post('/api/tickets').set(auth(a.token)).send({ title: 'Private' });
    const { body: note } = await request(app)
      .post(`/api/tickets/${body.ticket.id}/notes`)
      .set(auth(a.token))
      .send({ body: 'Secret' })
      .expect(201);

    await request(app).post(`/api/tickets/${body.ticket.id}/notes`).set(auth(b.token)).send({ body: 'x' }).expect(404);
    await request(app)
      .patch(`/api/tickets/${body.ticket.id}/notes/${note.note.id}`)
      .set(auth(b.token))
      .send({ body: 'x' })
      .expect(404);
  });
});

describe('ticket search', () => {
  it('matches title, summary and requester, case-insensitively, within the organisation', async () => {
    const { token } = await signUp();
    const other = await signUp('Other');
    for (const title of ['Refund for March', 'Login broken', '50% discount code']) {
      await request(app).post('/api/tickets').set(auth(token)).send({ title }).expect(201);
    }
    await request(app).post('/api/tickets').set(auth(other.token)).send({ title: 'Refund elsewhere' }).expect(201);

    const search = async (q: string) =>
      (await request(app).get('/api/tickets').query({ q }).set(auth(token)).expect(200)).body.tickets.map(
        (t: { title: string }) => t.title
      );

    expect(await search('REFUND')).toEqual(['Refund for March']);
    // Wildcards are literal: "%" only matches a real percent sign.
    expect(await search('%')).toEqual(['50% discount code']);
    expect(await search('_')).toEqual([]);
    expect(await search('   ')).toHaveLength(3);
  });
});
