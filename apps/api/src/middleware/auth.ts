import type { Request, RequestHandler } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../config.js';
import { prisma } from '../lib/db.js';
import { HttpError } from '../lib/errors.js';

export type Role = 'admin' | 'agent';

/** Who is calling and which organisation they are acting in. */
export interface AuthContext {
  userId: string;
  orgId: string;
  role: Role;
}

interface AccessTokenPayload {
  sub: string;
  org: string;
  role: Role;
}

export function signAccessToken(auth: AuthContext): string {
  const payload: AccessTokenPayload = { sub: auth.userId, org: auth.orgId, role: auth.role };
  return jwt.sign(payload, config.jwtSecret, {
    algorithm: 'HS256',
    expiresIn: config.accessTokenTtlSeconds,
    issuer: config.jwtIssuer,
    audience: config.jwtAudience
  });
}

export const requireAuth: RequestHandler = (req, _res, next) => {
  const header = req.headers.authorization ?? '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) throw new HttpError(401, 'UNAUTHENTICATED', 'Sign in to continue.');

  try {
    const payload = jwt.verify(token, config.jwtSecret, {
      algorithms: ['HS256'],
      issuer: config.jwtIssuer,
      audience: config.jwtAudience
    }) as AccessTokenPayload;
    req.auth = { userId: payload.sub, orgId: payload.org, role: payload.role };
  } catch {
    throw new HttpError(401, 'UNAUTHENTICATED', 'Session expired. Sign in again.');
  }
  next();
};

export const requireRole =
  (role: Role): RequestHandler =>
  (req, _res, next) => {
    const auth = getAuth(req);
    if (auth.role !== role) {
      req.log.warn(
        { security: 'forbidden', userId: auth.userId, orgId: auth.orgId, role: auth.role, needed: role },
        'Permission denied'
      );
      throw new HttpError(403, 'FORBIDDEN', `Only ${role}s can do this.`);
    }
    next();
  };

const READ_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * Access tokens are stateless and live 15 minutes. For anything that changes data,
 * check the membership in the database too, so a removed member is locked out and a
 * demoted admin loses admin rights at once, not at the next token refresh.
 * Reads skip the query; the worst case there is 15 minutes of read access.
 */
export const requireCurrentMembership: RequestHandler = async (req, _res, next) => {
  if (READ_METHODS.has(req.method)) return next();
  const auth = getAuth(req);
  const membership = await prisma.membership.findUnique({
    where: { orgId_userId: { orgId: auth.orgId, userId: auth.userId } },
    select: { role: true }
  });
  if (!membership) throw new HttpError(401, 'UNAUTHENTICATED', 'You no longer have access to this organisation.');
  req.auth = { ...auth, role: membership.role };
  next();
};

/** requireAuth plus the membership check for writes: what every organisation route uses. */
export const requireMember: RequestHandler[] = [requireAuth, requireCurrentMembership];

/** The caller's auth context; only valid on routes behind requireAuth. */
export function getAuth(req: Request): AuthContext {
  if (!req.auth) throw new HttpError(401, 'UNAUTHENTICATED', 'Sign in to continue.');
  return req.auth;
}
