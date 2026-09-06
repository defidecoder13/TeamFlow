/**
 * Better Auth instance for TeamFlow.
 *
 * Phase 1A foundation: email/password authentication, database-backed
 * sessions via the Prisma adapter, and secure server-side configuration.
 * All secrets come from environment variables — nothing is hard-coded.
 *
 * The instance is created lazily via `getAuth()` so importing the app does
 * not require auth secrets to be configured (tests, `/health`, etc.).
 * Better Auth's secure defaults apply: signed HttpOnly session cookies,
 * hashed credentials (never stored or logged), and built-in rate limiting
 * for sensitive endpoints.
 */

import { betterAuth } from 'better-auth';
import { prismaAdapter } from 'better-auth/adapters/prisma';
import { getPrisma } from './prisma';

function requireEnv(name: 'BETTER_AUTH_SECRET' | 'BETTER_AUTH_URL'): string {
  const value = process.env[name];
  if (!value || value.trim().length === 0) {
    throw new Error(
      `${name} is not set. Copy .env.example to .env and configure it (never commit real secrets).`,
    );
  }
  return value;
}

function createAuthOptions() {
  return {
    secret: requireEnv('BETTER_AUTH_SECRET'),
    baseURL: requireEnv('BETTER_AUTH_URL'),
    trustedOrigins: getTrustedOrigins(),
    database: prismaAdapter(getPrisma(), {
      provider: 'postgresql',
    }),
    emailAndPassword: {
      enabled: true,
    },
  };
}

/** Shared Better Auth options (also used by the CLI schema-generation entrypoint). */
export function buildAuthOptions(): ReturnType<typeof createAuthOptions> {
  return createAuthOptions();
}

/**
 * Browser origins allowed to make credentialed requests to the API.
 * Single source of truth shared by CORS middleware and Better Auth's
 * trusted origins. Empty (default) = same-origin only; never a wildcard
 * when credentials are involved.
 */
export function getTrustedOrigins(): string[] {
  const raw = process.env.CORS_ORIGIN;
  if (!raw) {
    return [];
  }
  return raw
    .split(',')
    .map((origin) => origin.trim())
    .filter((origin) => origin.length > 0);
}

function createAuth() {
  return betterAuth(buildAuthOptions());
}

export type Auth = ReturnType<typeof createAuth>;

/**
 * Minimal Better Auth surface consumed by the API layer (session resolution
 * and request handling). Concrete instances vary by database adapter in their
 * `options` type only; `api` and `handler` are shared. Depending on this
 * narrow type keeps route/middleware code adapter-agnostic and testable.
 */
export type AuthContext = Pick<Auth, 'api' | 'handler'>;

let auth: Auth | undefined;

export function getAuth(): Auth {
  auth ??= createAuth();
  return auth;
}
