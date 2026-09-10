/**
 * Storage & Attachments module entry point (Phase 4J.1).
 */

export { getR2Config, isR2Configured, type R2Config, MissingR2ConfigError } from './config';
export { getStorageService, setStorageService, R2StorageService, type StorageService } from './r2';
export {
  initAttachmentUpload,
  finalizeAttachment,
  getAttachmentDownloadUrl,
  deleteAttachment,
  cleanUpMessageR2Objects,
  resolveAuthorizedMessage,
  type AttachmentResponse,
  type InitAttachmentUploadResult,
  type FinalizeAttachmentResult,
  type GetAttachmentDownloadUrlResult,
  AttachmentConflictError,
  AttachmentForbiddenError,
  AttachmentNotFoundError,
  AttachmentValidationError,
} from './service';
export { createMessageAttachmentsRouter, createAttachmentsRouter } from './routes';
export {
  initAttachmentUploadSchema,
  finalizeAttachmentSchema,
  generateAttachmentStorageKey,
  sanitizeFilename,
  ALLOWED_MIME_TYPES,
  MAX_ATTACHMENT_SIZE_BYTES,
  MAX_ATTACHMENTS_PER_MESSAGE,
  PRESIGNED_UPLOAD_EXPIRY_SECONDS,
  PRESIGNED_DOWNLOAD_EXPIRY_SECONDS,
} from './validation';
