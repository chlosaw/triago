import { PgBoss } from 'pg-boss';
import { config } from '../config.js';
import { logger } from '../lib/logger.js';
import { syncAllMailboxes } from '../modules/gmail/gmail.service.js';
import { CLEANUP_DEMO_SANDBOXES, cleanupDemoSandboxes } from './cleanup-demo-sandboxes.js';

const SYNC_GMAIL = 'sync-gmail';

// Background work runs on pg-boss: jobs are rows in Postgres (schema
// "pgboss"), so retries and schedules survive restarts without extra services.

let boss: PgBoss | null = null;

export async function startJobs(): Promise<void> {
  boss = new PgBoss(config.databaseUrl);
  boss.on('error', (error) => logger.error({ err: error }, 'pg-boss error'));
  await boss.start();

  await boss.createQueue(CLEANUP_DEMO_SANDBOXES, { retryLimit: 3, retryDelay: 60, retryBackoff: true });
  await boss.schedule(CLEANUP_DEMO_SANDBOXES, '0 * * * *');
  await boss.work(CLEANUP_DEMO_SANDBOXES, cleanupDemoSandboxes);

  // Every two minutes: new mail from each connected Gmail mailbox. No retries; the next run catches up.
  if (config.google) {
    await boss.createQueue(SYNC_GMAIL, { retryLimit: 0, policy: 'stately' });
    await boss.schedule(SYNC_GMAIL, '*/2 * * * *');
    await boss.work(SYNC_GMAIL, syncAllMailboxes);
  }

  logger.info('Background jobs started');
}

export async function stopJobs(): Promise<void> {
  await boss?.stop({ graceful: true });
  boss = null;
}
