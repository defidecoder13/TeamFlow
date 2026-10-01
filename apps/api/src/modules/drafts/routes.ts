/**
 * Workspace drafts HTTP boundary (Audit 13).
 *
 * GET/PUT `/api/workspaces/:workspaceId/drafts` and
 * DELETE `/api/workspaces/:workspaceId/drafts/:draftId`.
 * Behind `requireAuth`; membership resolves inside the service.
 */

import { Router, type NextFunction, type Request, type Response } from 'express';
import type { AuthContext } from '../auth/index';
import { getPrisma } from '../auth/prisma';
import { requireAuth } from '../auth/session';
import {
  deleteWorkspaceDraft,
  DraftForbiddenError,
  DraftNotFoundError,
  DraftValidationError,
  listWorkspaceDrafts,
  upsertWorkspaceDraft,
} from './service';
import { firstValidationMessage, upsertDraftSchema } from './schemas';

function validationError(res: Response, message: string): void {
  res.status(400).json({ error: { code: 'VALIDATION_ERROR', message } });
}

function notFound(res: Response, message = 'Workspace not found.'): void {
  res.status(404).json({ error: { code: 'NOT_FOUND', message } });
}

function forbidden(res: Response, message: string): void {
  res.status(403).json({ error: { code: 'FORBIDDEN', message } });
}

function mapDraftError(res: Response, error: unknown): void {
  if (error instanceof DraftValidationError) {
    validationError(res, error.message);
    return;
  }
  if (error instanceof DraftForbiddenError) {
    forbidden(res, error.message);
    return;
  }
  if (error instanceof DraftNotFoundError) {
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

export function createWorkspaceDraftsRouter(resolveAuth: () => AuthContext): Router {
  const router = Router({ mergeParams: true });
  router.use(requireAuth(resolveAuth));

  router.get(
    '/',
    asyncRoute(async (req, res) => {
      const workspaceId = req.params.workspaceId;
      if (!workspaceId) {
        notFound(res);
        return;
      }
      try {
        const drafts = await listWorkspaceDrafts(getPrisma(), {
          workspaceId,
          userId: req.authUser!.id,
        });
        res.status(200).json({ drafts });
      } catch (error) {
        mapDraftError(res, error);
      }
    }),
  );

  router.put(
    '/',
    asyncRoute(async (req, res) => {
      const parsed = upsertDraftSchema.safeParse(req.body);
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
        const draft = await upsertWorkspaceDraft(getPrisma(), {
          workspaceId,
          userId: req.authUser!.id,
          targetKind: parsed.data.targetKind,
          targetId: parsed.data.targetId,
          body: parsed.data.body,
        });
        res.status(200).json({ draft });
      } catch (error) {
        mapDraftError(res, error);
      }
    }),
  );

  router.delete(
    '/:draftId',
    asyncRoute(async (req, res) => {
      const workspaceId = req.params.workspaceId;
      const draftId = req.params.draftId;
      if (!workspaceId || !draftId) {
        notFound(res, 'Draft not found.');
        return;
      }
      try {
        await deleteWorkspaceDraft(getPrisma(), {
          workspaceId,
          userId: req.authUser!.id,
          draftId,
        });
        res.status(204).end();
      } catch (error) {
        mapDraftError(res, error);
      }
    }),
  );

  return router;
}
