import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { prisma } from '../src/lib/db.js';
import { testOutbox } from '../src/lib/mailer.js';

const app = createApp();

beforeEach(async () => {
  await prisma.$executeRawUnsafe('truncate organisations, users cascade');
  testOutbox.length = 0;
});

afterAll(async () => {
  await prisma.$disconnect();
});

const EMAIL = 'ada@example.com';
const OLD = 'long-enough-password';
const NEW = 'a-brand-new-password';

async function register() {
  const res = await request(app)
    .post('/api/auth/register')
    .send({ name: 'Ada', email: EMAIL, password: OLD, organisation: 'Acme' })
    .expect(201);
  return res.headers['set-cookie']![0]!.split(';')[0]!;
}

async function resetLink(): Promise<string> {
  await request(app).post('/api/auth/password/forgot').send({ email: EMAIL }).expect(202);
  const mail = testOutbox.at(-1)!;
  const url = /https?:\/\/\S+/.exec(mail.text)![0];
  return new URL(url).searchParams.get('token')!;
}

const login = (password: string) => request(app).post('/api/auth/login').send({ email: EMAIL, password });

describe('password reset', () => {
  it('sets a new password from the emailed link and signs out every old session', async () => {
    const oldSession = await register();
    const token = await resetLink();
    expect(testOutbox.at(-1)).toMatchObject({ to: EMAIL, subject: 'Reset your Triago password' });

    await request(app).post('/api/auth/password/reset').send({ token, password: NEW }).expect(204);

    await login(OLD).expect(401);
    await login(NEW).expect(200);
    await request(app).post('/api/auth/refresh').set('Cookie', oldSession).expect(401);
  });

  it('answers the same for unknown emails, and sends nothing', async () => {
    await request(app).post('/api/auth/password/forgot').send({ email: 'nobody@example.com' }).expect(202);
    expect(testOutbox).toHaveLength(0);
  });

  it('accepts a link only once', async () => {
    await register();
    const token = await resetLink();
    await request(app).post('/api/auth/password/reset').send({ token, password: NEW }).expect(204);
    await request(app).post('/api/auth/password/reset').send({ token, password: 'yet-another-password' }).expect(400);
  });

  it('refuses an expired link, and an older link once a newer one was asked for', async () => {
    await register();
    const first = await resetLink();
    const second = await resetLink();
    await request(app).post('/api/auth/password/reset').send({ token: first, password: NEW }).expect(400);

    await prisma.passwordResetToken.updateMany({ data: { expiresAt: new Date(Date.now() - 1000) } });
    await request(app).post('/api/auth/password/reset').send({ token: second, password: NEW }).expect(400);
    await login(OLD).expect(200);
  });

  it('refuses a made-up token and a weak password', async () => {
    await register();
    const token = await resetLink();
    await request(app)
      .post('/api/auth/password/reset')
      .send({ token: 'x'.repeat(43), password: NEW })
      .expect(400);
    await request(app).post('/api/auth/password/reset').send({ token, password: 'short' }).expect(400);
  });

  it('stores only a hash of the token', async () => {
    await register();
    const token = await resetLink();
    const row = await prisma.passwordResetToken.findFirstOrThrow();
    expect(row.tokenHash).not.toBe(token);
    expect(row.tokenHash).toHaveLength(64);
  });
});
