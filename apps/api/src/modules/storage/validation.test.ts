import { describe, expect, it } from 'vitest';
import {
  ALLOWED_MIME_TYPES,
  finalizeAttachmentSchema,
  generateAttachmentStorageKey,
  initAttachmentUploadSchema,
  MAX_ATTACHMENT_SIZE_BYTES,
  sanitizeFilename,
} from './validation';

describe('Attachment Validation Policy', () => {
  describe('sanitizeFilename', () => {
    it('strips path traversal and control characters', () => {
      expect(sanitizeFilename('../../etc/passwd')).toBe('passwd');
      expect(sanitizeFilename('folder/subfolder/file.pdf')).toBe('file.pdf');
      expect(sanitizeFilename('folder\\subfolder\\file.docx')).toBe('file.docx');
      expect(sanitizeFilename('bad\0name\r\n.png')).toBe('badname.png');
    });

    it('truncates excessively long filenames', () => {
      const longName = 'a'.repeat(300) + '.png';
      expect(sanitizeFilename(longName).length).toBeLessThanOrEqual(255);
    });
  });

  describe('generateAttachmentStorageKey', () => {
    it('creates collision-resistant, parameterized paths', () => {
      const key = generateAttachmentStorageKey({
        workspaceId: 'ws-123',
        messageId: 'msg-456',
        attachmentId: 'att-789',
      });
      expect(key).toBe('workspaces/ws-123/messages/msg-456/att-789');
    });

    it('sanitizes unsafe characters in ids', () => {
      const key = generateAttachmentStorageKey({
        workspaceId: 'ws../123',
        messageId: 'msg../456',
        attachmentId: 'att../789',
      });
      expect(key).toBe('workspaces/ws123/messages/msg456/att789');
    });
  });

  describe('initAttachmentUploadSchema', () => {
    it('accepts valid payload', () => {
      const parsed = initAttachmentUploadSchema.safeParse({
        originalName: 'photo.png',
        mimeType: 'image/png',
        size: 1024 * 1024,
      });
      expect(parsed.success).toBe(true);
    });

    it('rejects unsupported MIME types', () => {
      const parsed = initAttachmentUploadSchema.safeParse({
        originalName: 'script.exe',
        mimeType: 'application/x-msdownload',
        size: 1024,
      });
      expect(parsed.success).toBe(false);
    });

    it('rejects empty or zero-byte file sizes', () => {
      const parsed = initAttachmentUploadSchema.safeParse({
        originalName: 'empty.png',
        mimeType: 'image/png',
        size: 0,
      });
      expect(parsed.success).toBe(false);
    });

    it('rejects oversized files exceeding 25MB limit', () => {
      const parsed = initAttachmentUploadSchema.safeParse({
        originalName: 'huge.zip',
        mimeType: 'application/zip',
        size: MAX_ATTACHMENT_SIZE_BYTES + 1,
      });
      expect(parsed.success).toBe(false);
    });

    it('rejects unknown fields strictly', () => {
      const parsed = initAttachmentUploadSchema.safeParse({
        originalName: 'photo.png',
        mimeType: 'image/png',
        size: 1024,
        extraField: 'hacked',
      });
      expect(parsed.success).toBe(false);
    });
  });

  describe('finalizeAttachmentSchema', () => {
    it('accepts valid finalize payload', () => {
      const parsed = finalizeAttachmentSchema.safeParse({
        storageKey: 'workspaces/ws-1/messages/msg-1/att-1',
        originalName: 'doc.pdf',
        mimeType: 'application/pdf',
        size: 2048,
      });
      expect(parsed.success).toBe(true);
    });

    it('rejects storage key with path traversal', () => {
      const parsed = finalizeAttachmentSchema.safeParse({
        storageKey: '../secret/file',
        originalName: 'doc.pdf',
        mimeType: 'application/pdf',
        size: 2048,
      });
      expect(parsed.success).toBe(false);
    });
  });

  describe('ALLOWED_MIME_TYPES', () => {
    it('includes standard images, docs, and zip files', () => {
      expect(ALLOWED_MIME_TYPES.has('image/jpeg')).toBe(true);
      expect(ALLOWED_MIME_TYPES.has('image/png')).toBe(true);
      expect(ALLOWED_MIME_TYPES.has('application/pdf')).toBe(true);
      expect(ALLOWED_MIME_TYPES.has('application/zip')).toBe(true);
      expect(ALLOWED_MIME_TYPES.has('text/plain')).toBe(true);
    });
  });
});
