import crypto from 'node:crypto';
import type { InvitationPreview, Profile, RegisterBody, Role } from '@triago/shared';
import argon2 from 'argon2';
import { config } from '../../config.js';
import { prisma, type Tx } from '../../lib/db.js';
import { HttpError } from '../../lib/errors.js';
import { logger } from '../../lib/logger.js';
import { signAccessToken, type AuthContext } from '../../middleware/auth.js';
import { createSandbox } from '../demo/demo.service.js';
import { hashInviteToken } from '../org/team.service.js';

export interface Session {
  accessToken: string;
  refreshToken: string;
}

const sessionExpired = () => new HttpError(401, 'UNAUTHENTICATED', 'Session expired. Sign in again.');

// Verified against when the email is unknown, so a failed login takes the same
// time whether or not the account exists.
const DUMMY_HASH = await argon2.hash('not-a-real-password');

const hashToken = (token: string) => crypto.createHash('sha256').update(token).digest('hex');

async function issueSession(tx: Tx, auth: AuthContext, familyId: string = crypto.randomUUID()): Promise<Session> {
  const refreshToken = crypto.randomBytes(32).toString('base64url');
  await tx.refreshToken.create({
    data: {
      userId: auth.userId,
      orgId: auth.orgId,
      familyId,
      tokenHash: hashToken(refreshToken),
      expiresAt: new Date(Date.now() + config.refreshTokenTtlDays * 24 * 60 * 60 * 1000)
    }
  });
  return { accessToken: signAccessToken(auth), refreshToken };
}

export async function register(input: RegisterBody): Promise<Session> {
  const passwordHash = await argon2.hash(input.password);

  return prisma.$transaction(async (tx) => {
    if (await tx.user.findUnique({ where: { email: input.email }, select: { id: true } })) {
      throw new HttpError(409, 'EMAIL_TAKEN', 'An account with this email already exists.', {
        email: 'Already registered'
      });
    }
    const user = await tx.user.create({
      data: { email: input.email, passwordHash, name: input.name },
      select: { id: true }
    });
    const org = await tx.organisation.create({
      data: { name: input.organisation, memberships: { create: { userId: user.id, role: 'admin' } } },
      select: { id: true }
    });
    return issueSession(tx, { userId: user.id, orgId: org.id, role: 'admin' });
  });
}

export async function login(email: string, password: string): Promise<Session> {
  // A user can belong to several organisations; sign in to the oldest
  // membership until org switching exists.
  const user = await prisma.user.findUnique({
    where: { email },
    include: { memberships: { orderBy: { createdAt: 'asc' }, take: 1 } }
  });
  const membership = user?.memberships[0];

  const valid = await argon2.verify(user?.passwordHash ?? DUMMY_HASH, password);
  if (!user?.passwordHash || !membership || !valid) {
    throw new HttpError(401, 'INVALID_CREDENTIALS', 'Email or password is incorrect.');
  }
  return prisma.$transaction((tx) =>
    issueSession(tx, { userId: user.id, orgId: membership.orgId, role: membership.role })
  );
}

/**
 * Exchanges a refresh token for a new pair. Presenting a token that was
 * already rotated means it leaked: the whole family is revoked.
 *
 * Exception: two tabs often refresh at the same moment with the same cookie.
 * A token rotated in the last few seconds is accepted again as long as its
 * family is still live, so the slower tab is not mistaken for a thief.
 */
export async function refresh(refreshToken: string): Promise<Session> {
  const session = await prisma.$transaction(async (tx) => {
    // Raw SQL for the row lock and the grace-window check in one statement.
    const [token] = await tx.$queryRaw<
      {
        id: string;
        user_id: string;
        org_id: string;
        family_id: string;
        revoked: boolean;
        expired: boolean;
        in_grace: boolean;
      }[]
    >`
      select t.id, t.user_id, t.org_id, t.family_id,
             t.revoked_at is not null as revoked,
             t.expires_at < now() as expired,
             coalesce(t.revoked_at > now() - make_interval(secs => ${config.refreshReuseGraceSeconds})
               and exists (select 1 from refresh_tokens live
                            where live.family_id = t.family_id
                              and live.revoked_at is null
                              and live.expires_at > now()), false) as in_grace
        from refresh_tokens t where t.token_hash = ${hashToken(refreshToken)}
         for update`;

    if (!token || token.expired) throw sessionExpired();
    if (token.revoked && !token.in_grace) {
      logger.warn(
        { security: 'refresh_token_reuse', userId: token.user_id, orgId: token.org_id, familyId: token.family_id },
        'Rotated refresh token reused; revoking the session family'
      );
      // Return instead of throwing so the revocation commits.
      await tx.refreshToken.updateMany({
        where: { familyId: token.family_id, revokedAt: null },
        data: { revokedAt: new Date() }
      });
      return null;
    }

    // Re-read the role so a demotion takes effect at the next refresh.
    const membership = await tx.membership.findUnique({
      where: { orgId_userId: { orgId: token.org_id, userId: token.user_id } },
      select: { role: true }
    });
    if (!membership) throw new HttpError(401, 'UNAUTHENTICATED', 'You no longer have access to this organisation.');

    if (!token.revoked) {
      await tx.refreshToken.update({ where: { id: token.id }, data: { revokedAt: new Date() } });
    }
    return issueSession(tx, { userId: token.user_id, orgId: token.org_id, role: membership.role }, token.family_id);
  });

  if (!session) throw sessionExpired();
  return session;
}

export async function logout(refreshToken: string): Promise<void> {
  const token = await prisma.refreshToken.findUnique({
    where: { tokenHash: hashToken(refreshToken) },
    select: { familyId: true }
  });
  if (!token) return;
  await prisma.refreshToken.updateMany({
    where: { familyId: token.familyId, revokedAt: null },
    data: { revokedAt: new Date() }
  });
}

/** Signs a visitor into a fresh sandbox organisation; no account needed. */
export async function startDemo(): Promise<Session> {
  return prisma.$transaction(
    async (tx) => {
      const { userId, orgId } = await createSandbox(tx);
      return issueSession(tx, { userId, orgId, role: 'admin' });
      // Seeding runs ~150 queries; against a remote database (e.g. Neon, ~50 ms a round trip)
      // that takes longer than Prisma's 5 s default.
    },
    { timeout: 30_000, maxWait: 10_000 }
  );
}

export async function getProfile(auth: AuthContext): Promise<Profile> {
  const membership = await prisma.membership.findUnique({
    where: { orgId_userId: { orgId: auth.orgId, userId: auth.userId } },
    include: { user: true, org: true }
  });
  if (!membership) throw new HttpError(401, 'UNAUTHENTICATED', 'You no longer have access to this organisation.');

  const all = await prisma.membership.findMany({
    where: { userId: auth.userId },
    orderBy: { createdAt: 'asc' },
    select: { role: true, org: { select: { id: true, name: true } } }
  });
  return {
    user: { id: membership.user.id, name: membership.user.name, email: membership.user.email },
    org: { id: membership.org.id, name: membership.org.name, isDemo: membership.org.isDemo },
    role: membership.role satisfies Role,
    orgs: all.map((m) => ({ id: m.org.id, name: m.org.name, role: m.role }))
  };
}

/** A new session in another organisation the user belongs to. */
export async function switchOrganisation(auth: AuthContext, orgId: string): Promise<Session> {
  return prisma.$transaction(async (tx) => {
    const membership = await tx.membership.findUnique({
      where: { orgId_userId: { orgId, userId: auth.userId } },
      select: { role: true }
    });
    if (!membership) throw new HttpError(403, 'FORBIDDEN', "You're not a member of that organisation.");
    return issueSession(tx, { userId: auth.userId, orgId, role: membership.role });
  });
}

const invitationGone = () =>
  new HttpError(400, 'INVALID_INVITATION', 'This invitation has expired, was revoked or was already used.');

/** What the invitation page shows. Knowing the token is what grants access, as with a reset link. */
export async function previewInvitation(token: string): Promise<InvitationPreview> {
  const row = await prisma.invitation.findUnique({
    where: { tokenHash: hashInviteToken(token) },
    include: { org: { select: { name: true } }, invitedBy: { select: { name: true } } }
  });
  if (!row || row.acceptedAt || row.expiresAt < new Date()) throw invitationGone();
  const user = await prisma.user.findUnique({ where: { email: row.email }, select: { passwordHash: true } });
  return {
    orgName: row.org.name,
    email: row.email,
    role: row.role,
    invitedBy: row.invitedBy?.name ?? null,
    accountExists: Boolean(user?.passwordHash)
  };
}

/**
 * Joins the organisation from an invitation and signs in to it. A new person creates
 * their account here (the emailed link proves the address is theirs); someone who
 * already has an account proves it with their password.
 */
export async function acceptInvitation(input: { token: string; name?: string; password: string }): Promise<Session> {
  // Hashed outside the transaction; only used if this turns out to be a new account.
  const newHash = await argon2.hash(input.password);
  return prisma.$transaction(async (tx) => {
    const [invite] = await tx.$queryRaw<{ id: string; org_id: string; email: string; role: Role; usable: boolean }[]>`
      select id, org_id, email::text as email, role::text as role,
             (accepted_at is null and expires_at > now()) as usable
        from invitations where token_hash = ${hashInviteToken(input.token)} for update`;
    if (!invite?.usable) throw invitationGone();

    let user = await tx.user.findUnique({
      where: { email: invite.email },
      select: { id: true, passwordHash: true }
    });
    if (user) {
      const valid = user.passwordHash ? await argon2.verify(user.passwordHash, input.password) : false;
      if (!valid) throw new HttpError(401, 'INVALID_CREDENTIALS', 'That password is not right for this account.');
    } else {
      if (!input.name) throw new HttpError(400, 'VALIDATION_FAILED', 'Enter your name.', { name: 'Enter your name.' });
      if (input.password.length < 10) {
        throw new HttpError(400, 'VALIDATION_FAILED', 'Use at least 10 characters.', {
          password: 'Use at least 10 characters.'
        });
      }
      user = await tx.user.create({
        data: { email: invite.email, name: input.name, passwordHash: newHash },
        select: { id: true, passwordHash: true }
      });
    }

    const existing = await tx.membership.findUnique({
      where: { orgId_userId: { orgId: invite.org_id, userId: user.id } },
      select: { role: true }
    });
    const role = existing?.role ?? invite.role;
    if (!existing) await tx.membership.create({ data: { orgId: invite.org_id, userId: user.id, role } });
    await tx.invitation.update({ where: { id: invite.id }, data: { acceptedAt: new Date() } });
    logger.info({ orgId: invite.org_id, userId: user.id }, 'Invitation accepted');
    return issueSession(tx, { userId: user.id, orgId: invite.org_id, role });
  });
}
