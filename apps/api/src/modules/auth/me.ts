/**
 * Application identity route (Phase 1B).
 *
 * GET /api/me returns the session-derived identity of the caller.
 * Authentication operations (sign-up/in/out) stay with Better Auth under
 * `/api/auth/*`; no custom login/logout endpoints are created here.
 */

import { Router, type Request, type Response } from 'express';
import type { AuthContext } from './auth';
import { requireAuth } from './session';

export function createMeRouter(resolveAuth: () => AuthContext): Router {
  const router = Router();

  router.get('/me', requireAuth(resolveAuth), (req: Request, res: Response) => {
    const user = req.authUser;
    if (!user) {
      // Unreachable when requireAuth is wired correctly; kept as a
      // defense-in-depth guard so identity can never be undefined.
      res
        .status(401)
        .json({ error: { code: 'UNAUTHENTICATED', message: 'Authentication required.' } });
      return;
    }
    res.status(200).json({ user });
  });

  return router;
}
