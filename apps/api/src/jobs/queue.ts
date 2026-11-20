import type { PgBoss, SendOptions } from 'pg-boss';

/**
 * The running job queue, or null when jobs are off (tests, JOBS_ENABLED=false, or
 * pg-boss failed to start). Callers pass a fallback that does the work inline,
 * so nothing is ever left waiting for a queue that isn't there.
 */
let boss: PgBoss | null = null;

export function setQueue(instance: PgBoss | null) {
  boss = instance;
}

export const DRAFT_TICKET = 'draft-ticket';
export const SYNC_GMAIL = 'sync-gmail';
export const SYNC_GMAIL_ORG = 'sync-gmail-org';
export const GMAIL_BACKFILL = 'gmail-backfill';

/** Queues a job; without a queue, runs `inline` now instead. */
export async function enqueue<T extends object>(
  name: string,
  data: T,
  inline: (data: T) => Promise<unknown>,
  options: SendOptions = {}
): Promise<void> {
  if (boss) {
    await boss.send(name, data, options);
    return;
  }
  await inline(data);
}
