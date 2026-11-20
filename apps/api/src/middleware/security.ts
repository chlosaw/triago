import type { Request, RequestHandler } from 'express';
import rateLimit from 'express-rate-limit';
import { config } from '../config.js';
import { HttpError } from '../lib/errors.js';

/**
 * Fixed-window rate limiter that answers with the API's usual error body.
 *
 * Counters live in this process's memory: run more than one API instance and
 * each keeps its own count. Move to a shared store (Redis, Postgres) before
 * scaling out.
 */
export function limiter({
  windowMinutes,
  limit,
  key,
  name,
  onLimit,
  enforceInTests = false
}: {
  windowMinutes: number;
  limit: number;
  /** What to count by; defaults to the client IP. Return undefined to skip counting. */
  key?: (req: Request) => string | undefined;
  /** Shows up in the log line when the limit is hit. */
  name: string;
  /** Answer to send instead of a 429, e.g. for a webhook whose sender would retry. */
  onLimit?: RequestHandler;
  /** Count requests in tests too (limits are otherwise off there), for limits whose behaviour is tested. */
  enforceInTests?: boolean;
}): RequestHandler {
  return rateLimit({
    windowMs: windowMinutes * 60 * 1000,
    limit,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    skip: (req) => (config.env === 'test' && !enforceInTests) || (key !== undefined && key(req) === undefined),
    keyGenerator: key ? (req) => `${name}:${key(req)}` : (req) => `${name}:${req.ip}`,
    handler: (req, res, next) => {
      req.log.warn({ security: 'rate_limited', limiter: name, ip: req.ip }, 'Rate limit hit');
      if (onLimit) return onLimit(req, res, next);
      next(new HttpError(429, 'RATE_LIMITED', 'Too many requests. Try again in a few minutes.'));
    }
  });
}

/**
 * CSRF defence for endpoints that act on the refresh cookie. The cookie is
 * SameSite=Strict already; this also rejects any browser request whose Origin
 * is not the web app. Clients that send no Origin (curl, tests, server-side
 * callers) carry no ambient browser cookies, so they pass.
 */
export const requireSameOrigin: RequestHandler = (req, _res, next) => {
  const origin = req.get('origin');
  const fetchSite = req.get('sec-fetch-site');
  const allowed =
    fetchSite === 'same-origin' ||
    origin === config.clientOrigin ||
    (origin === undefined && (fetchSite === undefined || fetchSite === 'none'));
  if (!allowed) {
    req.log.warn({ security: 'cross_origin_blocked', origin, fetchSite, ip: req.ip }, 'Cross-origin request blocked');
    throw new HttpError(403, 'FORBIDDEN_ORIGIN', 'This request must come from the Triago app.');
  }
  next();
};

/** API responses carry tenant data: never let a browser or proxy cache them. */
export const noStore: RequestHandler = (_req, res, next) => {
  res.set('Cache-Control', 'no-store');
  next();
};
