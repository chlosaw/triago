import crypto from 'node:crypto';
import { prisma, type Tx } from '../../lib/db.js';
import { seedOrganisation } from './demo.fixtures.js';

const DEMO_EMAIL_DOMAIN = 'demo.triago.app';
const SANDBOX_LIFETIME_MS = 24 * 60 * 60 * 1000;

/** Creates a private organisation with sample tickets and an admin visitor to own it. */
export async function createSandbox(tx: Tx): Promise<{ userId: string; orgId: string }> {
  const suffix = crypto.randomBytes(4).toString('hex');
  const user = await tx.user.create({
    data: { email: `visitor-${suffix}@${DEMO_EMAIL_DOMAIN}`, name: 'Demo Agent' },
    select: { id: true }
  });
  const org = await tx.organisation.create({
    data: {
      name: 'Brightloom Support',
      ticketPrefix: 'BRT',
      isDemo: true,
      memberships: { create: { userId: user.id, role: 'admin' } }
    },
    select: { id: true }
  });
  await seedOrganisation(tx, org.id, user.id);
  return { userId: user.id, orgId: org.id };
}

/** Deletes sandboxes (and their visitors) older than a day. Returns how many organisations went. */
export async function deleteExpiredSandboxes(): Promise<number> {
  const cutoff = new Date(Date.now() - SANDBOX_LIFETIME_MS);
  return prisma.$transaction(async (tx) => {
    await tx.user.deleteMany({ where: { email: { endsWith: `@${DEMO_EMAIL_DOMAIN}` }, createdAt: { lt: cutoff } } });
    const { count } = await tx.organisation.deleteMany({ where: { isDemo: true, createdAt: { lt: cutoff } } });
    return count;
  });
}
