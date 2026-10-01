/**
 * Authentication module boundary (Clerk migration).
 *
 * request → verified Clerk session → provisioned local user → route handler
 */

export { getPrisma } from './prisma';
export { createMeRouter } from './me';
export {
  getClerkAuthUser,
  getClerkSession,
  provisionClerkUser,
  requireClerkAuth,
  verifyBearerToken,
  type ClerkDirectory,
  type ClerkDirectoryUser,
  type ClerkRouteOptions,
  type ClerkTokenVerifier,
} from './clerk';
export { toSafeUser, type MeResponse, type SafeAuthUser } from './session';
