import { defineConfig } from 'vitest/config';
import { testDatabaseUrl } from './tests/test-env.js';

export default defineConfig({
  test: {
    globalSetup: ['tests/global-setup.ts'],
    // Tests share one database, so run files one at a time.
    fileParallelism: false,
    env: {
      NODE_ENV: 'test',
      DATABASE_URL: testDatabaseUrl,
      JWT_SECRET: 'test-secret-that-is-long-enough',
      INBOUND_EMAIL_DOMAIN: 'in.triago.test',
      INBOUND_WEBHOOK_SECRET: 'test-inbound-secret-that-is-long-enough'
    }
  }
});
