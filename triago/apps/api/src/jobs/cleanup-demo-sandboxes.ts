import { logger } from '../lib/logger.js';
import { deleteExpiredSandboxes } from '../modules/demo/demo.service.js';

export const CLEANUP_DEMO_SANDBOXES = 'cleanup-demo-sandboxes';

/** Hourly: demo organisations live for a day, then go with their data. */
export async function cleanupDemoSandboxes(): Promise<void> {
  const deleted = await deleteExpiredSandboxes();
  logger.info({ deleted }, 'Deleted expired demo sandboxes');
}
