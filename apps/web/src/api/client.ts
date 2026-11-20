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

/** Sends a request with the access token, refreshing it once on a 401. */
async function send(path: string, init: { method: string; headers?: Record<string, string>; body?: BodyInit }) {
  const attempt = () =>
    fetch(`/api${path}`, {
      ...init,
      credentials: 'include',
      headers: { ...init.headers, ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}) }
    });

  let res = await attempt();
  if (res.status === 401 && accessToken && !path.startsWith('/auth/')) {
    if (await refreshSession()) {
      res = await attempt();
    } else {
      setAccessToken(null);
      onSessionExpired();
    }
  }
  return res;
}

async function readError(res: Response): Promise<ApiError> {
  const data = await res.json().catch(() => ({}));
  const error = data.error ?? {};
  return new ApiError(res.status, error.code ?? 'UNKNOWN', error.message ?? 'Request failed.', error.fields);
}

/** Uploads a file as raw bytes; the name and type travel in headers. */
export async function apiUpload<T>(path: string, file: File): Promise<T> {
  const res = await send(path, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/octet-stream',
      'X-Filename': encodeURIComponent(file.name),
      'X-Content-Type': file.type || 'application/octet-stream'
    },
    body: file
  });
  if (!res.ok) throw await readError(res);
  return (await res.json()) as T;
}

/** Downloads a file that needs the access token, then hands it to the browser as a normal download. */
export async function apiDownload(path: string, filename: string): Promise<void> {
  const res = await send(path, { method: 'GET' });
  if (!res.ok) throw await readError(res);
  const url = URL.createObjectURL(await res.blob());
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export async function api<T>(path: string, { method = 'GET', body }: RequestOptions = {}): Promise<T> {
  const res = await send(path, {
    method,
    headers: body === undefined ? {} : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body)
  });

  if (res.status === 204) return undefined as T;
  if (!res.ok) throw await readError(res);
  return (await res.json().catch(() => ({}))) as T;
}
