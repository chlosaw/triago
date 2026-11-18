import { execSync } from 'node:child_process';
import { testDatabaseUrl } from './test-env.js';

/** Applies migrations to the test database once, before any test file runs. */
export default function setup() {
  execSync('npx prisma migrate deploy', {
    env: { ...process.env, DATABASE_URL: testDatabaseUrl },
    stdio: 'inherit'
  });
}
