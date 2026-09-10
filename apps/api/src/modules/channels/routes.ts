/**
 * Channel HTTP boundary (Phase 3A).
 *
 * All routes sit behind `requireAuth` — identity comes exclusively from the
 * session (`req.authUser`). Workspace membership gates every operation;
 * private channels additionally require channel membership (resolved in
 * `authorization.ts`). Missing/inaccessible resources share one 404 shape so
 * private channel existence never leaks.
 */

import { Router, type NextFunction, type Request, type Response } from 'express';
import type { AuthContext } from '../auth/index';
import { getPrisma } from '../auth/prisma';
import { requireAuth } from '../auth/session';
import { getMembershipRole } from '../workspaces/authorization';
import { canUpdateChannel, getAccessibleChannel } from './authorization';
import {
  ChannelMembershipConflictError,
  ChannelMembershipNotFoundError,
  ChannelNotFoundError,
  ChannelSlugConflictError,
  addChannelMember,
  createChannel,
  listAccessibleChannels,
  listChannelMembers,
  removeChannelMember,
  updateChannel,
} from './service';
import { removeUserFromChannelRoom } from '../realtime/index';
import {
  addChannelMemberSchema,
  createChannelSchema,
  firstValidationMessage,
  updateChannelSchema,
} from './validation';

function validationError(res: Response, message: string): void {
  res.status(400).json({ error: { code: 'VALIDATION_ERROR', message } });
}

function notFound(res: Response): void {
  res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Channel not found.' } });
}

function forbidden(res: Response): void {
  res.status(403).json({ error: { code: 'FORBIDDEN', message: 'You do not have permission.' } });
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

export function createChannelsRouter(resolveAuth: () => AuthContext): Router {
  // mergeParams: mounted at `/api/workspaces/:workspaceId/channels` and must
  // see the parent mount's `workspaceId` (Express 4 drops it otherwise).
  const router = Router({ mergeParams: true });
  router.use(requireAuth(resolveAuth));

  router.post(
    '/',
    asyncRoute(async (req, res) => {
      const parsed = createChannelSchema.safeParse(req.body);
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
      try {
        const channel = await createChannel(prisma, {
          workspaceId: req.params.workspaceId,
          userId: authUser.id,
          name: parsed.data.name,
          description: parsed.data.description,
          type: parsed.data.type,
        });
        res.status(201).json({ channel });
      } catch (error) {
        if (error instanceof ChannelSlugConflictError) {
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
      const channels = await listAccessibleChannels(prisma, {
        workspaceId: req.params.workspaceId,
        userId: authUser.id,
      });
      res.status(200).json({ channels });
    }),
  );

  router.get(
    '/:channelSlug',
    asyncRoute(async (req, res) => {
      const authUser = requireSessionUser(req, res);
      if (!authUser) {
        return;
      }
      const accessible = await getAccessibleChannel(getPrisma(), {
        workspaceId: req.params.workspaceId,
        channelSlug: req.params.channelSlug,
        userId: authUser.id,
      });
      if (!accessible) {
        notFound(res);
        return;
      }
      const { id, name, slug, description, type, createdAt, updatedAt } = accessible.channel;
      res
        .status(200)
        .json({ channel: { id, name, slug, description, type, createdAt, updatedAt } });
    }),
  );

  router.patch(
    '/:channelSlug',
    asyncRoute(async (req, res) => {
      const parsed = updateChannelSchema.safeParse(req.body);
      if (!parsed.success) {
        validationError(res, firstValidationMessage(parsed.error));
        return;
      }
      const authUser = requireSessionUser(req, res);
      if (!authUser) {
        return;
      }
      const prisma = getPrisma();
      const accessible = await getAccessibleChannel(prisma, {
        workspaceId: req.params.workspaceId,
        channelSlug: req.params.channelSlug,
        userId: authUser.id,
      });
      if (!accessible) {
        notFound(res);
        return;
      }
      if (
        !canUpdateChannel({
          workspaceRole: accessible.workspaceRole,
          isCreator: accessible.channel.createdById === authUser.id,
        })
      ) {
        forbidden(res);
        return;
      }
      try {
        const channel = await updateChannel(prisma, {
          channelId: accessible.channel.id,
          name: parsed.data.name,
          description: parsed.data.description,
        });
        res.status(200).json({ channel });
      } catch (error) {
        if (error instanceof ChannelNotFoundError) {
          notFound(res);
          return;
        }
        if (error instanceof ChannelSlugConflictError) {
          res.status(409).json({ error: { code: 'CONFLICT', message: error.message } });
          return;
        }
        throw error;
      }
    }),
  );

  router.get(
    '/:channelSlug/members',
    asyncRoute(async (req, res) => {
      const authUser = requireSessionUser(req, res);
      if (!authUser) {
        return;
      }
      const accessible = await getAccessibleChannel(getPrisma(), {
        workspaceId: req.params.workspaceId,
        channelSlug: req.params.channelSlug,
        userId: authUser.id,
      });
      if (!accessible) {
        notFound(res);
        return;
      }
      if (accessible.channel.type !== 'PRIVATE') {
        notFound(res);
        return;
      }
      try {
        const members = await listChannelMembers(getPrisma(), {
          channelId: accessible.channel.id,
          workspaceId: req.params.workspaceId,
          userId: authUser.id,
        });
        res.status(200).json({ members });
      } catch (error) {
        if (error instanceof ChannelNotFoundError) {
          notFound(res);
          return;
        }
        throw error;
      }
    }),
  );

  router.post(
    '/:channelSlug/members',
    asyncRoute(async (req, res) => {
      const parsed = addChannelMemberSchema.safeParse(req.body);
      if (!parsed.success) {
        validationError(res, firstValidationMessage(parsed.error));
        return;
      }
      const authUser = requireSessionUser(req, res);
      if (!authUser) {
        return;
      }
      const accessible = await getAccessibleChannel(getPrisma(), {
        workspaceId: req.params.workspaceId,
        channelSlug: req.params.channelSlug,
        userId: authUser.id,
      });
      if (!accessible) {
        notFound(res);
        return;
      }
      if (accessible.channel.type !== 'PRIVATE') {
        notFound(res);
        return;
      }
      if (
        !canUpdateChannel({
          workspaceRole: accessible.workspaceRole,
          isCreator: accessible.channel.createdById === authUser.id,
        })
      ) {
        forbidden(res);
        return;
      }
      try {
        const member = await addChannelMember(getPrisma(), {
          channelId: accessible.channel.id,
          workspaceId: req.params.workspaceId,
          targetUserId: parsed.data.userId,
        });
        res.status(201).json({ member });
      } catch (error) {
        if (error instanceof ChannelNotFoundError) {
          notFound(res);
          return;
        }
        if (error instanceof ChannelMembershipConflictError) {
          res.status(409).json({ error: { code: 'CONFLICT', message: error.message } });
          return;
        }
        throw error;
      }
    }),
  );

  router.delete(
    '/:channelSlug/members/:userId',
    asyncRoute(async (req, res) => {
      const authUser = requireSessionUser(req, res);
      if (!authUser) {
        return;
      }
      const accessible = await getAccessibleChannel(getPrisma(), {
        workspaceId: req.params.workspaceId,
        channelSlug: req.params.channelSlug,
        userId: authUser.id,
      });
      if (!accessible) {
        notFound(res);
        return;
      }
      if (accessible.channel.type !== 'PRIVATE') {
        notFound(res);
        return;
      }
      if (
        !canUpdateChannel({
          workspaceRole: accessible.workspaceRole,
          isCreator: accessible.channel.createdById === authUser.id,
        })
      ) {
        forbidden(res);
        return;
      }
      try {
        await removeChannelMember(getPrisma(), {
          channelId: accessible.channel.id,
          workspaceId: req.params.workspaceId,
          userId: req.params.userId,
        });
        removeUserFromChannelRoom(accessible.channel.id, req.params.userId);
        res.status(204).send();
      } catch (error) {
        if (error instanceof ChannelNotFoundError) {
          notFound(res);
          return;
        }
        if (error instanceof ChannelMembershipNotFoundError) {
          notFound(res);
          return;
        }
        throw error;
      }
    }),
  );

  return router;
}
