/**
 * Eager Better Auth instance for the Better Auth CLI ONLY.
 *
 * The CLI (`pnpm dlx auth@latest generate`) requires an exported `auth`
 * instance, while application code must use the lazy `getAuth()` from
 * `./auth` (importing the app must never require secrets at load time).
 * This file bridges the two: it builds the exact same options and is never
 * imported by application code or tests.
 *
 * Usage (dummy values are fine — generation never touches the database):
 *
 *   BETTER_AUTH_SECRET=dummy-secret-for-schema-generation-only \
 *   BETTER_AUTH_URL=http://localhost:4000 \
 *   DATABASE_URL=postgresql://teamflow:teamflow@localhost:5432/teamflow \
 *   pnpm dlx auth@latest generate \
 *     --config ./apps/api/src/modules/auth/auth.cli.ts \
 *     --output ./packages/db/prisma/schema.prisma -y
 */

import { betterAuth } from 'better-auth';
import { buildAuthOptions } from './auth';

export const auth = betterAuth(buildAuthOptions());
