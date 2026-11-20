import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../src/app.js';
import { prisma } from '../src/lib/db.js';
import { createConnectState, verifyConnectState } from '../src/modules/gmail/gmail.service.js';

const app = createApp();

beforeEach(async () => {
  await prisma.$executeRawUnsafe('truncate organisations, users cascade');
});

afterAll(async () => {
  await prisma.$disconnect();
});

async function signUp(organisation = 'Acme') {
  const res = await request(app)
    .post('/api/auth/register')
    .send({ name: 'Ada', email: `ada-${organisation}@example.com`, password: 'long-enough-password', organisation })
    .expect(201);
  const token = res.body.accessToken as string;
  const me = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${token}`);
  return { token, orgId: me.body.org.id as string, userId: me.body.user.id as string };
}

describe('Gmail connect state', () => {
  it('accepts the state only together with the nonce from the same browser', () => {
    const auth = { orgId: crypto.randomUUID(), userId: crypto.randomUUID(), role: 'admin' as const };
    const { state, nonce } = createConnectState(auth);

    expect(verifyConnectState(state, nonce)).toEqual({ org: auth.orgId, sub: auth.userId });
    expect(() => verifyConnectState(state, null)).toThrow(/another browser/);
    expect(() => verifyConnectState(state, 'someone-elses-nonce')).toThrow(/another browser/);
  });

  it('rejects a tampered or foreign state', () => {
    const auth = { orgId: crypto.randomUUID(), userId: crypto.randomUUID(), role: 'admin' as const };
    const { state, nonce } = createConnectState(auth);
    const [header, payload, signature] = state.split('.');
    const forged = `${header}.${payload}x.${signature}`;
    expect(() => verifyConnectState(forged, nonce)).toThrow(/expired/);
    expect(() => verifyConnectState('not-a-token', nonce)).toThrow(/expired/);
  });

  it("refuses a callback opened in a browser that didn't start the connect, before talking to Google", async () => {
    // The attacker is admin of their own organisation and phishes someone with their consent link.
    const attacker = await signUp('Attacker');
    const { state } = createConnectState({ orgId: attacker.orgId, userId: attacker.userId, role: 'admin' });

    const res = await request(app).get('/api/gmail/callback').query({ code: 'victim-code', state }).expect(303);
    const location = new URL(res.headers.location!);
    expect(location.pathname).toBe('/settings');
    expect(location.searchParams.get('gmail')).toBe('error');
    expect(location.searchParams.get('message')).toMatch(/another browser/);
    expect(await prisma.gmailConnection.count()).toBe(0);
  });
});

describe('mailbox token encryption', () => {
  it('round-trips, and refuses a tampered or foreign value', async () => {
    const { encrypt, decrypt } = await import('../src/modules/gmail/crypto.js');
    const sealed = encrypt('refresh-token');
    expect(sealed).not.toContain('refresh-token');
    expect(decrypt(sealed)).toBe('refresh-token');

    const [version, iv, tag, data] = sealed.split('.');
    const flipped = `${data!.slice(0, -2)}${data!.endsWith('A') ? 'B' : 'A'}${data!.slice(-1)}`;
    expect(decrypt([version, iv, tag, flipped].join('.'))).toBeNull();
    expect(decrypt(`v9.${iv}.${tag}.${data}`)).toBeNull();
    expect(decrypt('garbage')).toBeNull();
  });

  it('uses a separate TOKEN_ENCRYPTION_KEY when set, and still reads tokens saved with the old key', async () => {
    const { encrypt: encryptV1 } = await import('../src/modules/gmail/crypto.js');
    const oldToken = encryptV1('old-refresh-token');

    vi.resetModules();
    vi.stubEnv('TOKEN_ENCRYPTION_KEY', 'a-separate-key-that-is-long-enough-123456');
    const fresh = await import('../src/modules/gmail/crypto.js');
    const newToken = fresh.encrypt('new-refresh-token');
    expect(newToken.startsWith('v2.')).toBe(true);
    expect(fresh.decrypt(newToken)).toBe('new-refresh-token');
    expect(fresh.decrypt(oldToken)).toBe('old-refresh-token');
    vi.unstubAllEnvs();
  });
});
