import { config } from '../../config.js';
import { HttpError } from '../../lib/errors.js';

/** Thin fetch wrappers for the Google OAuth and Gmail REST endpoints Triago uses. */

const AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const REVOKE_URL = 'https://oauth2.googleapis.com/revoke';
const GMAIL = 'https://gmail.googleapis.com/gmail/v1/users/me';
export const GMAIL_SCOPE = 'https://www.googleapis.com/auth/gmail.readonly';
const TIMEOUT_MS = 15_000;

export class GoogleError extends Error {
  constructor(
    readonly status: number,
    readonly reason: string
  ) {
    super(`Google API returned ${status}: ${reason}`);
  }
}

function client() {
  if (!config.google) throw new HttpError(503, 'GMAIL_NOT_CONFIGURED', 'Gmail is not set up on this server.');
  return config.google;
}

export function consentUrl(state: string): string {
  const { clientId, redirectUri } = client();
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: GMAIL_SCOPE,
    // offline + consent: Google returns a refresh token every time, so a reconnect always works.
    access_type: 'offline',
    prompt: 'consent',
    include_granted_scopes: 'true',
    state
  });
  return `${AUTH_URL}?${params}`;
}

async function tokenRequest(fields: Record<string, string>) {
  const { clientId, clientSecret } = client();
  const response = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: clientId, client_secret: clientSecret, ...fields }),
    signal: AbortSignal.timeout(TIMEOUT_MS)
  });
  const body = (await response.json().catch(() => ({}))) as {
    access_token?: string;
    refresh_token?: string;
    scope?: string;
    error?: string;
  };
  if (!response.ok || !body.access_token) throw new GoogleError(response.status, body.error ?? 'token_error');
  return body;
}

export function exchangeCode(code: string) {
  return tokenRequest({ code, grant_type: 'authorization_code', redirect_uri: client().redirectUri });
}

export async function accessToken(refreshToken: string): Promise<string> {
  return (await tokenRequest({ refresh_token: refreshToken, grant_type: 'refresh_token' })).access_token!;
}

export async function revoke(token: string): Promise<void> {
  await fetch(REVOKE_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ token }),
    signal: AbortSignal.timeout(TIMEOUT_MS)
  }).catch(() => undefined);
}

async function gmail<T>(token: string, path: string): Promise<T> {
  const response = await fetch(`${GMAIL}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(TIMEOUT_MS)
  });
  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as { error?: { status?: string } };
    throw new GoogleError(response.status, body.error?.status ?? 'gmail_error');
  }
  return (await response.json()) as T;
}

export const getProfile = (token: string) => gmail<{ emailAddress: string }>(token, '/profile');

export async function listMessageIds(token: string, query: string, max: number): Promise<string[]> {
  const params = new URLSearchParams({ q: query, maxResults: String(max) });
  const { messages = [] } = await gmail<{ messages?: { id: string }[] }>(token, `/messages?${params}`);
  return messages.map((message) => message.id);
}

/** The full RFC 822 message. */
export async function getRawMessage(token: string, id: string): Promise<{ raw: Buffer; internalDate: Date }> {
  const message = await gmail<{ raw: string; internalDate: string }>(
    token,
    `/messages/${encodeURIComponent(id)}?format=raw`
  );
  return { raw: Buffer.from(message.raw, 'base64url'), internalDate: new Date(Number(message.internalDate)) };
}
