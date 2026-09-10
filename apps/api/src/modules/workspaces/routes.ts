/**
 * Workspace HTTP boundary (Phase 2A).
 *
 * All routes sit behind `requireAuth` — identity comes exclusively from the
 * session (`req.authUser`). Membership/role checks use `authorization.ts`;
 * the unique-constraint-safe creation lives in `service.ts`.
 */

import { Router, type NextFunction, type Request, type Response } from 'express';
import type { AuthContext } from '../auth/index';
import { getPrisma } from '../auth/prisma';
import { requireAuth } from '../auth/session';
import { presenceRegistry } from '../realtime/presence';
import { canDeleteWorkspace, canEditMetadata, getMembershipRole } from './authorization';
import {
  createWorkspace,
  deleteWorkspace,
  getWorkspaceForMember,
  listWorkspaceMembers,
  listWorkspaces,
  removeWorkspaceMember,
  renameWorkspace,
  updateWorkspaceMemberRole,
  WorkspaceMemberConflictError,
  WorkspaceMemberNotFoundError,
  WorkspaceNotFoundError,
  WorkspaceSlugConflictError,
} from './service';
import {
  createWorkspaceSchema,
  firstValidationMessage,
  updateWorkspaceMemberSchema,
  updateWorkspaceSchema,
} from './validation';

function validationError(res: Response, message: string): void {
  res.status(400).json({ error: { code: 'VALIDATION_ERROR', message } });
}

function notFound(res: Response): void {
  res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Workspace not found.' } });
}

function forbidden(res: Response): void {
  res.status(403).json({ error: { code: 'FORBIDDEN', message: 'You do not have permission.' } });
}

function asyncRoute(handler: (req: Request, res: Response) => Promise<void>) {
  return (req: Request, res: Response, next: NextFunction) => {
    void handler(req, res).catch(next);
  };
}

export function createWorkspacesRouter(resolveAuth: () => AuthContext): Router {
  const router = Router();
  router.use(requireAuth(resolveAuth));

  router.post(
    '/',
    asyncRoute(async (req, res) => {
      const parsed = createWorkspaceSchema.safeParse(req.body);
      if (!parsed.success) {
        validationError(res, firstValidationMessage(parsed.error));
        return;
      }
      const authUser = req.authUser;
      if (!authUser) {
        res
          .status(401)
          .json({ error: { code: 'UNAUTHENTICATED', message: 'Authentication required.' } });
        return;
      }
      try {
        const workspace = await createWorkspace(getPrisma(), {
          userId: authUser.id,
          name: parsed.data.name,
        });
        res.status(201).json({ workspace });
      } catch (error) {
        if (error instanceof WorkspaceSlugConflictError) {
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
      const authUser = req.authUser;
      if (!authUser) {
        res
          .status(401)
          .json({ error: { code: 'UNAUTHENTICATED', message: 'Authentication required.' } });
        return;
      }
      const workspaces = await listWorkspaces(getPrisma(), { userId: authUser.id });
      res.status(200).json({ workspaces });
    }),
  );

  router.get(
    '/:workspaceId/members',
    asyncRoute(async (req, res) => {
      const authUser = req.authUser;
      if (!authUser) {
        res
          .status(401)
          .json({ error: { code: 'UNAUTHENTICATED', message: 'Authentication required.' } });
        return;
      }
      const prisma = getPrisma();
      const role = await getMembershipRole(prisma, req.params.workspaceId, authUser.id);
      if (!role) {
        notFound(res);
        return;
      }
      const members = await listWorkspaceMembers(prisma, {
        workspaceId: req.params.workspaceId,
      });
      res.status(200).json({ members });
    }),
  );

  router.patch(
    '/:workspaceId/members/:userId',
    asyncRoute(async (req, res) => {
      const parsed = updateWorkspaceMemberSchema.safeParse(req.body);
      if (!parsed.success) {
        validationError(res, firstValidationMessage(parsed.error));
        return;
      }
      const authUser = req.authUser;
      if (!authUser) {
        res
          .status(401)
          .json({ error: { code: 'UNAUTHENTICATED', message: 'Authentication required.' } });
        return;
      }
      const prisma = getPrisma();
      const requesterRole = await getMembershipRole(prisma, req.params.workspaceId, authUser.id);
      if (!requesterRole) {
        notFound(res);
        return;
      }
      if (requesterRole !== 'OWNER') {
        forbidden(res);
        return;
      }
      try {
        const member = await updateWorkspaceMemberRole(prisma, {
          workspaceId: req.params.workspaceId,
          targetUserId: req.params.userId,
          newRole: parsed.data.role,
        });
        res.status(200).json({ member });
      } catch (error) {
        if (error instanceof WorkspaceMemberNotFoundError) {
          notFound(res);
          return;
        }
        if (error instanceof WorkspaceMemberConflictError) {
          res.status(409).json({ error: { code: 'CONFLICT', message: error.message } });
          return;
        }
        if (error instanceof WorkspaceNotFoundError) {
          notFound(res);
          return;
        }
        throw error;
      }
    }),
  );

  router.delete(
    '/:workspaceId/members/:userId',
    asyncRoute(async (req, res) => {
      const authUser = req.authUser;
      if (!authUser) {
        res
          .status(401)
          .json({ error: { code: 'UNAUTHENTICATED', message: 'Authentication required.' } });
        return;
      }
      const prisma = getPrisma();
      const requesterRole = await getMembershipRole(prisma, req.params.workspaceId, authUser.id);
      if (!requesterRole) {
        notFound(res);
        return;
      }
      if (requesterRole !== 'OWNER') {
        forbidden(res);
        return;
      }
      try {
        // Check that target is in same workspace is handled inside service
        await removeWorkspaceMember(prisma, {
          workspaceId: req.params.workspaceId,
          targetUserId: req.params.userId,
        });
        // Best-effort: revoke realtime channel memberships for the removed user
        // We preserve ChannelMembership rows but kick sockets from channel rooms
        // in this workspace to prevent continued delivery.
        const channels = await prisma.channel.findMany({
          where: { workspaceId: req.params.workspaceId },
          select: { id: true },
        });
        const { removeUserFromChannelRoom } = await import('../realtime/index');
        for (const channel of channels) {
          removeUserFromChannelRoom(channel.id, req.params.userId);
        }
        // Also leave direct-message rooms in this workspace
        const dmConversations = await prisma.directMessageConversation.findMany({
          where: { workspaceId: req.params.workspaceId },
          select: { id: true },
        });
        const { removeUserFromDirectConversationRoom } = await import('../realtime/index');
        for (const conv of dmConversations) {
          removeUserFromDirectConversationRoom(conv.id, req.params.userId);
        }
        res.status(204).end();
      } catch (error) {
        if (error instanceof WorkspaceMemberNotFoundError) {
          notFound(res);
          return;
        }
        if (error instanceof WorkspaceMemberConflictError) {
          res.status(409).json({ error: { code: 'CONFLICT', message: error.message } });
          return;
        }
        if (error instanceof WorkspaceNotFoundError) {
          notFound(res);
          return;
        }
        throw error;
      }
    }),
  );

  router.get(
    '/:workspaceId/presence',
    asyncRoute(async (req, res) => {
      const authUser = req.authUser;
      if (!authUser) {
        res
          .status(401)
          .json({ error: { code: 'UNAUTHENTICATED', message: 'Authentication required.' } });
        return;
      }
      const prisma = getPrisma();
      const role = await getMembershipRole(prisma, req.params.workspaceId, authUser.id);
      if (!role) {
        notFound(res);
        return;
      }

      const members = await prisma.workspaceMembership.findMany({
        where: { workspaceId: req.params.workspaceId },
        select: { userId: true },
      });

      const userIds = members.map((m) => m.userId);
      const presences = presenceRegistry.getPresences(userIds);
      res.status(200).json({ presence: presences });
    }),
  );

  router.get(
    '/:workspaceId',
    asyncRoute(async (req, res) => {
      const authUser = req.authUser;
      if (!authUser) {
        res
          .status(401)
          .json({ error: { code: 'UNAUTHENTICATED', message: 'Authentication required.' } });
        return;
      }
      const workspace = await getWorkspaceForMember(getPrisma(), {
        userId: authUser.id,
        workspaceId: req.params.workspaceId,
      });
      if (!workspace) {
        notFound(res);
        return;
      }
      res.status(200).json({ workspace });
    }),
  );

  router.patch(
    '/:workspaceId',
    asyncRoute(async (req, res) => {
      const parsed = updateWorkspaceSchema.safeParse(req.body);
      if (!parsed.success) {
        validationError(res, firstValidationMessage(parsed.error));
        return;
      }
      const authUser = req.authUser;
      if (!authUser) {
        res
          .status(401)
          .json({ error: { code: 'UNAUTHENTICATED', message: 'Authentication required.' } });
        return;
      }
      const prisma = getPrisma();
      const role = await getMembershipRole(prisma, req.params.workspaceId, authUser.id);
      if (!role) {
        notFound(res);
        return;
      }
      if (!canEditMetadata(role)) {
        forbidden(res);
        return;
      }
      try {
        const updated = await renameWorkspace(prisma, {
          workspaceId: req.params.workspaceId,
          name: parsed.data.name,
        });
        res.status(200).json({
          workspace: {
            id: updated.id,
            name: updated.name,
            slug: updated.slug,
            role,
            createdAt: updated.createdAt,
            updatedAt: updated.updatedAt,
          },
        });
      } catch (error) {
        if (error instanceof WorkspaceNotFoundError) {
          notFound(res);
          return;
        }
        throw error;
      }
    }),
  );

  router.delete(
    '/:workspaceId',
    asyncRoute(async (req, res) => {
      const authUser = req.authUser;
      if (!authUser) {
        res
          .status(401)
          .json({ error: { code: 'UNAUTHENTICATED', message: 'Authentication required.' } });
        return;
      }
      const prisma = getPrisma();
      const role = await getMembershipRole(prisma, req.params.workspaceId, authUser.id);
      if (!role) {
        notFound(res);
        return;
      }
      if (!canDeleteWorkspace(role)) {
        forbidden(res);
        return;
      }
      try {
        await deleteWorkspace(prisma, { workspaceId: req.params.workspaceId });
        res.status(204).end();
      } catch (error) {
        if (error instanceof WorkspaceNotFoundError) {
          notFound(res);
          return;
        }
        throw error;
      }
    }),
  );

  return router;
}
