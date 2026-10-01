/**
 * Attachment API & Upload Pipeline (Phase 4J.2).
 *
 * Handles attachment validation, presigned URL retrieval, direct-to-R2 binary upload,
 * and attachment record finalization.
 */

import { getApiBaseUrl } from './config';

export const MAX_ATTACHMENTS_PER_MESSAGE = 5;
export const MAX_ATTACHMENT_SIZE_BYTES = 25 * 1024 * 1024; // 25 MB

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

export interface Attachment {
  id: string;
  messageId: string;
  originalName: string;
  mimeType: string;
  size: number;
  storageKey: string;
  createdAt: Date;
  updatedAt: Date;
}

export type AttachmentUploadStatus =
  'idle' | 'requesting-url' | 'uploading' | 'finalizing' | 'complete' | 'failed' | 'cancelled';

export interface AttachmentDraft {
  id: string; // Client-side unique ID for tracking during draft
  file: File;
  name: string;
  size: number;
  mimeType: string;
  status: AttachmentUploadStatus;
  progress: number; // 0 to 100
  error?: string | null;
  abortController?: AbortController | null;
  serverAttachment?: Attachment | null;
}

export interface InitUploadResponse {
  uploadUrl: string;
  storageKey: string;
  attachmentId: string;
  expiresInSeconds: number;
}

export interface FinalizeAttachmentResponse {
  attachment: {
    id: string;
    messageId: string;
    originalName: string;
    mimeType: string;
    size: number;
    storageKey: string;
    createdAt: string;
    updatedAt: string;
  };
}

/** Sanitize file name for client-side sanity check. */
export function sanitizeFilename(filename: string): string {
  const cleaned = filename.replace(/[\0\r\n\t]/g, '').trim();
  const basename = cleaned.split(/[/\\]/).pop() || '';
  return basename.slice(0, 255);
}

/** Format file size in human-readable units (e.g. 1.2 MB). */
export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** Validate an individual file before adding to draft list. */
export function validateAttachmentFile(file: File): { ok: true } | { ok: false; error: string } {
  if (file.size <= 0) {
    return { ok: false, error: `"${file.name}" is empty (0 bytes).` };
  }
  if (file.size > MAX_ATTACHMENT_SIZE_BYTES) {
    return {
      ok: false,
      error: `"${file.name}" exceeds the 25MB file size limit (${formatFileSize(file.size)}).`,
    };
  }
  const cleanName = sanitizeFilename(file.name);
  if (!cleanName) {
    return { ok: false, error: 'File name is invalid.' };
  }
  const mime = (file.type || '').toLowerCase();
  if (!mime || !ALLOWED_MIME_TYPES.has(mime)) {
    return {
      ok: false,
      error: `"${file.name}" has an unsupported file type or is missing a MIME type${mime ? ` (${mime})` : ''}.`,
    };
  }
  return { ok: true };
}

/** Request presigned R2 upload URL from backend. */
export async function requestUploadUrl(
  messageId: string,
  file: { originalName: string; mimeType: string; size: number },
  apiBase?: string,
  signal?: AbortSignal,
): Promise<{ ok: true; data: InitUploadResponse } | { ok: false; error: string }> {
  const base = apiBase || getApiBaseUrl();
  try {
    const res = await fetch(
      `${base}/api/messages/${encodeURIComponent(messageId)}/attachments/upload-url`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({
          originalName: sanitizeFilename(file.originalName),
          mimeType: file.mimeType || 'application/octet-stream',
          size: file.size,
        }),
        signal,
      },
    );

    if (!res.ok) {
      let errorMsg = 'Failed to request upload URL.';
      try {
        const json = await res.json();
        if (json?.error?.message) {
          errorMsg = json.error.message;
        }
      } catch {
        // ignore
      }
      return { ok: false, error: errorMsg };
    }

    const data = (await res.json()) as InitUploadResponse;
    return { ok: true, data };
  } catch (err: unknown) {
    if (err instanceof Error && err.name === 'AbortError') {
      return { ok: false, error: 'Upload cancelled.' };
    }
    return { ok: false, error: 'Network error requesting upload URL.' };
  }
}

/** Direct binary PUT to Cloudflare R2 presigned URL with progress support. */
export async function uploadBinaryToR2(
  uploadUrl: string,
  file: File,
  mimeType: string,
  onProgress?: (progress: number) => void,
  signal?: AbortSignal,
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const res = await fetch(uploadUrl, {
      method: 'PUT',
      headers: {
        'Content-Type': mimeType || 'application/octet-stream',
      },
      body: file,
      signal,
    });

    if (res.ok) {
      onProgress?.(100);
      return { ok: true };
    }
    return { ok: false, error: `Upload to storage failed (${res.status}).` };
  } catch (err: unknown) {
    if (err instanceof Error && err.name === 'AbortError') {
      return { ok: false, error: 'Upload cancelled.' };
    }
    return { ok: false, error: 'Storage upload failed.' };
  }
}

/** Finalize attachment record in PostgreSQL. */
export async function finalizeAttachment(
  messageId: string,
  params: {
    storageKey: string;
    originalName: string;
    mimeType: string;
    size: number;
  },
  apiBase?: string,
  signal?: AbortSignal,
): Promise<{ ok: true; data: Attachment } | { ok: false; error: string }> {
  const base = apiBase || getApiBaseUrl();
  try {
    const res = await fetch(
      `${base}/api/messages/${encodeURIComponent(messageId)}/attachments/finalize`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({
          storageKey: params.storageKey,
          originalName: sanitizeFilename(params.originalName),
          mimeType: params.mimeType || 'application/octet-stream',
          size: params.size,
        }),
        signal,
      },
    );

    if (!res.ok) {
      let errorMsg = 'Failed to finalize attachment.';
      try {
        const json = await res.json();
        if (json?.error?.message) {
          errorMsg = json.error.message;
        }
      } catch {
        // ignore
      }
      return { ok: false, error: errorMsg };
    }

    const json = (await res.json()) as FinalizeAttachmentResponse;
    const att = json.attachment;
    return {
      ok: true,
      data: {
        id: att.id,
        messageId: att.messageId,
        originalName: att.originalName,
        mimeType: att.mimeType,
        size: att.size,
        storageKey: att.storageKey,
        createdAt: new Date(att.createdAt),
        updatedAt: new Date(att.updatedAt),
      },
    };
  } catch (err: unknown) {
    if (err instanceof Error && err.name === 'AbortError') {
      return { ok: false, error: 'Finalize cancelled.' };
    }
    return { ok: false, error: 'Network error finalizing attachment.' };
  }
}

/** Full pipeline to upload a single attachment draft against a message ID. */
export async function uploadSingleAttachmentDraft(
  messageId: string,
  draft: AttachmentDraft,
  onProgress?: (progress: number) => void,
  onStatusChange?: (status: AttachmentUploadStatus, error?: string | null) => void,
  apiBase?: string,
): Promise<{ ok: true; attachment: Attachment } | { ok: false; error: string }> {
  const abortController = draft.abortController || new AbortController();
  const signal = abortController.signal;

  try {
    // 1. Request presigned upload URL
    onStatusChange?.('requesting-url');
    const initRes = await requestUploadUrl(
      messageId,
      {
        originalName: draft.name,
        mimeType: draft.mimeType,
        size: draft.size,
      },
      apiBase,
      signal,
    );

    if (!initRes.ok) {
      onStatusChange?.('failed', initRes.error);
      return { ok: false, error: initRes.error };
    }

    // 2. Direct binary upload to R2
    onStatusChange?.('uploading');
    const uploadRes = await uploadBinaryToR2(
      initRes.data.uploadUrl,
      draft.file,
      draft.mimeType,
      onProgress,
      signal,
    );

    if (!uploadRes.ok) {
      onStatusChange?.('failed', uploadRes.error);
      return { ok: false, error: uploadRes.error };
    }

    // 3. Finalize attachment record
    onStatusChange?.('finalizing');
    const finRes = await finalizeAttachment(
      messageId,
      {
        storageKey: initRes.data.storageKey,
        originalName: draft.name,
        mimeType: draft.mimeType,
        size: draft.size,
      },
      apiBase,
      signal,
    );

    if (!finRes.ok) {
      onStatusChange?.('failed', finRes.error);
      return { ok: false, error: finRes.error };
    }

    onStatusChange?.('complete');
    return { ok: true, attachment: finRes.data };
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : 'Unknown upload error.';
    onStatusChange?.('failed', errorMsg);
    return { ok: false, error: errorMsg };
  }
}

/** In-memory cache for download URLs: maps attachmentId to { url, expiresAt } */
const downloadUrlCache = new Map<string, { url: string; expiresAt: number }>();

export interface DownloadUrlResponse {
  downloadUrl: string;
  expiresInSeconds: number;
}

/**
 * Fetch short-lived signed download URL for an attachment, utilizing in-memory caching.
 * Caches URLs with a 30-second buffer before their expiration.
 */
export async function fetchAttachmentDownloadUrl(
  attachmentId: string,
  apiBase?: string,
  signal?: AbortSignal,
): Promise<{ ok: true; url: string } | { ok: false; error: string }> {
  const cached = downloadUrlCache.get(attachmentId);
  const now = Date.now();
  if (cached && cached.expiresAt > now + 30 * 1000) {
    return { ok: true, url: cached.url };
  }

  const base = apiBase || getApiBaseUrl();
  try {
    const res = await fetch(
      `${base}/api/attachments/${encodeURIComponent(attachmentId)}/download-url`,
      {
        method: 'GET',
        headers: { Accept: 'application/json' },
        credentials: 'include',
        signal,
      },
    );

    if (!res.ok) {
      let errorMsg = 'Failed to get download URL.';
      try {
        const json = await res.json();
        if (json?.error?.message) {
          errorMsg = json.error.message;
        }
      } catch {
        // ignore
      }
      return { ok: false, error: errorMsg };
    }

    const data = (await res.json()) as DownloadUrlResponse;
    const expiresAt = now + (data.expiresInSeconds || 300) * 1000;
    downloadUrlCache.set(attachmentId, { url: data.downloadUrl, expiresAt });
    return { ok: true, url: data.downloadUrl };
  } catch (err: unknown) {
    if (err instanceof Error && err.name === 'AbortError') {
      return { ok: false, error: 'Download request cancelled.' };
    }
    return { ok: false, error: 'Network error retrieving download URL.' };
  }
}

/** Clear download URL cache (useful for tests or logout). */
export function clearAttachmentDownloadUrlCache(): void {
  downloadUrlCache.clear();
}

/**
 * Delete an attachment record (and its stored object, best-effort server-side).
 * The backend permits only the uploader or the message author; anything else
 * surfaces as a permission error. Never throws — failures are values.
 */
export async function deleteAttachment(
  attachmentId: string,
  apiBase?: string,
  signal?: AbortSignal,
): Promise<{ ok: true } | { ok: false; error: string; unauthorized?: boolean }> {
  const base = apiBase || getApiBaseUrl();
  try {
    const res = await fetch(`${base}/api/attachments/${encodeURIComponent(attachmentId)}`, {
      method: 'DELETE',
      headers: { Accept: 'application/json' },
      credentials: 'include',
      signal,
    });

    if (res.ok) {
      return { ok: true };
    }
    if (res.status === 401) {
      return { ok: false, error: 'Session expired. Please sign in again.', unauthorized: true };
    }
    let errorMsg = 'Could not delete attachment.';
    try {
      const json = await res.json();
      if (json?.error?.message) {
        errorMsg = json.error.message;
      }
    } catch {
      // ignore
    }
    if (res.status === 403) {
      return { ok: false, error: 'You do not have permission to delete this attachment.' };
    }
    if (res.status === 404) {
      return { ok: false, error: 'Attachment not found. It may have been deleted already.' };
    }
    return { ok: false, error: errorMsg };
  } catch (err: unknown) {
    if (err instanceof Error && err.name === 'AbortError') {
      return { ok: false, error: 'Delete cancelled.' };
    }
    return { ok: false, error: 'Network error deleting attachment.' };
  }
}
