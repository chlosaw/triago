import { Router } from 'express';
import { config } from '../../config.js';
import { HttpError } from '../../lib/errors.js';
import { getAuth, requireAuth, requireRole } from '../../middleware/auth.js';
import * as gmail from './gmail.service.js';

export const gmailRouter = Router();

/** Returns the Google consent URL; the browser navigates there, since a redirect can't carry the bearer token. */
gmailRouter.post('/connect', requireAuth, requireRole('admin'), (req, res) => {
  res.json({ url: gmail.connectUrl(getAuth(req)) });
});

/** Google sends the admin back here. Always ends on the Settings page, with the outcome in the query string. */
gmailRouter.get('/callback', async (req, res) => {
  const settings = new URL('/settings', config.clientOrigin);
  const { code, state, error } = req.query;
  try {
    if (typeof error === 'string') throw new HttpError(400, 'DENIED', 'Gmail access was not granted.');
    if (typeof code !== 'string' || typeof state !== 'string') {
      throw new HttpError(400, 'BAD_CALLBACK', 'The Gmail sign-in response was incomplete.');
    }
    await gmail.completeConnect(code, state);
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

gmailRouter.delete('/', requireAuth, requireRole('admin'), async (req, res) => {
  await gmail.disconnect(getAuth(req).orgId);
  res.status(204).end();
});
