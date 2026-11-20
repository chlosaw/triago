import { PgBoss, type Job } from 'pg-boss';
import { config } from '../config.js';
import { logger } from '../lib/logger.js';
import { draftWithAi, type DraftJob } from '../modules/emails/intake.service.js';
import { runBackfill, syncAllMailboxes, syncOneMailbox, type BackfillJob } from '../modules/gmail/gmail.service.js';
import { CLEANUP_DEMO_SANDBOXES, cleanupDemoSandboxes } from './cleanup-demo-sandboxes.js';
import { applyRetention, DATA_RETENTION } from './data-retention.js';
import { DRAFT_TICKET, GMAIL_BACKFILL, setQueue, SYNC_GMAIL, SYNC_GMAIL_ORG } from './queue.js';

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

  // Nightly at 03:00 UTC: retention periods and expired sessions.
  await boss.createQueue(DATA_RETENTION, { retryLimit: 3, retryDelay: 300 });
  await boss.schedule(DATA_RETENTION, '0 3 * * *');
  await boss.work(DATA_RETENTION, async () => {
    await applyRetention();
  });

  // AI drafts for saved emails. A few at a time, so a big import doesn't hit the model's rate limit.
  await boss.createQueue(DRAFT_TICKET, { retryLimit: 2, retryDelay: 30, retryBackoff: true });
  await boss.work<DraftJob>(DRAFT_TICKET, { localConcurrency: 3 }, async (jobs: Job<DraftJob>[]) => {
    for (const job of jobs) await draftWithAi(job.data);
  });

  // Every two minutes: queue one sync per connected Gmail mailbox (at most one queued and one running each).
  await boss.createQueue(SYNC_GMAIL, { retryLimit: 0, policy: 'stately' });
  await boss.createQueue(SYNC_GMAIL_ORG, { retryLimit: 0, policy: 'stately' });
  await boss.createQueue(GMAIL_BACKFILL, { retryLimit: 3, retryDelay: 60, retryBackoff: true });
  if (config.google) await boss.schedule(SYNC_GMAIL, '*/2 * * * *');
  await boss.work(SYNC_GMAIL, syncAllMailboxes);
  await boss.work<{ orgId: string }>(
    SYNC_GMAIL_ORG,
    { localConcurrency: 3 },
    async (jobs: Job<{ orgId: string }>[]) => {
      for (const job of jobs) await syncOneMailbox(job.data.orgId);
    }
  );
  await boss.work<BackfillJob>(GMAIL_BACKFILL, async (jobs: Job<BackfillJob>[]) => {
    for (const job of jobs) await runBackfill(job.data);
  });

  // Only now that every queue exists may the app send jobs instead of running them inline.
  setQueue(boss);

  logger.info('Background jobs started');
}

export async function stopJobs(): Promise<void> {
  setQueue(null);
  await boss?.stop({ graceful: true });
  boss = null;
}
