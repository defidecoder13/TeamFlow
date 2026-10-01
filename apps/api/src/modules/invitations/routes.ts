/**
 * Invitation HTTP boundary (Phase 2F-A, backend only).
 *
 * - `createWorkspaceInvitationsRouter`: POST + GET under
 *   `/api/workspaces/:workspaceId/invitations` plus DELETE
 *   `/:invitationId` (revoke), all OWNER/ADMIN only.
 * - `createInvitationAcceptRouter`: POST `/api/invitations/accept` by token.
 *
 * Identity always comes from the session. No email delivery exists yet, so
 * creation returns the raw token once for the future email/UI layer — it is
 * never stored, logged, or re-exposed (listing omits all token material).
 */

import { Router, type NextFunction, type Request, type Response } from 'express';
import type { AuthContext } from '../auth/index';
import { getPrisma } from '../auth/prisma';
import { requireAuth } from '../auth/session';
import { getMembershipRole } from '../workspaces/authorization';
import { canManageInvitations } from './authorization';
import {
  acceptInvitation,
  createInvitation,
  InvitationConflictError,
  InvitationForbiddenError,
  InvitationInvalidError,
  listPendingInvitations,
  revokeInvitation,
} from './service';
import {
  acceptInvitationSchema,
  createInvitationSchema,
  firstValidationMessage,
} from './validation';

function validationError(res: Response, message: string): void {
  res.status(400).json({ error: { code: 'VALIDATION_ERROR', message } });
}

function notFound(res: Response, message = 'Workspace not found.'): void {
  res.status(404).json({ error: { code: 'NOT_FOUND', message } });
}

function forbidden(res: Response, message = 'You do not have permission.'): void {
  res.status(403).json({ error: { code: 'FORBIDDEN', message } });
}

function requireSessionUser(req: Request, res: Response): { id: string; email: string } | null {
  const authUser = req.authUser;
  if (!authUser) {
    res
      .status(401)
      .json({ error: { code: 'UNAUTHENTICATED', message: 'Authentication required.' } });
    return null;
  }
  return authUser;
}

function asyncRoute(handler: (req: Request, res: Response) => Promise<void>) {
  return (req: Request, res: Response, next: NextFunction) => {
    void handler(req, res).catch(next);
  };
}

export function createWorkspaceInvitationsRouter(resolveAuth: () => AuthContext): Router {
  // mergeParams: the router is mounted at `/api/workspaces/:workspaceId/...`
  // and must see the parent mount's `workspaceId` param (Express 4 drops
  // parent params from `req.params` without this option).
  const router = Router({ mergeParams: true });
  router.use(requireAuth(resolveAuth));

  router.post(
    '/',
    asyncRoute(async (req, res) => {
      const parsed = createInvitationSchema.safeParse(req.body);
      if (!parsed.success) {
        validationError(res, firstValidationMessage(parsed.error));
        return;
      }
      const authUser = requireSessionUser(req, res);
      if (!authUser) {
        return;
      }
      const prisma = getPrisma();
      const role = await getMembershipRole(prisma, req.params.workspaceId, authUser.id);
      if (!role) {
        notFound(res);
        return;
      }
      if (!canManageInvitations(role)) {
        forbidden(res);
        return;
      }
      try {
        const invitation = await createInvitation(prisma, {
          workspaceId: req.params.workspaceId,
          inviterUserId: authUser.id,
          email: parsed.data.email,
          role: parsed.data.role,
        });
        res.status(201).json({ invitation });
      } catch (error) {
        if (error instanceof InvitationConflictError) {
          res.status(409).json({ error: { code: 'CONFLICT', message: error.message } });
          return;
        }
        throw error;
      }
    }),
  );

  router.get(
    '/',
    asyncRoute(async (req, res) => {
      const authUser = requireSessionUser(req, res);
      if (!authUser) {
        return;
      }
      const prisma = getPrisma();
      const role = await getMembershipRole(prisma, req.params.workspaceId, authUser.id);
      if (!role) {
        notFound(res);
        return;
      }
      if (!canManageInvitations(role)) {
        forbidden(res);
        return;
      }
      const invitations = await listPendingInvitations(prisma, {
        workspaceId: req.params.workspaceId,
      });
      res.status(200).json({ invitations });
    }),
  );

  router.delete(
    '/:invitationId',
    asyncRoute(async (req, res) => {
      const authUser = requireSessionUser(req, res);
      if (!authUser) {
        return;
      }
      const prisma = getPrisma();
      const role = await getMembershipRole(prisma, req.params.workspaceId, authUser.id);
      if (!role) {
        notFound(res);
        return;
      }
      if (!canManageInvitations(role)) {
        forbidden(res);
        return;
      }
      try {
        const result = await revokeInvitation(prisma, {
          workspaceId: req.params.workspaceId,
          invitationId: req.params.invitationId,
        });
        res.status(200).json({ invitation: result });
      } catch (error) {
        if (error instanceof InvitationInvalidError) {
          notFound(res, error.message);
          return;
        }
        throw error;
      }
    }),
  );

  return router;
}

export function createInvitationAcceptRouter(resolveAuth: () => AuthContext): Router {
  const router = Router();
  router.use(requireAuth(resolveAuth));

  router.post(
    '/accept',
    asyncRoute(async (req, res) => {
      const parsed = acceptInvitationSchema.safeParse(req.body);
      if (!parsed.success) {
        validationError(res, firstValidationMessage(parsed.error));
        return;
      }
      const authUser = requireSessionUser(req, res);
      if (!authUser) {
        return;
      }
      try {
        const result = await acceptInvitation(getPrisma(), {
          token: parsed.data.token,
          userId: authUser.id,
          userEmail: authUser.email,
        });
        res.status(200).json(result);
      } catch (error) {
        if (error instanceof InvitationInvalidError) {
          notFound(res, error.message);
          return;
        }
        if (error instanceof InvitationForbiddenError) {
          forbidden(res, error.message);
          return;
        }
        if (error instanceof InvitationConflictError) {
          res.status(409).json({ error: { code: 'CONFLICT', message: error.message } });
          return;
        }
        throw error;
      }
    }),
  );

  return router;
}
