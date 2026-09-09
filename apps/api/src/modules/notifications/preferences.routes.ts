/**
 * User notification preference HTTP boundary (Phase 4H.8).
 *
 * All routes sit behind `requireAuth` — identity comes exclusively from the
 * session (`req.authUser`). No workspace membership is required because
 * these are user-level account delivery preferences.
 *
 * GET   /api/users/me/notification-preferences
 * PATCH /api/users/me/notification-preferences
 */

import { Router, type NextFunction, type Request, type Response } from 'express';
import type { AuthContext } from '../auth/index';
import { getPrisma } from '../auth/prisma';
import { requireAuth } from '../auth/session';
import { firstValidationMessage } from './schemas';
import { updateNotificationPreferencesSchema } from './preferences.schemas';
import { getNotificationPreferences, updateNotificationPreferences } from './preferences.service';

function validationError(res: Response, message: string): void {
  res.status(400).json({ error: { code: 'VALIDATION_ERROR', message } });
}

function asyncRoute(handler: (req: Request, res: Response) => Promise<void>) {
  return (req: Request, res: Response, next: NextFunction) => {
    void handler(req, res).catch(next);
  };
}

export function createNotificationPreferencesRouter(resolveAuth: () => AuthContext): Router {
  const router = Router();
  router.use(requireAuth(resolveAuth));

  // GET / - Read current user's preferences
  router.get(
    '/',
    asyncRoute(async (req, res) => {
      const preferences = await getNotificationPreferences(getPrisma(), req.authUser!.id);
      res.status(200).json(preferences);
    }),
  );

  // PATCH / - Partially update current user's preferences
  router.patch(
    '/',
    asyncRoute(async (req, res) => {
      const parsed = updateNotificationPreferencesSchema.safeParse(req.body);
      if (!parsed.success) {
        validationError(res, firstValidationMessage(parsed.error));
        return;
      }

      const updated = await updateNotificationPreferences(
        getPrisma(),
        req.authUser!.id,
        parsed.data,
      );
      res.status(200).json(updated);
    }),
  );

  return router;
}
