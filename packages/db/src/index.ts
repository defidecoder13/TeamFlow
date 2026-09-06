/**
 * Database package entry point.
 *
 * Phase 0 intentionally does NOT instantiate a PrismaClient at import time:
 * there are no domain models yet and no DATABASE_URL is required just to
 * load this module. Consumers validate configuration via `getDatabaseUrl()`.
 */

export { PrismaClient } from '@prisma/client';

export function getDatabaseUrl(): string {
  const url = process.env.DATABASE_URL;
  if (!url || url.trim().length === 0) {
    throw new Error('DATABASE_URL is not set. Copy .env.example to .env and configure it.');
  }
  return url;
}
