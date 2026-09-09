/**
 * Search HTTP boundary (Phase 4G.3, backend only).
 *
 * GET /api/workspaces/:workspaceId/search behind `requireAuth` — identity
 * comes exclusively from the session. Workspace membership gates everything;
 * container authorization resolves inside the service and its SQL predicates.
 * Missing/inaccessible workspaces and `in:` targets share 404 shapes so
 * private existence never leaks.
 */

import { Router, type NextFunction, type Request, type Response } from 'express';
import type { AuthContext } from '../auth/index';
import { getPrisma } from '../auth/prisma';
import { requireAuth } from '../auth/session';
import { decodeSearchCursor, type SearchCursor } from './cursor';
import {
  SearchNotFoundError,
  SearchValidationError,
  searchChannels,
  searchMessages,
  searchUsers,
} from './service';
import { firstValidationMessage, searchQuerySchema } from './validation';

function validationError(res: Response, message: string): void {
  res.status(400).json({ error: { code: 'VALIDATION_ERROR', message } });
}

function notFound(res: Response, message: string): void {
  res.status(404).json({ error: { code: 'NOT_FOUND', message } });
}

function asyncRoute(handler: (req: Request, res: Response) => Promise<void>) {
  return (req: Request, res: Response, next: NextFunction) => {
    void handler(req, res).catch(next);
  };
}

function requireSessionUser(req: Request, res: Response): { id: string } | null {
  const authUser = req.authUser;
  if (!authUser) {
    res
      .status(401)
      .json({ error: { code: 'UNAUTHENTICATED', message: 'Authentication required.' } });
    return null;
  }
  return authUser;
}

export function createSearchRouter(resolveAuth: () => AuthContext): Router {
  // mergeParams: mounted at `/api/workspaces/:workspaceId/search` and must
  // see the parent mount's `workspaceId` (Express 4 drops it otherwise).
  const router = Router({ mergeParams: true });
  router.use(requireAuth(resolveAuth));

  router.get(
    '/',
    asyncRoute(async (req, res) => {
      const parsed = searchQuerySchema.safeParse(req.query);
      if (!parsed.success) {
        validationError(res, firstValidationMessage(parsed.error));
        return;
      }
      const authUser = requireSessionUser(req, res);
      if (!authUser) {
        return;
      }
      const prisma = getPrisma();
      const query = parsed.data;
      let cursor: SearchCursor | undefined;
      if (query.cursor) {
        const decoded = decodeSearchCursor(query.cursor);
        if (!decoded) {
          validationError(res, 'Invalid pagination cursor.');
          return;
        }
        cursor = decoded;
      }
      try {
        if (query.type === 'users') {
          const response = await searchUsers(prisma, {
            workspaceId: req.params.workspaceId,
            userId: authUser.id,
            q: query.q,
            limit: query.limit,
            cursor,
          });
          res.status(200).json(response);
          return;
        }
        if (query.type === 'channels') {
          const response = await searchChannels(prisma, {
            workspaceId: req.params.workspaceId,
            userId: authUser.id,
            q: query.q,
            limit: query.limit,
            cursor,
          });
          res.status(200).json(response);
          return;
        }
        const response = await searchMessages(prisma, {
          workspaceId: req.params.workspaceId,
          userId: authUser.id,
          q: query.q,
          inRaw: query.in,
          fromUserId: query.from,
          after: query.after,
          before: query.before,
          thread: query.thread,
          limit: query.limit,
          cursor,
        });
        res.status(200).json(response);
      } catch (error) {
        if (error instanceof SearchValidationError) {
          validationError(res, error.message);
          return;
        }
        if (error instanceof SearchNotFoundError) {
          notFound(res, error.message);
          return;
        }
        throw error;
      }
    }),
  );

  return router;
}
