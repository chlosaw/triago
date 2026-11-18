import { PrismaPg } from '@prisma/adapter-pg';
import { config } from '../config.js';
import { PrismaClient, type Prisma } from '../generated/prisma/client.js';

export const prisma = new PrismaClient({
  adapter: new PrismaPg({
    connectionString: config.databaseUrl,
    // With a non-UTC session time zone the pg adapter shifts JS dates by the
    // offset, on writes and on $queryRaw reads. Pin every connection to UTC.
    options: '-c TimeZone=UTC'
  })
});

/** The client inside prisma.$transaction(async (tx) => ...). */
export type Tx = Prisma.TransactionClient;
