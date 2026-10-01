/**
 * Workspace threads HTTP boundary (Audit 11).
 *
 * GET `/api/workspaces/:workspaceId/threads` — list roots the caller
 * participates in, newest activity first. Behind `requireClerkAuth`; membership
 * resolves inside the service (shared 404 for missing/inaccessible).
 */

import { Router, type NextFunction, type Request, type Response } from 'express';
import { getPrisma } from '../auth/prisma';
import { requireClerkAuth, type ClerkRouteOptions } from '../auth/index';
import {
  listWorkspaceThreads,
  ThreadNotFoundError,
  ThreadValidationError,
} from './service';
import { firstValidationMessage, threadListQuerySchema } from './schemas';

function validationError(res: Response, message: string): void {
  res.status(400).json({ error: { code: 'VALIDATION_ERROR', message } });
}

function notFound(res: Response, message = 'Workspace not found.'): void {
  res.status(404).json({ error: { code: 'NOT_FOUND', message } });
}

function mapThreadError(res: Response, error: unknown): void {
  if (error instanceof ThreadValidationError) {
    validationError(res, error.message);
    return;
  }
  if (error instanceof ThreadNotFoundError) {
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

export function createWorkspaceThreadsRouter(options: ClerkRouteOptions = {}): Router {
  // mergeParams: mounted at `/api/workspaces/:workspaceId/threads` and must
  // see the parent mount's `workspaceId`.
  const router = Router({ mergeParams: true });
  router.use(requireClerkAuth(options));

  router.get(
    '/',
    asyncRoute(async (req, res) => {
      const parsed = threadListQuerySchema.safeParse(req.query);
      if (!parsed.success) {
        validationError(res, firstValidationMessage(parsed.error));
        return;
      }
      const workspaceId = req.params.workspaceId;
      if (!workspaceId) {
        notFound(res);
        return;
      }
      try {
        const page = await listWorkspaceThreads(getPrisma(), {
          workspaceId,
          userId: req.authUser!.id,
          limit: parsed.data.limit,
          cursor: parsed.data.cursor,
        });
        res.status(200).json({ threads: page.threads, pageInfo: page.pageInfo });
      } catch (error) {
        mapThreadError(res, error);
      }
    }),
  );

  return router;
}
