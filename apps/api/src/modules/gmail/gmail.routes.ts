import { Router, type CookieOptions, type Request } from 'express';
import { config } from '../../config.js';
import { HttpError } from '../../lib/errors.js';
import { getAuth, requireMember, requireRole } from '../../middleware/auth.js';
import { z } from 'zod';
import * as gmail from './gmail.service.js';

export const gmailRouter = Router();

const NONCE_COOKIE = 'triago_gmail_nonce';
// Lax, not Strict: Google's redirect back is a cross-site top-level navigation, which Lax still sends.
const nonceCookie: CookieOptions = {
  httpOnly: true,
  secure: config.isProduction,
  sameSite: 'lax',
  path: '/api/gmail',
  maxAge: 10 * 60 * 1000
};

const readNonce = (req: Request): string | null => {
  const value: unknown = req.cookies?.[NONCE_COOKIE];
  return typeof value === 'string' && value ? value : null;
};

/** Returns the Google consent URL; the browser navigates there, since a redirect can't carry the bearer token. */
gmailRouter.post('/connect', ...requireMember, requireRole('admin'), (req, res) => {
  const { url, nonce } = gmail.connectUrl(getAuth(req));
  res.cookie(NONCE_COOKIE, nonce, nonceCookie);
  res.json({ url });
});

/** Google sends the admin back here. Always ends on the Settings page, with the outcome in the query string. */
gmailRouter.get('/callback', async (req, res) => {
  const settings = new URL('/settings', config.clientOrigin);
  const { code, state, error } = req.query;
  const nonce = readNonce(req);
  // Single use: whatever happens next, this browser's nonce is spent.
  res.clearCookie(NONCE_COOKIE, { ...nonceCookie, maxAge: undefined });
  try {
    if (typeof error === 'string') throw new HttpError(400, 'DENIED', 'Gmail access was not granted.');
    if (typeof code !== 'string' || typeof state !== 'string') {
      throw new HttpError(400, 'BAD_CALLBACK', 'The Gmail sign-in response was incomplete.');
    }
    await gmail.completeConnect(code, state, nonce);
    settings.searchParams.set('gmail', 'connected');
  } catch (failure) {
    req.log.warn({ err: failure }, 'Gmail connect failed');
    settings.searchParams.set('gmail', 'error');
    settings.searchParams.set(
      'message',
      failure instanceof HttpError ? failure.message : 'Could not connect Gmail. Try again.'
    );
  }
  res.redirect(303, settings.toString());
});

gmailRouter.delete('/', ...requireMember, requireRole('admin'), async (req, res) => {
  await gmail.disconnect(getAuth(req).orgId);
  res.status(204).end();
});

const BackfillBody = z.object({
  days: z
    .number()
    .refine((days) => (gmail.BACKFILL_DAYS as readonly number[]).includes(days), 'Choose 30, 90 or 365 days.')
});

/** Imports older mail in the background; returns at once. */
gmailRouter.post('/backfill', ...requireMember, requireRole('admin'), async (req, res) => {
  const { days } = BackfillBody.parse(req.body);
  await gmail.startBackfill(getAuth(req).orgId, days);
  res.status(202).json({ status: 'started', days });
});
