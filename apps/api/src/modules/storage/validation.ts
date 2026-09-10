/**
 * Attachment & Storage Validation Policy (Phase 4J.1).
 *
 * Centralizes size limits, count bounds, allowed MIME types, and secure storage key format.
 */

import { z } from 'zod';

export const MAX_ATTACHMENT_SIZE_BYTES = 25 * 1024 * 1024; // 25 MB
export const MAX_ATTACHMENTS_PER_MESSAGE = 5;
export const PRESIGNED_UPLOAD_EXPIRY_SECONDS = 900; // 15 minutes
export const PRESIGNED_DOWNLOAD_EXPIRY_SECONDS = 300; // 5 minutes

export const ALLOWED_MIME_TYPES = new Set([
  // Images
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  'image/svg+xml',
  // Documents
  'application/pdf',
  'text/plain',
  'text/csv',
  'text/markdown',
  'application/json',
  // Office docs
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document', // .docx
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', // .xlsx
  'application/vnd.openxmlformats-officedocument.presentationml.presentation', // .pptx
  // Archives
  'application/zip',
  'application/x-zip-compressed',
  'application/gzip',
]);

/** Sanitize filename against path traversal, control chars, etc. */
export function sanitizeFilename(filename: string): string {
  // Strip null bytes and control characters
  const cleaned = filename.replace(/[\0\r\n\t]/g, '').trim();
  // Strip directory separators (path traversal prevention)
  const basename = cleaned.split(/[/\\]/).pop() || '';
  return basename.slice(0, 255);
}

export const originalNameSchema = z
  .string({ error: 'Filename is required.' })
  .trim()
  .min(1, 'Filename is required.')
  .max(255, 'Filename is too long (255 characters or fewer).')
  .refine((val) => sanitizeFilename(val).length > 0, {
    message: 'Invalid filename.',
  })
  .transform((val) => sanitizeFilename(val));

export const mimeTypeSchema = z
  .string({ error: 'MIME type is required.' })
  .trim()
  .min(1, 'MIME type is required.')
  .refine((val) => ALLOWED_MIME_TYPES.has(val.toLowerCase()), {
    message: 'Unsupported file type.',
  })
  .transform((val) => val.toLowerCase());

export const fileSizeSchema = z
  .number({ error: 'File size is required.' })
  .int('File size must be an integer.')
  .min(1, 'File cannot be empty.')
  .max(
    MAX_ATTACHMENT_SIZE_BYTES,
    `File size exceeds the limit of ${MAX_ATTACHMENT_SIZE_BYTES / (1024 * 1024)}MB.`,
  );

export const storageKeySchema = z
  .string({ error: 'Storage key is required.' })
  .trim()
  .min(1, 'Storage key is required.')
  .max(500, 'Storage key is too long.')
  .refine((key) => !key.includes('..') && !key.startsWith('/') && !key.startsWith('\\'), {
    message: 'Invalid storage key path.',
  });

export const initAttachmentUploadSchema = z
  .object({
    originalName: originalNameSchema,
    mimeType: mimeTypeSchema,
    size: fileSizeSchema,
  })
  .strict();

export const finalizeAttachmentSchema = z
  .object({
    storageKey: storageKeySchema,
    originalName: originalNameSchema,
    mimeType: mimeTypeSchema,
    size: fileSizeSchema,
  })
  .strict();

export type InitAttachmentUploadInput = z.infer<typeof initAttachmentUploadSchema>;
export type FinalizeAttachmentInput = z.infer<typeof finalizeAttachmentSchema>;

/**
 * Generates a deterministic, collision-resistant storage key.
 * Format: workspaces/{workspaceId}/messages/{messageId}/{attachmentId}
 */
export function generateAttachmentStorageKey(params: {
  workspaceId: string;
  messageId: string;
  attachmentId: string;
}): string {
  // Ensure workspaceId and messageId contain no traversal characters
  const cleanWorkspaceId = params.workspaceId.replace(/[^a-zA-Z0-9_-]/g, '');
  const cleanMessageId = params.messageId.replace(/[^a-zA-Z0-9_-]/g, '');
  const cleanAttachmentId = params.attachmentId.replace(/[^a-zA-Z0-9_-]/g, '');

  return `workspaces/${cleanWorkspaceId}/messages/${cleanMessageId}/${cleanAttachmentId}`;
}

/** First safe, user-facing message from a Zod parse failure. */
export function firstValidationMessage(error: z.ZodError, fallback = 'Invalid request.'): string {
  const [firstIssue] = error.issues;
  return firstIssue?.message ?? fallback;
}
