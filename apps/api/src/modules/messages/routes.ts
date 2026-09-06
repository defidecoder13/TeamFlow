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
  createMessage,
  deleteMessage,
  listMessages,
  MessageConflictError,
  MessageForbiddenError,
  MessageNotFoundError,
  updateMessage,
} from './service';
import {
  createMessageSchema,
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
        res.status(200).json({ message });
      } catch (error) {
        mapMessageError(res, error);
      }
    }),
  );

  return router;
}
