/**
 * Attachment Service (Phase 4J.1).
 *
 * Handles attachment upload initialization, finalization, download signed URL generation,
 * and deletion coordination between PostgreSQL and Cloudflare R2.
 */

import { randomUUID } from 'node:crypto';
import type { PrismaClient } from '@teamflow/db';
import { authorizeChannelAccess } from '../messages/authorization';
import { authorizeDirectConversationAccess } from '../direct-messages/authorization';
import { getStorageService, type StorageService } from './r2';
import { generateAttachmentStorageKey, MAX_ATTACHMENTS_PER_MESSAGE } from './validation';

export interface AttachmentResponse {
  id: string;
  messageId: string;
  uploaderId: string;
  originalName: string;
  mimeType: string;
  size: number;
  createdAt: Date;
}

export class AttachmentNotFoundError extends Error {
  constructor(message = 'Attachment not found.') {
    super(message);
    this.name = 'AttachmentNotFoundError';
  }
}

export class AttachmentForbiddenError extends Error {
  constructor(message = 'You do not have permission.') {
    super(message);
    this.name = 'AttachmentForbiddenError';
  }
}

export class AttachmentConflictError extends Error {
  constructor(message = 'Attachment cannot be processed.') {
    super(message);
    this.name = 'AttachmentConflictError';
  }
}

export class AttachmentValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AttachmentValidationError';
  }
}

type MessageContainerInfo = {
  id: string;
  authorId: string;
  workspaceId: string;
  deletedAt: Date | null;
  channelId: string | null;
  directMessageConversationId: string | null;
};

/**
 * Resolves the message and its workspace/channel/DM container, verifying authorization for the caller.
 */
export async function resolveAuthorizedMessage(
  prisma: PrismaClient,
  messageId: string,
  userId: string,
): Promise<MessageContainerInfo | null> {
  const message = await prisma.message.findUnique({
    where: { id: messageId },
    select: {
      id: true,
      authorId: true,
      deletedAt: true,
      channelId: true,
      directMessageConversationId: true,
      channel: { select: { id: true, workspaceId: true, type: true } },
      directMessageConversation: { select: { id: true, workspaceId: true } },
    },
  });

  if (!message) {
    return null;
  }

  let workspaceId: string | null = null;

  if (message.channelId && message.channel) {
    const channel = await authorizeChannelAccess(prisma, {
      channelId: message.channelId,
      userId,
    });
    if (!channel) {
      return null;
    }
    workspaceId = message.channel.workspaceId;
  } else if (message.directMessageConversationId && message.directMessageConversation) {
    const conversation = await authorizeDirectConversationAccess(prisma, {
      conversationId: message.directMessageConversationId,
      userId,
    });
    if (!conversation) {
      return null;
    }
    workspaceId = message.directMessageConversation.workspaceId;
  } else {
    return null;
  }

  return {
    id: message.id,
    authorId: message.authorId,
    workspaceId,
    deletedAt: message.deletedAt,
    channelId: message.channelId,
    directMessageConversationId: message.directMessageConversationId,
  };
}

export interface InitAttachmentUploadResult {
  attachmentId: string;
  storageKey: string;
  uploadUrl: string;
  expiresIn: number;
}

/**
 * Initializes an attachment upload by generating a presigned PUT URL.
 */
export async function initAttachmentUpload(
  prisma: PrismaClient,
  input: {
    messageId: string;
    userId: string;
    originalName: string;
    mimeType: string;
    size: number;
  },
  storageService: StorageService = getStorageService(),
): Promise<InitAttachmentUploadResult> {
  const message = await resolveAuthorizedMessage(prisma, input.messageId, input.userId);
  if (!message) {
    throw new AttachmentNotFoundError('Message not found.');
  }

  if (message.deletedAt) {
    throw new AttachmentConflictError('Cannot add attachments to a deleted message.');
  }

  // Only the author of the message can add attachments to it
  if (message.authorId !== input.userId) {
    throw new AttachmentForbiddenError('Only the author can attach files to this message.');
  }

  // Verify attachment count limit
  const currentCount = await prisma.attachment.count({
    where: { messageId: message.id },
  });
  if (currentCount >= MAX_ATTACHMENTS_PER_MESSAGE) {
    throw new AttachmentConflictError(
      `Cannot exceed maximum limit of ${MAX_ATTACHMENTS_PER_MESSAGE} attachments per message.`,
    );
  }

  const attachmentId = randomUUID();
  const storageKey = generateAttachmentStorageKey({
    workspaceId: message.workspaceId,
    messageId: message.id,
    attachmentId,
  });

  const uploadUrl = await storageService.createPresignedUploadUrl(
    storageKey,
    input.mimeType,
    input.size,
  );

  return {
    attachmentId,
    storageKey,
    uploadUrl,
    expiresIn: 900,
  };
}

export interface FinalizeAttachmentResult {
  attachment: AttachmentResponse;
}

/**
 * Finalizes an attachment upload after the client has uploaded to Cloudflare R2.
 */
export async function finalizeAttachment(
  prisma: PrismaClient,
  input: {
    messageId: string;
    userId: string;
    storageKey: string;
    originalName: string;
    mimeType: string;
    size: number;
  },
  storageService: StorageService = getStorageService(),
): Promise<FinalizeAttachmentResult> {
  const message = await resolveAuthorizedMessage(prisma, input.messageId, input.userId);
  if (!message) {
    throw new AttachmentNotFoundError('Message not found.');
  }

  if (message.deletedAt) {
    throw new AttachmentConflictError('Cannot add attachments to a deleted message.');
  }

  if (message.authorId !== input.userId) {
    throw new AttachmentForbiddenError('Only the author can attach files to this message.');
  }

  // Verify the storage key belongs to this message/workspace
  const expectedPrefix = `workspaces/${message.workspaceId}/messages/${message.id}/`;
  if (!input.storageKey.startsWith(expectedPrefix)) {
    throw new AttachmentValidationError('Invalid storage key for this message.');
  }

  // Verify attachment count limit
  const currentCount = await prisma.attachment.count({
    where: { messageId: message.id },
  });

  // Extract or generate attachmentId
  const pathParts = input.storageKey.split('/');
  const attachmentId = pathParts[pathParts.length - 1] || randomUUID();

  // Idempotency: Check if an attachment with this storageKey or ID already exists
  const existingAttachment = await prisma.attachment.findFirst({
    where: {
      OR: [{ storageKey: input.storageKey }, { id: attachmentId }],
    },
  });
  if (existingAttachment) {
    return {
      attachment: {
        id: existingAttachment.id,
        messageId: existingAttachment.messageId,
        uploaderId: existingAttachment.uploaderId,
        originalName: existingAttachment.originalName,
        mimeType: existingAttachment.mimeType,
        size: existingAttachment.size,
        createdAt: existingAttachment.createdAt,
      },
    };
  }

  if (currentCount >= MAX_ATTACHMENTS_PER_MESSAGE) {
    throw new AttachmentConflictError(
      `Cannot exceed maximum limit of ${MAX_ATTACHMENTS_PER_MESSAGE} attachments per message.`,
    );
  }

  // Attempt to verify object exists on storage if possible
  const head = await storageService.headObject(input.storageKey);
  if (head !== null) {
    // If head returns, verify reasonable bounds
    if (head.size <= 0) {
      throw new AttachmentValidationError('Uploaded object is empty.');
    }
  }

  let attachment;
  try {
    attachment = await prisma.attachment.create({
      data: {
        id: attachmentId,
        messageId: message.id,
        uploaderId: input.userId,
        originalName: input.originalName,
        mimeType: input.mimeType,
        size: input.size,
        storageKey: input.storageKey,
      },
    });
  } catch (error) {
    // Idempotency: if two requests raced to finalize and one succeeded,
    // this one will hit a unique constraint error (P2002) on storageKey.
    // Return the existing attachment instead of compensating.
    if (error && typeof error === 'object' && 'code' in error && error.code === 'P2002') {
      const existing = await prisma.attachment.findUnique({
        where: { storageKey: input.storageKey },
      });
      if (existing) {
        return {
          attachment: {
            id: existing.id,
            messageId: existing.messageId,
            uploaderId: existing.uploaderId,
            originalName: existing.originalName,
            mimeType: existing.mimeType,
            size: existing.size,
            createdAt: existing.createdAt,
          },
        };
      }
    }

    // Compensation: If database insertion fails after object was uploaded to R2, attempt to delete the R2 object
    try {
      await storageService.deleteObject(input.storageKey);
    } catch (cleanupError) {
      console.error(
        `Failed compensating R2 deletion for key ${input.storageKey}:`,
        cleanupError instanceof Error ? cleanupError.message : cleanupError,
      );
    }
    throw error;
  }

  return {
    attachment: {
      id: attachment.id,
      messageId: attachment.messageId,
      uploaderId: attachment.uploaderId,
      originalName: attachment.originalName,
      mimeType: attachment.mimeType,
      size: attachment.size,
      createdAt: attachment.createdAt,
    },
  };
}

export interface GetAttachmentDownloadUrlResult {
  downloadUrl: string;
  originalName: string;
  mimeType: string;
  size: number;
  expiresIn: number;
}

/**
 * Resolves an attachment and generates a short-lived signed download URL after checking container authorization.
 */
export async function getAttachmentDownloadUrl(
  prisma: PrismaClient,
  input: {
    attachmentId: string;
    userId: string;
  },
  storageService: StorageService = getStorageService(),
): Promise<GetAttachmentDownloadUrlResult> {
  const attachment = await prisma.attachment.findUnique({
    where: { id: input.attachmentId },
    select: {
      id: true,
      messageId: true,
      originalName: true,
      mimeType: true,
      size: true,
      storageKey: true,
    },
  });

  if (!attachment) {
    throw new AttachmentNotFoundError('Attachment not found.');
  }

  const message = await resolveAuthorizedMessage(prisma, attachment.messageId, input.userId);
  if (!message) {
    throw new AttachmentNotFoundError('Attachment not found.');
  }

  const downloadUrl = await storageService.createPresignedDownloadUrl(
    attachment.storageKey,
    attachment.originalName,
  );

  return {
    downloadUrl,
    originalName: attachment.originalName,
    mimeType: attachment.mimeType,
    size: attachment.size,
    expiresIn: 300,
  };
}

/**
 * Deletes an attachment record from database and cleans up object from Cloudflare R2.
 */
export async function deleteAttachment(
  prisma: PrismaClient,
  input: {
    attachmentId: string;
    userId: string;
  },
  storageService: StorageService = getStorageService(),
): Promise<{ success: boolean; attachmentId: string }> {
  const attachment = await prisma.attachment.findUnique({
    where: { id: input.attachmentId },
    select: {
      id: true,
      messageId: true,
      storageKey: true,
      uploaderId: true,
    },
  });

  if (!attachment) {
    throw new AttachmentNotFoundError('Attachment not found.');
  }

  const message = await resolveAuthorizedMessage(prisma, attachment.messageId, input.userId);
  if (!message) {
    throw new AttachmentNotFoundError('Attachment not found.');
  }

  // Only the uploader or message author can delete the attachment
  if (attachment.uploaderId !== input.userId && message.authorId !== input.userId) {
    throw new AttachmentForbiddenError('You do not have permission to delete this attachment.');
  }

  // Remove DB record
  await prisma.attachment.delete({
    where: { id: attachment.id },
  });

  // Clean up from R2 (log failure if any, but do not block DB deletion)
  try {
    await storageService.deleteObject(attachment.storageKey);
  } catch (error) {
    console.error(
      `Failed to delete R2 object for key ${attachment.storageKey}:`,
      error instanceof Error ? error.message : error,
    );
  }

  return {
    success: true,
    attachmentId: attachment.id,
  };
}

/**
 * Helper to clean up all R2 objects for a message's attachments upon hard message deletion.
 */
export async function cleanUpMessageR2Objects(
  prisma: PrismaClient,
  messageId: string,
  storageService: StorageService = getStorageService(),
): Promise<void> {
  const attachments = await prisma.attachment.findMany({
    where: { messageId },
    select: { storageKey: true },
  });

  for (const att of attachments) {
    try {
      await storageService.deleteObject(att.storageKey);
    } catch (error) {
      console.error(
        `Failed to cleanup R2 object for key ${att.storageKey}:`,
        error instanceof Error ? error.message : error,
      );
    }
  }
}
