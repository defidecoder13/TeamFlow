/**
 * Message HTTP boundary (Phase 4A, backend only).
 *
 * - `createChannelMessagesRouter`: POST + GET under
 *   `/api/channels/:channelId/messages` (mergeParams for the parent id).
 * - `createMessagesRouter`: PATCH + DELETE under `/api/messages/:messageId`.
 *
 * Identity comes exclusively from the session. Every operation re-verifies
 * channel access server-side; message IDs alone authorize nothing.
 */

import { Router, type NextFunction, type Request, type Response } from 'express';
import type { AuthContext } from '../auth/index';
import { getPrisma } from '../auth/prisma';
import { requireAuth } from '../auth/session';
import { authorizeChannelAccess } from './authorization';
import {
  emitDirectMessageCreated,
  emitDirectMessageDeleted,
  emitDirectMessageUpdated,
  emitDirectReactionAdded,
  emitDirectReactionRemoved,
  emitMessageCreated,
  emitMessageDeleted,
  emitMessageUpdated,
  emitReactionAdded,
  emitReactionRemoved,
} from '../realtime/index';
import {
  addMessageReaction,
  createMessage,
  createThreadReply,
  deleteMessage,
  getMessageReactions,
  listMessages,
  listThreadReplies,
  MessageConflictError,
  MessageForbiddenError,
  MessageNotFoundError,
  removeMessageReaction,
  updateMessage,
} from './service';
import {
  addReactionSchema,
  createMessageSchema,
  emojiSchema,
  firstValidationMessage,
  messageListQuerySchema,
  updateMessageSchema,
} from './validation';

function validationError(res: Response, message: string): void {
  res.status(400).json({ error: { code: 'VALIDATION_ERROR', message } });
}

function notFound(res: Response, message = 'Message not found.'): void {
  res.status(404).json({ error: { code: 'NOT_FOUND', message } });
}

function forbidden(res: Response): void {
  res.status(403).json({ error: { code: 'FORBIDDEN', message: 'You do not have permission.' } });
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

function asyncRoute(handler: (req: Request, res: Response) => Promise<void>) {
  return (req: Request, res: Response, next: NextFunction) => {
    void handler(req, res).catch(next);
  };
}

function mapMessageError(res: Response, error: unknown): void {
  if (error instanceof MessageNotFoundError) {
    notFound(res, error.message);
    return;
  }
  if (error instanceof MessageForbiddenError) {
    forbidden(res);
    return;
  }
  if (error instanceof MessageConflictError) {
    res.status(409).json({ error: { code: 'CONFLICT', message: error.message } });
    return;
  }
  throw error;
}

export function createChannelMessagesRouter(resolveAuth: () => AuthContext): Router {
  // mergeParams: mounted at `/api/channels/:channelId/messages`.
  const router = Router({ mergeParams: true });
  router.use(requireAuth(resolveAuth));

  router.post(
    '/',
    asyncRoute(async (req, res) => {
      const parsed = createMessageSchema.safeParse(req.body);
      if (!parsed.success) {
        validationError(res, firstValidationMessage(parsed.error));
        return;
      }
      const authUser = requireSessionUser(req, res);
      if (!authUser) {
        return;
      }
      const prisma = getPrisma();
      const channel = await authorizeChannelAccess(prisma, {
        channelId: req.params.channelId,
        userId: authUser.id,
      });
      if (!channel) {
        notFound(res, 'Channel not found.');
        return;
      }
      const message = await createMessage(prisma, {
        channelId: channel.id,
        authorId: authUser.id,
        body: parsed.data.body,
      });
      emitMessageCreated(channel.id, message);
      res.status(201).json({ message });
    }),
  );

  router.get(
    '/',
    asyncRoute(async (req, res) => {
      const parsed = messageListQuerySchema.safeParse(req.query);
      if (!parsed.success) {
        validationError(res, firstValidationMessage(parsed.error));
        return;
      }
      const authUser = requireSessionUser(req, res);
      if (!authUser) {
        return;
      }
      const prisma = getPrisma();
      const channel = await authorizeChannelAccess(prisma, {
        channelId: req.params.channelId,
        userId: authUser.id,
      });
      if (!channel) {
        notFound(res, 'Channel not found.');
        return;
      }
      try {
        const page = await listMessages(prisma, {
          channelId: channel.id,
          limit: parsed.data.limit,
          cursor: parsed.data.cursor,
        });
        res.status(200).json(page);
      } catch (error) {
        mapMessageError(res, error);
      }
    }),
  );

  return router;
}

export function createMessagesRouter(resolveAuth: () => AuthContext): Router {
  const router = Router();
  router.use(requireAuth(resolveAuth));

  router.get(
    '/:messageId/replies',
    asyncRoute(async (req, res) => {
      const parsed = messageListQuerySchema.safeParse(req.query);
      if (!parsed.success) {
        validationError(res, firstValidationMessage(parsed.error));
        return;
      }
      const authUser = requireSessionUser(req, res);
      if (!authUser) {
        return;
      }
      try {
        const page = await listThreadReplies(getPrisma(), {
          messageId: req.params.messageId,
          userId: authUser.id,
          limit: parsed.data.limit,
          cursor: parsed.data.cursor,
        });
        res.status(200).json(page);
      } catch (error) {
        mapMessageError(res, error);
      }
    }),
  );

  router.post(
    '/:messageId/replies',
    asyncRoute(async (req, res) => {
      const parsed = createMessageSchema.safeParse(req.body);
      if (!parsed.success) {
        validationError(res, firstValidationMessage(parsed.error));
        return;
      }
      const authUser = requireSessionUser(req, res);
      if (!authUser) {
        return;
      }
      try {
        const { reply, parent } = await createThreadReply(getPrisma(), {
          messageId: req.params.messageId,
          authorId: authUser.id,
          body: parsed.data.body,
        });
        if (reply.channelId) {
          emitMessageCreated(reply.channelId, reply);
        } else if (reply.directMessageConversationId) {
          emitDirectMessageCreated(reply.directMessageConversationId, reply);
        }
        if (parent.channelId) {
          emitMessageUpdated(parent.channelId, parent);
        } else if (parent.directMessageConversationId) {
          emitDirectMessageUpdated(parent.directMessageConversationId, parent);
        }
        res.status(201).json({ message: reply });
      } catch (error) {
        mapMessageError(res, error);
      }
    }),
  );

  router.patch(
    '/:messageId',
    asyncRoute(async (req, res) => {
      const parsed = updateMessageSchema.safeParse(req.body);
      if (!parsed.success) {
        validationError(res, firstValidationMessage(parsed.error));
        return;
      }
      const authUser = requireSessionUser(req, res);
      if (!authUser) {
        return;
      }
      try {
        const message = await updateMessage(getPrisma(), {
          messageId: req.params.messageId,
          userId: authUser.id,
          body: parsed.data.body,
        });
        if (message.channelId) {
          emitMessageUpdated(message.channelId, message);
        } else if (message.directMessageConversationId) {
          emitDirectMessageUpdated(message.directMessageConversationId, message);
        }
        res.status(200).json({ message });
      } catch (error) {
        mapMessageError(res, error);
      }
    }),
  );

  router.delete(
    '/:messageId',
    asyncRoute(async (req, res) => {
      const authUser = requireSessionUser(req, res);
      if (!authUser) {
        return;
      }
      try {
        const message = await deleteMessage(getPrisma(), {
          messageId: req.params.messageId,
          userId: authUser.id,
        });
        if (message.channelId) {
          emitMessageDeleted(message.channelId, message.id, message.deletedAt ?? new Date());
        } else if (message.directMessageConversationId) {
          emitDirectMessageDeleted(
            message.directMessageConversationId,
            message.id,
            message.deletedAt ?? new Date(),
          );
        }
        res.status(200).json({ message });
      } catch (error) {
        mapMessageError(res, error);
      }
    }),
  );

  router.post(
    '/:messageId/reactions',
    asyncRoute(async (req, res) => {
      const parsed = addReactionSchema.safeParse(req.body);
      if (!parsed.success) {
        validationError(res, firstValidationMessage(parsed.error));
        return;
      }
      const authUser = requireSessionUser(req, res);
      if (!authUser) {
        return;
      }
      try {
        const reaction = await addMessageReaction(getPrisma(), {
          messageId: req.params.messageId,
          userId: authUser.id,
          emoji: parsed.data.emoji,
        });
        if (reaction.channelId) {
          emitReactionAdded(
            reaction.channelId,
            reaction.messageId,
            reaction.emoji,
            reaction.userId,
          );
        } else if (reaction.directMessageConversationId) {
          emitDirectReactionAdded(
            reaction.directMessageConversationId,
            reaction.messageId,
            reaction.emoji,
            reaction.userId,
          );
        }
        res.status(201).json({ reaction });
      } catch (error) {
        mapMessageError(res, error);
      }
    }),
  );

  router.delete(
    '/:messageId/reactions/:emoji',
    asyncRoute(async (req, res) => {
      const rawEmoji = decodeURIComponent(req.params.emoji);
      const parsed = emojiSchema.safeParse(rawEmoji);
      if (!parsed.success) {
        validationError(res, firstValidationMessage(parsed.error));
        return;
      }
      const authUser = requireSessionUser(req, res);
      if (!authUser) {
        return;
      }
      try {
        const { channelId, directMessageConversationId } = await removeMessageReaction(
          getPrisma(),
          {
            messageId: req.params.messageId,
            userId: authUser.id,
            emoji: parsed.data,
          },
        );
        if (channelId) {
          emitReactionRemoved(channelId, req.params.messageId, parsed.data, authUser.id);
        } else if (directMessageConversationId) {
          emitDirectReactionRemoved(
            directMessageConversationId,
            req.params.messageId,
            parsed.data,
            authUser.id,
          );
        }
        res.status(200).json({ success: true, message: 'Reaction removed.' });
      } catch (error) {
        mapMessageError(res, error);
      }
    }),
  );

  router.get(
    '/:messageId/reactions',
    asyncRoute(async (req, res) => {
      const authUser = requireSessionUser(req, res);
      if (!authUser) {
        return;
      }
      try {
        const reactions = await getMessageReactions(getPrisma(), {
          messageId: req.params.messageId,
          userId: authUser.id,
        });
        res.status(200).json(reactions);
      } catch (error) {
        mapMessageError(res, error);
      }
    }),
  );

  return router;
}
