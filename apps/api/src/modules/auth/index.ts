/**
 * Authentication module boundary.
 *
 * Phase 1A established the Better Auth instance (lazy) and Prisma accessor.
 * Phase 1B adds server-side session helpers and the identity route:
 *
 *   request → Better Auth session → authenticated user → route handler
 */

export { getAuth, getTrustedOrigins, type Auth, type AuthContext } from './auth';
export { getPrisma } from './prisma';
export { createMeRouter } from './me';
export {
  getSessionUser,
  requireAuth,
  toSafeUser,
  type MeResponse,
  type SafeAuthUser,
} from './session';
