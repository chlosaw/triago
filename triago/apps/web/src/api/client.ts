/**
 * Fetch wrapper for the Triago API. The access token lives in memory only;
 * the refresh token is an httpOnly cookie the browser sends to /api/auth.
 * A 401 triggers one silent refresh and a retry.
 */

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly fields: Record<string, string> = {}
  ) {
    super(message);
  }
}

let accessToken: string | null = null;
let refreshInFlight: Promise<boolean> | null = null;
let onSessionExpired: () => void = () => {};

export function setAccessToken(token: string | null) {
  accessToken = token;
}

export function handleSessionExpired(callback: () => void) {
  onSessionExpired = callback;
}

/** Trades the refresh cookie for a new access token. Concurrent callers share one request. */
export function refreshSession(): Promise<boolean> {
  refreshInFlight ??= fetch('/api/auth/refresh', { method: 'POST', credentials: 'include' })
    .then(async (res) => {
      if (!res.ok) return false;
      setAccessToken(((await res.json()) as { accessToken: string }).accessToken);
      return true;
    })
    .catch(() => false)
    .finally(() => {
      refreshInFlight = null;
    });
  return refreshInFlight;
}

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  body?: unknown;
}

export async function api<T>(path: string, { method = 'GET', body }: RequestOptions = {}): Promise<T> {
  const send = () =>
    fetch(`/api${path}`, {
      method,
      credentials: 'include',
      headers: {
        ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
        ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {})
      },
      body: body === undefined ? undefined : JSON.stringify(body)
    });

  let res = await send();
  if (res.status === 401 && accessToken && !path.startsWith('/auth/')) {
    if (await refreshSession()) {
      res = await send();
    } else {
      setAccessToken(null);
      onSessionExpired();
    }
  }

  if (res.status === 204) return undefined as T;
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const error = data.error ?? {};
    throw new ApiError(res.status, error.code ?? 'UNKNOWN', error.message ?? 'Request failed.', error.fields);
  }
  return data as T;
}
