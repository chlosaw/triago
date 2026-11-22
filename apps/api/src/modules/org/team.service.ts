import crypto from 'node:crypto';
import { INVITATION_TTL_DAYS, type Invitation, type InviteBody, type Role } from '@triago/shared';
import { config } from '../../config.js';
import { prisma, type Tx } from '../../lib/db.js';
import { HttpError, notFound } from '../../lib/errors.js';
import { logger } from '../../lib/logger.js';
import { sendMail } from '../../lib/mailer.js';
import type { AuthContext } from '../../middleware/auth.js';

export const hashInviteToken = (token: string) => crypto.createHash('sha256').update(token).digest('hex');

/** Pending: not accepted and not expired. Revoked invitations are deleted. */
const pending = () => ({ acceptedAt: null, expiresAt: { gt: new Date() } });

export async function listInvitations(orgId: string): Promise<Invitation[]> {
  const rows = await prisma.invitation.findMany({
    where: { orgId, ...pending() },
    orderBy: { createdAt: 'desc' },
    include: { invitedBy: { select: { name: true } } }
  });
  return rows.map((row) => ({
    id: row.id,
    email: row.email,
    role: row.role,
    invitedBy: row.invitedBy?.name ?? null,
    createdAt: row.createdAt.toISOString(),
    expiresAt: row.expiresAt.toISOString()
  }));
}

/**
 * Emails a single-use link to join the organisation. Inviting the same address again
 * replaces the earlier link, so only the newest one works.
 */
export async function createInvitation(auth: AuthContext, input: InviteBody): Promise<Invitation> {
  const org = await prisma.organisation.findUniqueOrThrow({
    where: { id: auth.orgId },
    select: { name: true, isDemo: true }
  });
  // The demo is open to anyone; it must not become a way to send email to strangers.
  if (org.isDemo) throw new HttpError(403, 'DEMO', 'Invitations are turned off in the demo.');

  const member = await prisma.membership.findFirst({
    where: { orgId: auth.orgId, user: { email: input.email } },
    select: { userId: true }
  });
  if (member) {
    throw new HttpError(409, 'ALREADY_MEMBER', 'That person is already in this organisation.', {
      email: 'Already a member'
    });
  }

  const token = crypto.randomBytes(32).toString('base64url');
  const inviter = await prisma.user.findUniqueOrThrow({ where: { id: auth.userId }, select: { name: true } });
  const row = await prisma.$transaction(async (tx) => {
    await tx.invitation.deleteMany({ where: { orgId: auth.orgId, email: input.email, acceptedAt: null } });
    return tx.invitation.create({
      data: {
        orgId: auth.orgId,
        email: input.email,
        role: input.role,
        tokenHash: hashInviteToken(token),
        invitedById: auth.userId,
        expiresAt: new Date(Date.now() + INVITATION_TTL_DAYS * 24 * 60 * 60 * 1000)
      }
    });
  });

  const link = new URL('/invite', config.clientOrigin);
  link.searchParams.set('token', token);
  await sendMail({
    to: input.email,
    subject: `${inviter.name} invited you to ${org.name} on Triago`,
    text: [
      `${inviter.name} invited you to join ${org.name} on Triago as ${input.role === 'admin' ? 'an admin' : 'an agent'}.`,
      '',
      `Accept the invitation (the link works once, for ${INVITATION_TTL_DAYS} days):`,
      link.toString(),
      '',
      "If you weren't expecting this, ignore this email."
    ].join('\n')
  });
  logger.info({ orgId: auth.orgId, invitationId: row.id }, 'Invitation sent');

  return {
    id: row.id,
    email: row.email,
    role: row.role,
    invitedBy: inviter.name,
    createdAt: row.createdAt.toISOString(),
    expiresAt: row.expiresAt.toISOString()
  };
}

export async function revokeInvitation(orgId: string, id: string): Promise<void> {
  const { count } = await prisma.invitation.deleteMany({ where: { orgId, id, acceptedAt: null } });
  if (!count) throw notFound('Invitation');
}

/** Refuses a change that would leave the organisation without an admin. */
async function assertAnotherAdmin(tx: Tx, orgId: string, userId: string) {
  const others = await tx.membership.count({ where: { orgId, role: 'admin', userId: { not: userId } } });
  if (!others) {
    throw new HttpError(409, 'LAST_ADMIN', 'Make someone else an admin first: an organisation needs at least one.');
  }
}

export async function updateMemberRole(orgId: string, userId: string, role: Role): Promise<void> {
  await prisma.$transaction(async (tx) => {
    // Serialise role changes per organisation, so two admins can't demote each other at once.
    await tx.$queryRaw`select id from organisations where id = ${orgId}::uuid for update`;
    const membership = await tx.membership.findUnique({ where: { orgId_userId: { orgId, userId } } });
    if (!membership) throw notFound('Member');
    if (membership.role === 'admin' && role !== 'admin') await assertAnotherAdmin(tx, orgId, userId);
    await tx.membership.update({ where: { orgId_userId: { orgId, userId } }, data: { role } });
  });
}

/**
 * Removes someone from the organisation (an admin removing a member, or a member
 * leaving). Their sessions for this organisation end, their tickets here become
 * unassigned, and if they belong to no other organisation their account is deleted.
 */
export async function removeMember(auth: AuthContext, userId: string): Promise<void> {
  if (userId !== auth.userId && auth.role !== 'admin') {
    throw new HttpError(403, 'FORBIDDEN', 'Only admins can remove other members.');
  }
  await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`select id from organisations where id = ${auth.orgId}::uuid for update`;
    const membership = await tx.membership.findUnique({
      where: { orgId_userId: { orgId: auth.orgId, userId } }
    });
    if (!membership) throw notFound('Member');
    if (membership.role === 'admin') await assertAnotherAdmin(tx, auth.orgId, userId);

    await tx.membership.delete({ where: { orgId_userId: { orgId: auth.orgId, userId } } });
    await tx.ticket.updateMany({ where: { orgId: auth.orgId, assigneeId: userId }, data: { assigneeId: null } });
    await tx.refreshToken.updateMany({
      where: { orgId: auth.orgId, userId, revokedAt: null },
      data: { revokedAt: new Date() }
    });
    await tx.user.deleteMany({ where: { id: userId, memberships: { none: {} } } });
  });
  logger.info({ orgId: auth.orgId, removedBy: auth.userId, self: userId === auth.userId }, 'Member removed');
}
