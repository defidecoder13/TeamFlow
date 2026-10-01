/**
 * Server-side session shape (Clerk migration).
 *
 * Identity ALWAYS comes from a verified Clerk session, resolved in
 * `clerk.ts` (`requireClerkAuth`). Client-supplied values (query params,
 * body fields, custom headers) are never consulted for identity.
 *
 * This module keeps the shared safe-user projection only.
 */

/** Safe identity returned to the authenticated client. Explicit allowlist. */
export interface SafeAuthUser {
  id: string;
  name: string;
  email: string;
  image: string | null;
  emailVerified: boolean;
}

export interface MeResponse {
  user: SafeAuthUser;
}

declare global {
  // Populated by `requireClerkAuth` for downstream handlers.
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      authUser?: SafeAuthUser;
    }
  }
}

interface SessionUserInput {
  id: string;
  name: string;
  email: string;
  image?: string | null;
  emailVerified: boolean;
}

/**
 * Project the verified user onto the explicit safe shape.
 * Anything not listed here (credentials, tokens, internals) is dropped.
 */
export function toSafeUser(user: SessionUserInput): SafeAuthUser {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    image: user.image ?? null,
    emailVerified: user.emailVerified,
  };
}
