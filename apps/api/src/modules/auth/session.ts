/**
 * Server-side session helpers (Phase 1B).
 *
 * Establishes the reusable pattern for protected routes:
 *
 *   request → Better Auth session → authenticated user → route handler
 *
 * Identity ALWAYS comes from the Better Auth session derived server-side via
 * `auth.api.getSession()`. Client-supplied values (query params, body fields,
 * custom headers) are never consulted for identity.
 */

import { fromNodeHeaders } from 'better-auth/node';
import type { NextFunction, Request, Response } from 'express';
import type { AuthContext } from './auth';

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
  // Populated by `requireAuth` for downstream handlers.
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
 * Project the Better Auth user onto the explicit safe shape.
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

/** Resolve the authenticated user from the request session, or null. */
export async function getSessionUser(
  auth: AuthContext,
  req: Request,
): Promise<SafeAuthUser | null> {
  const session = await auth.api.getSession({ headers: fromNodeHeaders(req.headers) });
  if (!session?.user) {
    return null;
  }
  return toSafeUser(session.user);
}

/**
 * Express middleware factory for protected routes. Attaches the
 * session-derived user to `req.authUser`; responds 401 when unauthenticated.
 * Takes a lazy auth resolver so app creation never requires secrets.
 */
export function requireAuth(resolveAuth: () => AuthContext) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    let user: SafeAuthUser | null;
    try {
      user = await getSessionUser(resolveAuth(), req);
    } catch (err) {
      next(err);
      return;
    }
    if (!user) {
      res
        .status(401)
        .json({ error: { code: 'UNAUTHENTICATED', message: 'Authentication required.' } });
      return;
    }
    req.authUser = user;
    next();
  };
}
