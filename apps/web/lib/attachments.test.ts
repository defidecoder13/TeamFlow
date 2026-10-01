import { describe, expect, it, vi, beforeEach } from 'vitest';
import {
  formatFileSize,
  sanitizeFilename,
  validateAttachmentFile,
  requestUploadUrl,
  uploadBinaryToR2,
  finalizeAttachment,
  uploadSingleAttachmentDraft,
  deleteAttachment,
  type AttachmentDraft,
} from './attachments';

describe('attachments lib', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe('sanitizeFilename', () => {
    it('removes directory paths and control characters', () => {
      expect(sanitizeFilename('../../etc/passwd')).toBe('passwd');
      expect(sanitizeFilename('C:\\Windows\\System32\\calc.exe')).toBe('calc.exe');
      expect(sanitizeFilename('my\0file\n.pdf')).toBe('myfile.pdf');
    });

    it('truncates filenames longer than 255 chars', () => {
      const longName = 'a'.repeat(300) + '.txt';
      const result = sanitizeFilename(longName);
      expect(result.length).toBeLessThanOrEqual(255);
    });
  });

  describe('formatFileSize', () => {
    it('formats bytes, KB, and MB accurately', () => {
      expect(formatFileSize(500)).toBe('500 B');
      expect(formatFileSize(2048)).toBe('2.0 KB');
      expect(formatFileSize(5 * 1024 * 1024)).toBe('5.0 MB');
    });
  });

  describe('validateAttachmentFile', () => {
    it('rejects empty (0 byte) files', () => {
      const file = new File([], 'empty.txt', { type: 'text/plain' });
      const res = validateAttachmentFile(file);
      expect(res.ok).toBe(false);
      if (!res.ok) {
        expect(res.error).toContain('is empty (0 bytes)');
      }
    });

    it('rejects files larger than 25MB', () => {
      const largeContent = new Uint8Array(26 * 1024 * 1024);
      const file = new File([largeContent], 'big.pdf', { type: 'application/pdf' });
      const res = validateAttachmentFile(file);
      expect(res.ok).toBe(false);
      if (!res.ok) {
        expect(res.error).toContain('exceeds the 25MB file size limit');
      }
    });

    it('rejects unsupported MIME types', () => {
      const file = new File(['content'], 'script.exe', { type: 'application/x-msdownload' });
      const res = validateAttachmentFile(file);
      expect(res.ok).toBe(false);
      if (!res.ok) {
        expect(res.error).toContain('unsupported file type');
      }
    });

    it('accepts valid images, pdfs, docs within 25MB', () => {
      const file = new File(['dummy content'], 'report.pdf', { type: 'application/pdf' });
      const res = validateAttachmentFile(file);
      expect(res.ok).toBe(true);
    });
  });

  describe('requestUploadUrl', () => {
    it('posts to backend and returns presigned payload on success', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          uploadUrl: 'https://r2.test.com/upload-target',
          storageKey: 'workspaces/ws-1/messages/msg-1/att-1',
          attachmentId: 'att-1',
          expiresInSeconds: 900,
        }),
      });
      global.fetch = mockFetch;

      const res = await requestUploadUrl(
        'msg-1',
        { originalName: 'doc.pdf', mimeType: 'application/pdf', size: 1024 },
        'http://localhost:3001',
      );

      expect(res.ok).toBe(true);
      if (res.ok) {
        expect(res.data.uploadUrl).toBe('https://r2.test.com/upload-target');
        expect(res.data.storageKey).toBe('workspaces/ws-1/messages/msg-1/att-1');
      }
      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:3001/api/messages/msg-1/attachments/upload-url',
        expect.objectContaining({
          method: 'POST',
        }),
      );
    });

    it('handles server errors gracefully', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        json: async () => ({
          error: { message: 'Maximum 5 attachments reached.' },
        }),
      });

      const res = await requestUploadUrl(
        'msg-1',
        { originalName: 'doc.pdf', mimeType: 'application/pdf', size: 1024 },
        'http://localhost:3001',
      );

      expect(res.ok).toBe(false);
      if (!res.ok) {
        expect(res.error).toBe('Maximum 5 attachments reached.');
      }
    });
  });

  describe('uploadBinaryToR2', () => {
    it('PUTs file binary to R2 upload URL', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
      });
      global.fetch = mockFetch;

      const file = new File(['test binary'], 'test.png', { type: 'image/png' });
      const onProgress = vi.fn();
      const res = await uploadBinaryToR2(
        'https://r2.test.com/upload-target',
        file,
        'image/png',
        onProgress,
      );

      expect(res.ok).toBe(true);
      expect(onProgress).toHaveBeenCalledWith(100);
      expect(mockFetch).toHaveBeenCalledWith('https://r2.test.com/upload-target', {
        method: 'PUT',
        headers: { 'Content-Type': 'image/png' },
        body: file,
        signal: undefined,
      });
    });
  });

  describe('finalizeAttachment', () => {
    it('creates finalized attachment record via POST', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          attachment: {
            id: 'att-1',
            messageId: 'msg-1',
            originalName: 'image.png',
            mimeType: 'image/png',
            size: 2048,
            storageKey: 'workspaces/ws-1/messages/msg-1/att-1',
            createdAt: '2026-09-09T20:00:00.000Z',
            updatedAt: '2026-09-09T20:00:00.000Z',
          },
        }),
      });
      global.fetch = mockFetch;

      const res = await finalizeAttachment(
        'msg-1',
        {
          storageKey: 'workspaces/ws-1/messages/msg-1/att-1',
          originalName: 'image.png',
          mimeType: 'image/png',
          size: 2048,
        },
        'http://localhost:3001',
      );

      expect(res.ok).toBe(true);
      if (res.ok) {
        expect(res.data.id).toBe('att-1');
        expect(res.data.originalName).toBe('image.png');
      }
    });
  });

  describe('uploadSingleAttachmentDraft pipeline', () => {
    it('runs the 3-step pipeline successfully', async () => {
      global.fetch = vi
        .fn()
        // 1. init upload
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            uploadUrl: 'https://r2.test.com/upload',
            storageKey: 'key-123',
            attachmentId: 'att-1',
            expiresInSeconds: 900,
          }),
        })
        // 2. binary PUT
        .mockResolvedValueOnce({
          ok: true,
        })
        // 3. finalize
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            attachment: {
              id: 'att-1',
              messageId: 'msg-1',
              originalName: 'file.pdf',
              mimeType: 'application/pdf',
              size: 100,
              storageKey: 'key-123',
              createdAt: '2026-09-09T20:00:00.000Z',
              updatedAt: '2026-09-09T20:00:00.000Z',
            },
          }),
        });

      const file = new File(['abc'], 'file.pdf', { type: 'application/pdf' });
      const draft: AttachmentDraft = {
        id: 'draft-1',
        file,
        name: 'file.pdf',
        size: 100,
        mimeType: 'application/pdf',
        status: 'idle',
        progress: 0,
      };

      const statusLog: string[] = [];
      const res = await uploadSingleAttachmentDraft(
        'msg-1',
        draft,
        undefined,
        (status) => statusLog.push(status),
        'http://localhost:3001',
      );

      expect(res.ok).toBe(true);
      expect(statusLog).toEqual(['requesting-url', 'uploading', 'finalizing', 'complete']);
    });
  });

  describe('deleteAttachment', () => {
    it('sends DELETE and returns ok on success', async () => {
      const mockFetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) });
      global.fetch = mockFetch;

      const res = await deleteAttachment('att-1', 'http://localhost:3001');

      expect(res).toEqual({ ok: true });
      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:3001/api/attachments/att-1',
        expect.objectContaining({ method: 'DELETE', credentials: 'include' }),
      );
    });

    it('maps 401, 403, and 404 to safe messages', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        json: async () => ({}),
      });
      const unauth = await deleteAttachment('att-1', 'http://localhost:3001');
      expect(unauth.ok).toBe(false);
      if (!unauth.ok) {
        expect(unauth.unauthorized).toBe(true);
      }

      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 403,
        json: async () => ({ error: { message: 'Denied.' } }),
      });
      const forbidden = await deleteAttachment('att-1', 'http://localhost:3001');
      expect(forbidden).toEqual({
        ok: false,
        error: 'You do not have permission to delete this attachment.',
      });

      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 404,
        json: async () => ({}),
      });
      const missing = await deleteAttachment('att-1', 'http://localhost:3001');
      expect(missing.ok).toBe(false);
      if (!missing.ok) {
        expect(missing.error).toContain('been deleted already');
      }
    });

    it('returns a network error without throwing', async () => {
      global.fetch = vi.fn().mockRejectedValue(new Error('offline'));
      const res = await deleteAttachment('att-1', 'http://localhost:3001');
      expect(res).toEqual({ ok: false, error: 'Network error deleting attachment.' });
    });
  });
});
