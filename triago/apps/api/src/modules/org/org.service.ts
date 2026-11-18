import { OrgSettings, type Member, type Organisation, type OrgSettingsPatch } from '@triago/shared';
import { config } from '../../config.js';
import { prisma } from '../../lib/db.js';
import { notFound } from '../../lib/errors.js';

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
      settings: OrgSettings.parse(org.settings)
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
