/**
 * Database package entry point.
 *
 * Importing this module is side-effect free: the PrismaClient is never
 * instantiated here because construction requires DATABASE_URL. Consumers
 * (e.g. the API auth module) create clients explicitly via
 * `createPrismaClient()`, which fails fast with a clear error when the
 * connection string is missing.
 */

import { PrismaClient } from '@prisma/client';

export { PrismaClient };
export type {
  PrismaClient as PrismaClientType,
  Channel,
  ChannelMembership,
  ChannelType,
  Invitation,
  Message,
  Workspace,
  WorkspaceMembership,
  WorkspaceRole,
} from '@prisma/client';

export function getDatabaseUrl(): string {
  const url = process.env.DATABASE_URL;
  if (!url || url.trim().length === 0) {
    throw new Error('DATABASE_URL is not set. Copy .env.example to .env and configure it.');
  }
  return url;
}

export function createPrismaClient(): PrismaClient {
  return new PrismaClient({ datasourceUrl: getDatabaseUrl() });
}
