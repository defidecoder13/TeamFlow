/**
 * Channel HTTP boundary (Phase 3A).
 *
 * All routes sit behind `requireClerkAuth` — identity comes exclusively from the
 * session (`req.authUser`). Workspace membership gates every operation;
 * private channels additionally require channel membership (resolved in
 * `authorization.ts`). Missing/inaccessible resources share one 404 shape so
 * private channel existence never leaks.
 */

import { Router, type NextFunction, type Request, type Response } from 'express';
import { getPrisma } from '../auth/prisma';
import { requireClerkAuth, type ClerkRouteOptions } from '../auth/index';
import { getMembershipRole } from '../workspaces/authorization';
import { canUpdateChannel, getAccessibleChannel } from './authorization';
import {
  ChannelMembershipConflictError,
  ChannelMembershipNotFoundError,
  ChannelNotFoundError,
  ChannelSlugConflictError,
  addChannelMember,
  createChannel,
  deleteChannel,
  leaveChannel,
  listAccessibleChannels,
  listChannelMembers,
  removeChannelMember,
  updateChannel,
} from './service';
import {
  emitChannelMembershipRemoved,
  notifyChannelCreated,
  notifyChannelDeleted,
  notifyChannelUpdated,
  removeUserFromChannelRoom,
  resolveChannelBroadcastRecipients,
} from '../realtime/index';
import {
  addChannelMemberSchema,
  createChannelSchema,
  firstValidationMessage,
  markChannelReadSchema,
  updateChannelSchema,
  updateChannelUserStateSchema,
} from './validation';
import {
  markChannelRead,
  updateChannelUserState,
} from './service';

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

export function createChannelsRouter(options: ClerkRouteOptions = {}): Router {
  // mergeParams: mounted at `/api/workspaces/:workspaceId/channels` and must
  // see the parent mount's `workspaceId` (Express 4 drops it otherwise).
  const router = Router({ mergeParams: true });
  router.use(requireClerkAuth(options));

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
          topic: parsed.data.topic,
          type: parsed.data.type,
        });
        // Post-commit fan-out to authorized rooms only (public: workspace
        // members; private: channel members). Awaited so delivery precedes
        // the response; never throws.
        await notifyChannelCreated({ workspaceId: req.params.workspaceId, channel });
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
      // createdById is exposed on the authenticated detail response ONLY, so
      // the channel page can implement the backend's existing creator branch
      // of canUpdateChannel. List/create/update payloads intentionally omit
      // it (see the safe-fields security test).
      const {
        id,
        name,
        slug,
        description,
        topic,
        type,
        createdById,
        createdAt,
        updatedAt,
      } = accessible.channel;
      res.status(200).json({
        channel: {
          id,
          name,
          slug,
          description,
          topic,
          type,
          createdById,
          createdAt,
          updatedAt,
        },
      });
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
          topic: parsed.data.topic,
        });
        // Post-commit fan-out to authorized rooms only. Awaited so delivery
        // precedes the response; never throws.
        await notifyChannelUpdated({ workspaceId: req.params.workspaceId, channel });
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

  router.patch(
    '/:channelSlug/user-state',
    asyncRoute(async (req, res) => {
      const parsed = updateChannelUserStateSchema.safeParse(req.body);
      if (!parsed.success) {
        validationError(res, firstValidationMessage(parsed.error));
        return;
      }
      const authUser = requireSessionUser(req, res);
      if (!authUser) return;
      const accessible = await getAccessibleChannel(getPrisma(), {
        workspaceId: req.params.workspaceId,
        channelSlug: req.params.channelSlug,
        userId: authUser.id,
      });
      if (!accessible) {
        notFound(res);
        return;
      }
      const userState = await updateChannelUserState(getPrisma(), {
        channelId: accessible.channel.id,
        userId: authUser.id,
        isStarred: parsed.data.isStarred,
        isMuted: parsed.data.isMuted,
      });
      res.status(200).json({ userState });
    }),
  );

  router.post(
    '/:channelSlug/read',
    asyncRoute(async (req, res) => {
      const parsed = markChannelReadSchema.safeParse(req.body ?? {});
      if (!parsed.success) {
        validationError(res, firstValidationMessage(parsed.error));
        return;
      }
      const authUser = requireSessionUser(req, res);
      if (!authUser) return;
      const accessible = await getAccessibleChannel(getPrisma(), {
        workspaceId: req.params.workspaceId,
        channelSlug: req.params.channelSlug,
        userId: authUser.id,
      });
      if (!accessible) {
        notFound(res);
        return;
      }
      try {
        const userState = await markChannelRead(getPrisma(), {
          channelId: accessible.channel.id,
          userId: authUser.id,
          lastReadMessageId: parsed.data.lastReadMessageId,
        });
        res.status(200).json({ userState });
      } catch (error) {
        if (error instanceof ChannelNotFoundError) {
          notFound(res);
          return;
        }
        throw error;
      }
    }),
  );

  router.delete(
    '/:channelSlug/members/me',
    asyncRoute(async (req, res) => {
      const authUser = requireSessionUser(req, res);
      if (!authUser) return;
      const accessible = await getAccessibleChannel(getPrisma(), {
        workspaceId: req.params.workspaceId,
        channelSlug: req.params.channelSlug,
        userId: authUser.id,
      });
      if (!accessible) {
        notFound(res);
        return;
      }
      try {
        await leaveChannel(getPrisma(), {
          channelId: accessible.channel.id,
          userId: authUser.id,
        });
        removeUserFromChannelRoom(accessible.channel.id, authUser.id);
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
        emitChannelMembershipRemoved(
          req.params.workspaceId,
          accessible.channel.id,
          req.params.userId,
        );
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

  router.delete(
    '/:channelSlug',
    asyncRoute(async (req, res) => {
      const authUser = requireSessionUser(req, res);
      if (!authUser) return;
      const accessible = await getAccessibleChannel(getPrisma(), {
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
        // Capture recipients pre-delete (cascades remove membership rows):
        // only these users may learn the channel id, and only post-commit.
        const memberUserIds = await resolveChannelBroadcastRecipients({
          workspaceId: req.params.workspaceId,
          channelId: accessible.channel.id,
          channelType: accessible.channel.type,
        });
        await deleteChannel(getPrisma(), { channelId: accessible.channel.id });
        await notifyChannelDeleted({
          workspaceId: req.params.workspaceId,
          channelId: accessible.channel.id,
          memberUserIds,
        });
        res.status(204).send();
      } catch (error) {
        if (error instanceof ChannelNotFoundError) {
          notFound(res);
          return;
        }
        throw error;
      }
    }),
  );

  return router;
}
