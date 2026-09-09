/**
 * Direct Message HTTP boundary (Phase 4F.1 & Phase 4F.2).
 *
 * Scopes endpoints by workspace and conversation. Identity is derived strictly
 * from the session.
 */

import { Router, type NextFunction, type Request, type Response } from 'express';
import type { AuthContext } from '../auth/index';
import { getPrisma } from '../auth/prisma';
import { requireAuth } from '../auth/session';
import {
  addConversationParticipant,
  createDirectMessage,
  createGroupConversation,
  DirectMessageConflictError,
  DirectMessageForbiddenError,
  DirectMessageNotFoundError,
  DirectMessageValidationError,
  getConversationParticipants,
  getDirectConversation,
  getOrCreateDirectConversation,
  getWorkspaceDirectConversationsUnread,
  leaveGroupConversation,
  listDirectMessages,
  listUserDirectConversations,
  markDirectConversationRead,
  removeConversationParticipant,
  renameGroupConversation,
} from './service';
import {
  addConversationParticipantSchema,
  createDirectConversationSchema,
  createDirectMessageSchema,
  createGroupConversationSchema,
  directConversationListQuerySchema,
  firstValidationMessage,
  markDirectConversationReadSchema,
  renameGroupConversationSchema,
} from './validation';
import { messageListQuerySchema } from '../messages/validation';
import { emitDirectConversationRead, emitDirectMessageCreated } from '../realtime/index';

function validationError(res: Response, message: string): void {
  res.status(400).json({ error: { code: 'VALIDATION_ERROR', message } });
}

function notFound(res: Response, message = 'Conversation not found.'): void {
  res.status(404).json({ error: { code: 'NOT_FOUND', message } });
}

function forbidden(res: Response): void {
  res.status(403).json({ error: { code: 'FORBIDDEN', message: 'You do not have permission.' } });
}

function mapDirectMessageError(res: Response, error: unknown): void {
  if (error instanceof DirectMessageValidationError) {
    validationError(res, error.message);
    return;
  }
  if (error instanceof DirectMessageNotFoundError) {
    notFound(res, error.message);
    return;
  }
  if (error instanceof DirectMessageForbiddenError) {
    forbidden(res);
    return;
  }
  if (error instanceof DirectMessageConflictError) {
    res.status(409).json({ error: { code: 'CONFLICT', message: error.message } });
    return;
  }
  throw error;
}

function asyncRoute(handler: (req: Request, res: Response) => Promise<void>) {
  return (req: Request, res: Response, next: NextFunction) => {
    void handler(req, res).catch(next);
  };
}

export function createWorkspaceDirectMessagesRouter(resolveAuth: () => AuthContext): Router {
  const router = Router({ mergeParams: true });
  router.use(requireAuth(resolveAuth));

  // POST /api/workspaces/:workspaceId/direct-messages - Create or get DM conversation
  router.post(
    '/',
    asyncRoute(async (req, res) => {
      const parsed = createDirectConversationSchema.safeParse(req.body);
      if (!parsed.success) {
        validationError(res, firstValidationMessage(parsed.error));
        return;
      }

      const workspaceId = req.params.workspaceId;
      if (!workspaceId) {
        notFound(res, 'Workspace not found.');
        return;
      }

      const prisma = getPrisma();
      try {
        const conversation = await getOrCreateDirectConversation(prisma, {
          workspaceId,
          userId: req.authUser!.id,
          recipientId: parsed.data.recipientId,
        });
        res.status(200).json({ conversation });
      } catch (error) {
        mapDirectMessageError(res, error);
      }
    }),
  );

  // POST /api/workspaces/:workspaceId/direct-messages/group - Create group conversation
  router.post(
    '/group',
    asyncRoute(async (req, res) => {
      const parsed = createGroupConversationSchema.safeParse(req.body);
      if (!parsed.success) {
        validationError(res, firstValidationMessage(parsed.error));
        return;
      }

      const workspaceId = req.params.workspaceId;
      if (!workspaceId) {
        notFound(res, 'Workspace not found.');
        return;
      }

      const prisma = getPrisma();
      try {
        const conversation = await createGroupConversation(prisma, {
          workspaceId,
          userId: req.authUser!.id,
          participantIds: parsed.data.participantIds,
          name: parsed.data.name,
        });
        res.status(201).json({ conversation });
      } catch (error) {
        mapDirectMessageError(res, error);
      }
    }),
  );

  // GET /api/workspaces/:workspaceId/direct-messages - List user's DM conversations
  router.get(
    '/',
    asyncRoute(async (req, res) => {
      const parsed = directConversationListQuerySchema.safeParse(req.query);
      if (!parsed.success) {
        validationError(res, firstValidationMessage(parsed.error));
        return;
      }

      const workspaceId = req.params.workspaceId;
      if (!workspaceId) {
        notFound(res, 'Workspace not found.');
        return;
      }

      const prisma = getPrisma();
      try {
        const page = await listUserDirectConversations(prisma, {
          workspaceId,
          userId: req.authUser!.id,
          limit: parsed.data.limit,
          cursor: parsed.data.cursor,
        });
        res.status(200).json(page);
      } catch (error) {
        mapDirectMessageError(res, error);
      }
    }),
  );

  // GET /api/workspaces/:workspaceId/direct-messages/unread - Get unread counts
  router.get(
    '/unread',
    asyncRoute(async (req, res) => {
      const workspaceId = req.params.workspaceId;
      if (!workspaceId) {
        notFound(res, 'Workspace not found.');
        return;
      }

      const prisma = getPrisma();
      try {
        const result = await getWorkspaceDirectConversationsUnread(prisma, {
          workspaceId,
          userId: req.authUser!.id,
        });
        res.status(200).json(result);
      } catch (error) {
        mapDirectMessageError(res, error);
      }
    }),
  );

  return router;
}

export function createDirectMessagesRouter(resolveAuth: () => AuthContext): Router {
  const router = Router();
  router.use(requireAuth(resolveAuth));

  // GET /api/direct-messages/:conversationId - Get single conversation
  router.get(
    '/:conversationId',
    asyncRoute(async (req, res) => {
      const prisma = getPrisma();
      try {
        const conversation = await getDirectConversation(prisma, {
          conversationId: req.params.conversationId,
          userId: req.authUser!.id,
        });
        res.status(200).json({ conversation });
      } catch (error) {
        mapDirectMessageError(res, error);
      }
    }),
  );

  // GET /api/direct-messages/:conversationId/participants
  router.get(
    '/:conversationId/participants',
    asyncRoute(async (req, res) => {
      const prisma = getPrisma();
      try {
        const participants = await getConversationParticipants(prisma, {
          conversationId: req.params.conversationId,
          userId: req.authUser!.id,
        });
        res.status(200).json({ participants });
      } catch (error) {
        mapDirectMessageError(res, error);
      }
    }),
  );

  // POST /api/direct-messages/:conversationId/messages - Post message to DM
  router.post(
    '/:conversationId/messages',
    asyncRoute(async (req, res) => {
      const parsed = createDirectMessageSchema.safeParse(req.body);
      if (!parsed.success) {
        validationError(res, firstValidationMessage(parsed.error));
        return;
      }

      const prisma = getPrisma();
      try {
        const message = await createDirectMessage(prisma, {
          conversationId: req.params.conversationId,
          authorId: req.authUser!.id,
          body: parsed.data.body,
        });
        emitDirectMessageCreated(req.params.conversationId, message);
        res.status(201).json({ message });
      } catch (error) {
        mapDirectMessageError(res, error);
      }
    }),
  );

  // GET /api/direct-messages/:conversationId/messages - List messages in DM
  router.get(
    '/:conversationId/messages',
    asyncRoute(async (req, res) => {
      const parsed = messageListQuerySchema.safeParse(req.query);
      if (!parsed.success) {
        validationError(res, firstValidationMessage(parsed.error));
        return;
      }

      const prisma = getPrisma();
      try {
        const page = await listDirectMessages(prisma, {
          conversationId: req.params.conversationId,
          userId: req.authUser!.id,
          limit: parsed.data.limit,
          cursor: parsed.data.cursor,
        });
        res.status(200).json(page);
      } catch (error) {
        mapDirectMessageError(res, error);
      }
    }),
  );

  // POST /api/direct-messages/:conversationId/read - Mark conversation as read
  router.post(
    '/:conversationId/read',
    asyncRoute(async (req, res) => {
      const parsed = markDirectConversationReadSchema.safeParse(req.body);
      if (!parsed.success) {
        validationError(res, firstValidationMessage(parsed.error));
        return;
      }

      const prisma = getPrisma();
      try {
        const readState = await markDirectConversationRead(prisma, {
          conversationId: req.params.conversationId,
          userId: req.authUser!.id,
          messageId: parsed.data.messageId,
        });
        emitDirectConversationRead(req.params.conversationId, readState);
        res.status(200).json({ readState });
      } catch (error) {
        mapDirectMessageError(res, error);
      }
    }),
  );

  // PATCH /api/direct-messages/:conversationId - Rename group conversation (Admin only)
  router.patch(
    '/:conversationId',
    asyncRoute(async (req, res) => {
      const parsed = renameGroupConversationSchema.safeParse(req.body);
      if (!parsed.success) {
        validationError(res, firstValidationMessage(parsed.error));
        return;
      }

      const prisma = getPrisma();
      try {
        const conversation = await renameGroupConversation(prisma, {
          conversationId: req.params.conversationId,
          userId: req.authUser!.id,
          name: parsed.data.name,
        });
        res.status(200).json({ conversation });
      } catch (error) {
        mapDirectMessageError(res, error);
      }
    }),
  );

  // POST /api/direct-messages/:conversationId/participants - Add participant (Admin only)
  router.post(
    '/:conversationId/participants',
    asyncRoute(async (req, res) => {
      const parsed = addConversationParticipantSchema.safeParse(req.body);
      if (!parsed.success) {
        validationError(res, firstValidationMessage(parsed.error));
        return;
      }

      const prisma = getPrisma();
      try {
        const conversation = await addConversationParticipant(prisma, {
          conversationId: req.params.conversationId,
          adminUserId: req.authUser!.id,
          userId: parsed.data.userId,
        });
        res.status(200).json({ conversation });
      } catch (error) {
        mapDirectMessageError(res, error);
      }
    }),
  );

  // DELETE /api/direct-messages/:conversationId/participants/:userId - Remove participant (Admin only)
  router.delete(
    '/:conversationId/participants/:userId',
    asyncRoute(async (req, res) => {
      const targetUserId = req.params.userId;
      if (!targetUserId) {
        validationError(res, 'User ID is required.');
        return;
      }

      const prisma = getPrisma();
      try {
        await removeConversationParticipant(prisma, {
          conversationId: req.params.conversationId,
          adminUserId: req.authUser!.id,
          userId: targetUserId,
        });
        res.status(200).json({ success: true });
      } catch (error) {
        mapDirectMessageError(res, error);
      }
    }),
  );

  // POST /api/direct-messages/:conversationId/leave - Leave group conversation
  router.post(
    '/:conversationId/leave',
    asyncRoute(async (req, res) => {
      const prisma = getPrisma();
      try {
        await leaveGroupConversation(prisma, {
          conversationId: req.params.conversationId,
          userId: req.authUser!.id,
        });
        res.status(200).json({ success: true });
      } catch (error) {
        mapDirectMessageError(res, error);
      }
    }),
  );

  return router;
}
