import argon2 from 'argon2';
import { prisma } from '../src/lib/db.js';
import { seedOrganisation } from '../src/modules/demo/demo.fixtures.js';

/**
 * Local development data: "Acme Support" with an admin and an agent.
 * Safe to re-run; it replaces the previous seed. Run with `npm run db:seed`.
 */
const PASSWORD = 'triago-dev-password';
const USERS = [
  { email: 'admin@acme.test', name: 'Rosa Salter', role: 'admin' },
  { email: 'agent@acme.test', name: 'Sam Okafor', role: 'agent' }
] as const;

async function seed() {
  const passwordHash = await argon2.hash(PASSWORD);

  await prisma.$transaction(async (tx) => {
    await tx.user.deleteMany({ where: { email: { in: USERS.map((user) => user.email) } } });
    await tx.organisation.deleteMany({ where: { ticketPrefix: 'ACME', isDemo: false } });

    const org = await tx.organisation.create({ data: { name: 'Acme Support', ticketPrefix: 'ACME' } });
    const userIds: string[] = [];
    for (const { email, name, role } of USERS) {
      const user = await tx.user.create({
        data: { email, name, passwordHash, memberships: { create: { orgId: org.id, role } } }
      });
      userIds.push(user.id);
    }
    await seedOrganisation(tx, org.id, userIds[0]!);
  });

  console.log(`Seeded Acme Support. Sign in as ${USERS.map((u) => u.email).join(' or ')} with "${PASSWORD}".`);
}

seed()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
