/**
 * Notification HTTP boundary (Phase 4H.5, read/update only).
 *
 * All routes sit behind `requireAuth` — identity comes exclusively from the
 * session (`req.authUser`). Workspace membership gates every operation and
 * recipients always resolve to the caller; missing/inaccessible resources
 * share one 404 shape so no other user's notifications ever leak.
 */

import { Router, type NextFunction, type Request, type Response } from 'express';
import type { AuthContext } from '../auth/index';
import { getPrisma } from '../auth/prisma';
import { requireAuth } from '../auth/session';
import { emitNotificationRead, emitNotificationReadAll } from '../realtime/index';
import {
  listNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  NotificationNotFoundError,
  NotificationValidationError,
} from './service';
import { firstValidationMessage, notificationListQuerySchema } from './schemas';

function validationError(res: Response, message: string): void {
  res.status(400).json({ error: { code: 'VALIDATION_ERROR', message } });
}

function notFound(res: Response, message = 'Notification not found.'): void {
  res.status(404).json({ error: { code: 'NOT_FOUND', message } });
}

function mapNotificationError(res: Response, error: unknown): void {
  if (error instanceof NotificationValidationError) {
    validationError(res, error.message);
    return;
  }
  if (error instanceof NotificationNotFoundError) {
    notFound(res, error.message);
    return;
  }
  throw error;
}

function asyncRoute(handler: (req: Request, res: Response) => Promise<void>) {
  return (req: Request, res: Response, next: NextFunction) => {
    void handler(req, res).catch(next);
  };
}

export function createNotificationsRouter(resolveAuth: () => AuthContext): Router {
  // mergeParams: mounted at `/api/workspaces/:workspaceId/notifications` and
  // must see the parent mount's `workspaceId` (Express 4 drops it otherwise).
  const router = Router({ mergeParams: true });
  router.use(requireAuth(resolveAuth));

  // GET /api/workspaces/:workspaceId/notifications - List own notifications
  router.get(
    '/',
    asyncRoute(async (req, res) => {
      const parsed = notificationListQuerySchema.safeParse(req.query);
      if (!parsed.success) {
        validationError(res, firstValidationMessage(parsed.error));
        return;
      }
      const workspaceId = req.params.workspaceId;
      if (!workspaceId) {
        notFound(res, 'Workspace not found.');
        return;
      }
      try {
        const page = await listNotifications(getPrisma(), {
          workspaceId,
          userId: req.authUser!.id,
          limit: parsed.data.limit,
          cursor: parsed.data.cursor,
          unreadOnly: parsed.data.unreadOnly,
          type: parsed.data.type,
        });
        res.status(200).json({ notifications: page.notifications, pageInfo: page.pageInfo });
      } catch (error) {
        mapNotificationError(res, error);
      }
    }),
  );

  // POST /api/workspaces/:workspaceId/notifications/read-all - Mark all read.
  // Registered before `/:notificationId/read` so `read-all` is never treated
  // as a notification id.
  router.post(
    '/read-all',
    asyncRoute(async (req, res) => {
      const workspaceId = req.params.workspaceId;
      if (!workspaceId) {
        notFound(res, 'Workspace not found.');
        return;
      }
      try {
        const result = await markAllNotificationsRead(getPrisma(), {
          workspaceId,
          userId: req.authUser!.id,
        });
        if (result.updatedCount > 0) {
          emitNotificationReadAll(req.authUser!.id, {
            workspaceId,
            readAt: new Date(),
            updatedCount: result.updatedCount,
          });
        }
        res.status(200).json({ updatedCount: result.updatedCount });
      } catch (error) {
        mapNotificationError(res, error);
      }
    }),
  );

  // POST /api/workspaces/:workspaceId/notifications/:notificationId/read
  router.post(
    '/:notificationId/read',
    asyncRoute(async (req, res) => {
      const workspaceId = req.params.workspaceId;
      if (!workspaceId) {
        notFound(res, 'Workspace not found.');
        return;
      }
      try {
        const result = await markNotificationRead(getPrisma(), {
          workspaceId,
          userId: req.authUser!.id,
          notificationId: req.params.notificationId,
        });
        // Emit only on an actual unread → read transition; the readAt in the
        // event is the authoritative persisted value.
        if (result.updated) {
          emitNotificationRead(req.authUser!.id, {
            id: result.notification.id,
            workspaceId,
            readAt: result.notification.readAt ?? new Date(),
          });
        }
        res.status(200).json({ notification: result.notification });
      } catch (error) {
        mapNotificationError(res, error);
      }
    }),
  );

  return router;
}
