import { OrgSettings, type Member, type Organisation, type OrgSettingsPatch } from '@triago/shared';
import { config } from '../../config.js';
import { prisma } from '../../lib/db.js';
import { notFound } from '../../lib/errors.js';
import { disconnect as disconnectGmail, gmailStatus } from '../gmail/gmail.service.js';
import { HttpError } from '../../lib/errors.js';
import { logger } from '../../lib/logger.js';

export async function getOrganisation(orgId: string): Promise<{ org: Organisation; members: Member[] }> {
  const org = await prisma.organisation.findUnique({
    where: { id: orgId },
    include: { memberships: { include: { user: true }, orderBy: { createdAt: 'asc' } } }
  });
  if (!org) throw notFound('Organisation');

  return {
    org: {
      id: org.id,
      name: org.name,
      ticketPrefix: org.ticketPrefix,
      isDemo: org.isDemo,
      // Only shown once inbound mail is configured, so the app never shows an address that bounces.
      inboundAddress:
        config.inboundEmailDomain && config.inboundWebhookSecret
          ? `${org.inboundSlug}@${config.inboundEmailDomain}`
          : null,
      settings: OrgSettings.parse(org.settings),
      gmail: await gmailStatus(orgId)
    },
    members: org.memberships.map(({ user, role }) => ({ id: user.id, name: user.name, email: user.email, role }))
  };
}

/** Merges the patch into the stored settings in one statement, so concurrent saves do not overwrite each other. */
export async function updateSettings(orgId: string, patch: OrgSettingsPatch): Promise<OrgSettings> {
  const [row] = await prisma.$queryRaw<{ settings: unknown }[]>`
    update organisations set settings = settings || ${JSON.stringify(patch)}::jsonb
     where id = ${orgId}::uuid
     returning settings`;
  if (!row) throw notFound('Organisation');
  return OrgSettings.parse(row.settings);
}

/**
 * Deletes an organisation and everything in it: tickets, emails, notes, files,
 * events, sessions and the Gmail connection (revoked at Google first). Members
 * who belong to no other organisation are deleted too, so no personal data is left.
 */
export async function deleteOrganisation(orgId: string, confirmName: string): Promise<void> {
  const org = await prisma.organisation.findUnique({
    where: { id: orgId },
    select: { name: true, memberships: { select: { userId: true } } }
  });
  if (!org) throw notFound('Organisation');
  if (confirmName.trim() !== org.name.trim()) {
    throw new HttpError(400, 'VALIDATION_FAILED', 'The name does not match.', { confirmName: 'Type the exact name' });
  }

  // Outside the transaction: a network call to Google. A failure here doesn't block the delete.
  await disconnectGmail(orgId).catch((error: unknown) => logger.warn({ orgId, err: error }, 'Gmail revoke failed'));

  const userIds = org.memberships.map((m) => m.userId);
  await prisma.$transaction(async (tx) => {
    // Cascades to memberships, tickets (and their messages, events, attachments), refresh tokens, Gmail.
    await tx.organisation.delete({ where: { id: orgId } });
    await tx.user.deleteMany({ where: { id: { in: userIds }, memberships: { none: {} } } });
  });
  logger.info({ orgId, users: userIds.length }, 'Organisation deleted');
}
