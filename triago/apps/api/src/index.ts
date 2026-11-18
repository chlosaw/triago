import { createApp } from './app.js';
import { config } from './config.js';
import { startJobs, stopJobs } from './jobs/index.js';
import { prisma } from './lib/db.js';
import { logger } from './lib/logger.js';

const server = createApp().listen(config.port, () => {
  logger.info(`Triago API listening on http://localhost:${config.port}`);
});

if (config.jobsEnabled) {
  startJobs().catch((error) => logger.error({ err: error }, 'Could not start background jobs'));
}

// Finish in-flight requests and jobs before exiting (docker stop, deploys).
async function shutdown(signal: string) {
  logger.info({ signal }, 'Shutting down');
  server.close();
  await stopJobs();
  await prisma.$disconnect();
  process.exit(0);
}
process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));
