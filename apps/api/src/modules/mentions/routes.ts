/**
 * Workspace mentions HTTP boundary (Audit 12).
 *
 * GET `/api/workspaces/:workspaceId/mentions` — list messages that mention
 * the caller, newest first. Behind `requireAuth`; membership resolves inside
 * the service (shared 404 for missing/inaccessible).
 */

import { Router, type NextFunction, type Request, type Response } from 'express';
import type { AuthContext } from '../auth/index';
import { getPrisma } from '../auth/prisma';
import { requireAuth } from '../auth/session';
import {
  listWorkspaceMentions,
  MentionListNotFoundError,
  MentionListValidationError,
} from './list.service';
import { firstValidationMessage, mentionListQuerySchema } from './schemas';

function validationError(res: Response, message: string): void {
  res.status(400).json({ error: { code: 'VALIDATION_ERROR', message } });
}

function notFound(res: Response, message = 'Workspace not found.'): void {
  res.status(404).json({ error: { code: 'NOT_FOUND', message } });
}

function mapMentionError(res: Response, error: unknown): void {
  if (error instanceof MentionListValidationError) {
    validationError(res, error.message);
    return;
  }
  if (error instanceof MentionListNotFoundError) {
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

export function createWorkspaceMentionsRouter(resolveAuth: () => AuthContext): Router {
  // mergeParams: mounted at `/api/workspaces/:workspaceId/mentions` and must
  // see the parent mount's `workspaceId`.
  const router = Router({ mergeParams: true });
  router.use(requireAuth(resolveAuth));

  router.get(
    '/',
    asyncRoute(async (req, res) => {
      const parsed = mentionListQuerySchema.safeParse(req.query);
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
        const page = await listWorkspaceMentions(getPrisma(), {
          workspaceId,
          userId: req.authUser!.id,
          limit: parsed.data.limit,
          cursor: parsed.data.cursor,
        });
        res.status(200).json({ mentions: page.mentions, pageInfo: page.pageInfo });
      } catch (error) {
        mapMentionError(res, error);
      }
    }),
  );

  return router;
}
