/**
 * Attachment HTTP routes (Phase 4J.1).
 *
 * REST Endpoints:
 * - POST /api/messages/:messageId/attachments/upload-url: Initialize attachment upload (presigned PUT URL)
 * - POST /api/messages/:messageId/attachments/finalize: Finalize attachment upload (creates PostgreSQL record)
 * - GET /api/attachments/:attachmentId/download-url: Get short-lived signed download/view URL
 * - DELETE /api/attachments/:attachmentId: Delete attachment metadata and clean up object in Cloudflare R2
 */

import { Router, type NextFunction, type Request, type Response } from 'express';
import type { AuthContext } from '../auth/index';
import { getPrisma } from '../auth/prisma';
import { requireAuth } from '../auth/session';
import {
  AttachmentConflictError,
  AttachmentForbiddenError,
  AttachmentNotFoundError,
  AttachmentValidationError,
  deleteAttachment,
  finalizeAttachment,
  getAttachmentDownloadUrl,
  initAttachmentUpload,
} from './service';
import {
  finalizeAttachmentSchema,
  firstValidationMessage,
  initAttachmentUploadSchema,
} from './validation';

function validationError(res: Response, message: string): void {
  res.status(400).json({ error: { code: 'VALIDATION_ERROR', message } });
}

function notFound(res: Response, message = 'Attachment not found.'): void {
  res.status(404).json({ error: { code: 'NOT_FOUND', message } });
}

function forbidden(res: Response, message = 'You do not have permission.'): void {
  res.status(403).json({ error: { code: 'FORBIDDEN', message } });
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

function mapAttachmentError(res: Response, error: unknown): void {
  if (error instanceof AttachmentValidationError) {
    validationError(res, error.message);
    return;
  }
  if (error instanceof AttachmentNotFoundError) {
    notFound(res, error.message);
    return;
  }
  if (error instanceof AttachmentForbiddenError) {
    forbidden(res, error.message);
    return;
  }
  if (error instanceof AttachmentConflictError) {
    res.status(409).json({ error: { code: 'CONFLICT', message: error.message } });
    return;
  }
  throw error;
}

/**
 * Message attachments router mounted at `/api/messages/:messageId/attachments`.
 */
export function createMessageAttachmentsRouter(resolveAuth: () => AuthContext): Router {
  const router = Router({ mergeParams: true });
  router.use(requireAuth(resolveAuth));

  // POST /api/messages/:messageId/attachments/upload-url
  router.post(
    '/upload-url',
    asyncRoute(async (req, res) => {
      const parsed = initAttachmentUploadSchema.safeParse(req.body);
      if (!parsed.success) {
        validationError(res, firstValidationMessage(parsed.error));
        return;
      }
      const authUser = requireSessionUser(req, res);
      if (!authUser) return;

      const messageId = req.params.messageId;
      if (!messageId) {
        notFound(res, 'Message not found.');
        return;
      }

      try {
        const result = await initAttachmentUpload(getPrisma(), {
          messageId,
          userId: authUser.id,
          originalName: parsed.data.originalName,
          mimeType: parsed.data.mimeType,
          size: parsed.data.size,
        });
        res.status(200).json(result);
      } catch (error) {
        mapAttachmentError(res, error);
      }
    }),
  );

  // POST /api/messages/:messageId/attachments/finalize
  router.post(
    '/finalize',
    asyncRoute(async (req, res) => {
      const parsed = finalizeAttachmentSchema.safeParse(req.body);
      if (!parsed.success) {
        validationError(res, firstValidationMessage(parsed.error));
        return;
      }
      const authUser = requireSessionUser(req, res);
      if (!authUser) return;

      const messageId = req.params.messageId;
      if (!messageId) {
        notFound(res, 'Message not found.');
        return;
      }

      try {
        const result = await finalizeAttachment(getPrisma(), {
          messageId,
          userId: authUser.id,
          storageKey: parsed.data.storageKey,
          originalName: parsed.data.originalName,
          mimeType: parsed.data.mimeType,
          size: parsed.data.size,
        });

        // Broadcast updated message with attachments to channel / DM room (Phase 4J.3)
        try {
          const { getMessageWithDetails } = await import('../messages/service');
          const { emitMessageUpdated, emitDirectMessageUpdated } =
            await import('../realtime/index');
          const updatedMessage = await getMessageWithDetails(getPrisma(), { messageId });
          if (updatedMessage) {
            if (updatedMessage.channelId) {
              emitMessageUpdated(updatedMessage.channelId, updatedMessage);
            } else if (updatedMessage.directMessageConversationId) {
              emitDirectMessageUpdated(updatedMessage.directMessageConversationId, updatedMessage);
            }
          }
        } catch {
          // Realtime broadcast error should not fail HTTP finalize response
        }

        res.status(201).json(result);
      } catch (error) {
        mapAttachmentError(res, error);
      }
    }),
  );

  return router;
}

/**
 * Top-level attachments router mounted at `/api/attachments`.
 */
export function createAttachmentsRouter(resolveAuth: () => AuthContext): Router {
  const router = Router();
  router.use(requireAuth(resolveAuth));

  // GET /api/attachments/:attachmentId/download-url
  router.get(
    '/:attachmentId/download-url',
    asyncRoute(async (req, res) => {
      const authUser = requireSessionUser(req, res);
      if (!authUser) return;

      const attachmentId = req.params.attachmentId;
      if (!attachmentId) {
        notFound(res, 'Attachment not found.');
        return;
      }

      try {
        const result = await getAttachmentDownloadUrl(getPrisma(), {
          attachmentId,
          userId: authUser.id,
        });
        res.status(200).json(result);
      } catch (error) {
        mapAttachmentError(res, error);
      }
    }),
  );

  // DELETE /api/attachments/:attachmentId
  router.delete(
    '/:attachmentId',
    asyncRoute(async (req, res) => {
      const authUser = requireSessionUser(req, res);
      if (!authUser) return;

      const attachmentId = req.params.attachmentId;
      if (!attachmentId) {
        notFound(res, 'Attachment not found.');
        return;
      }

      try {
        const result = await deleteAttachment(getPrisma(), {
          attachmentId,
          userId: authUser.id,
        });
        res.status(200).json(result);
      } catch (error) {
        mapAttachmentError(res, error);
      }
    }),
  );

  return router;
}
