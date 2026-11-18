import { LoginBody, RegisterBody } from '@triago/shared';
import type { CookieOptions, Request, Response } from 'express';
import { config } from '../../config.js';
import { HttpError } from '../../lib/errors.js';
import { getAuth } from '../../middleware/auth.js';
import * as auth from './auth.service.js';

const REFRESH_COOKIE = 'triago_rt';

const cookieOptions: CookieOptions = {
  httpOnly: true,
  secure: config.isProduction,
  // The web app and API share an origin, so Strict costs nothing and blocks
  // the cookie on every cross-site request (CSRF).
  sameSite: 'strict',
  path: '/api/auth',
  maxAge: config.refreshTokenTtlDays * 24 * 60 * 60 * 1000
};

/** The refresh token goes in an httpOnly cookie; only the access token is in the body. */
function sendSession(res: Response, session: auth.Session, status = 200) {
  res.cookie(REFRESH_COOKIE, session.refreshToken, cookieOptions);
  res.status(status).json({ accessToken: session.accessToken });
}

function refreshCookie(req: Request): string | null {
  const token: unknown = req.cookies?.[REFRESH_COOKIE];
  return typeof token === 'string' ? token : null;
}

export async function register(req: Request, res: Response) {
  sendSession(res, await auth.register(RegisterBody.parse(req.body)), 201);
}

export async function login(req: Request, res: Response) {
  const { email, password } = LoginBody.parse(req.body);
  try {
    sendSession(res, await auth.login(email, password));
  } catch (error) {
    if (error instanceof HttpError && error.code === 'INVALID_CREDENTIALS') {
      // The email is personal data; its domain is enough to spot a targeted attack.
      req.log.warn({ security: 'login_failed', emailDomain: email.split('@')[1], ip: req.ip }, 'Failed sign-in');
    }
    throw error;
  }
}

export async function demo(_req: Request, res: Response) {
  sendSession(res, await auth.startDemo(), 201);
}

export async function refresh(req: Request, res: Response) {
  const token = refreshCookie(req);
  if (!token) throw new HttpError(401, 'UNAUTHENTICATED', 'Sign in to continue.');
  sendSession(res, await auth.refresh(token));
}

export async function logout(req: Request, res: Response) {
  const token = refreshCookie(req);
  if (token) await auth.logout(token);
  res.clearCookie(REFRESH_COOKIE, { ...cookieOptions, maxAge: undefined });
  res.status(204).end();
}

export async function me(req: Request, res: Response) {
  res.json(await auth.getProfile(getAuth(req)));
}
