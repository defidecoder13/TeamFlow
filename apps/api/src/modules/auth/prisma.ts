/**
 * PrismaClient singleton for the API.
 *
 * Created lazily on first use (never at import time) so that importing the
 * application — e.g. in tests — does not require DATABASE_URL to be set.
 * The singleton is cached for the lifetime of the process; `tsx watch`
 * restarts the process on file changes, so no stale-client handling is needed.
 */

import { createPrismaClient, type PrismaClient } from '@teamflow/db';

let prisma: PrismaClient | undefined;

export function getPrisma(): PrismaClient {
  prisma ??= createPrismaClient();
  return prisma;
}
