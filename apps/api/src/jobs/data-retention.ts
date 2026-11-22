import { prisma } from '../lib/db.js';
import { logger } from '../lib/logger.js';

export const DATA_RETENTION = 'data-retention';

/** Revoked refresh tokens are kept this long, so reuse of a stolen one is still recognised. */
const REVOKED_TOKEN_DAYS = 30;

/**
 * Nightly: deletes closed tickets past each organisation's retention period
 * (`settings.retentionDays`, 0 = keep), and session tokens nobody can use any more.
 * Deleting a ticket also deletes its emails, notes, events and files.
 */
export async function applyRetention(): Promise<{
  tickets: number;
  tokens: number;
  resetLinks: number;
  invitations: number;
}> {
  const tickets = await prisma.$executeRaw`
    delete from tickets t
     using organisations o
     where t.org_id = o.id
       and coalesce((o.settings->>'retentionDays')::int, 0) > 0
       and t.status in ('closed', 'resolved', 'dismissed')
       and t.updated_at < now() - make_interval(days => (o.settings->>'retentionDays')::int)`;

  const tokens = await prisma.$executeRaw`
    delete from refresh_tokens
     where expires_at < now()
        or revoked_at < now() - make_interval(days => ${REVOKED_TOKEN_DAYS})`;

  const resetLinks = await prisma.$executeRaw`
    delete from password_reset_tokens where expires_at < now() - interval '1 day'`;

  // Used or expired invitations hold an email address and nothing else useful.
  const invitations = await prisma.$executeRaw`
    delete from invitations where expires_at < now() - interval '1 day' or accepted_at < now() - interval '30 days'`;

  logger.info({ tickets, tokens, resetLinks, invitations }, 'Applied data retention');
  return { tickets, tokens, resetLinks, invitations };
}
