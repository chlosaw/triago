import path from 'node:path';
import { defineConfig } from 'prisma/config';

// Prisma 7 does not read .env itself. Locally use the repo-root .env;
// in containers and CI the variables are already set.
try {
  process.loadEnvFile(path.resolve(process.cwd(), '../../.env'));
} catch {
  // No .env file.
}

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
    seed: 'tsx prisma/seed.ts'
  },
  datasource: {
    url: process.env.DATABASE_URL!,
    // Only needed by `prisma migrate dev` and drift checks.
    shadowDatabaseUrl: process.env.SHADOW_DATABASE_URL
  }
});
