'use client';

import { useEffect, useState } from 'react';
import {
  deleteAttachment,
  fetchAttachmentDownloadUrl,
  formatFileSize,
  type Attachment,
} from '../../lib/attachments';
import type { MessageAttachment } from '../../lib/messages';

interface AttachmentDisplayProps {
  attachments?: (MessageAttachment | Attachment)[] | null;
  className?: string;
  /**
   * Identity used to gate the delete control. Shown only when the current
   * user is the message author or the attachment uploader — mirroring the
   * backend rule (which remains authoritative). Omit to hide deletion.
   */
  currentUserId?: string | null;
  messageAuthorId?: string;
  /** Called after an attachment is successfully deleted. */
  onAttachmentDeleted?: (attachmentId: string) => void;
}

type DeletableAttachment = MessageAttachment | Attachment;

function canDeleteAttachment(
  attachment: DeletableAttachment,
  currentUserId: string | null | undefined,
  messageAuthorId: string | undefined,
): boolean {
  if (!currentUserId) return false;
  if (messageAuthorId !== undefined && currentUserId === messageAuthorId) return true;
  const uploaderId = (attachment as MessageAttachment).uploaderId;
  return !!uploaderId && uploaderId === currentUserId;
}

/**
 * Two-step delete control (Delete → Confirm) with loading and error states.
 * Failures leave the attachment in place; success removes it from the UI
 * via `onDeleted` without touching any other message state.
 */
function AttachmentDeleteButton({
  attachment,
  onDeleted,
}: {
  attachment: DeletableAttachment;
  onDeleted: (attachmentId: string) => void;
}) {
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleDelete = async () => {
    if (!confirming) {
      setConfirming(true);
      return;
    }
    if (deleting) return;
    setDeleting(true);
    setError(null);
    const res = await deleteAttachment(attachment.id);
    setDeleting(false);
    if (res.ok) {
      onDeleted(attachment.id);
      return;
    }
    setError(res.error);
    setConfirming(false);
  };

  return (
    <span className="inline-flex shrink-0 flex-col items-end">
      <span className="inline-flex items-center gap-1">
        {confirming && <span className="text-[11px] font-medium text-red-700">Delete?</span>}
        <button
          type="button"
          onClick={() => void handleDelete()}
          disabled={deleting}
          aria-label={
            confirming
              ? `Confirm delete ${attachment.originalName}`
              : `Delete ${attachment.originalName}`
          }
          title={confirming ? 'Confirm delete' : 'Delete attachment'}
          className={`inline-flex h-8 w-8 items-center justify-center rounded-lg transition-colors focus-visible:outline-2 focus-visible:outline-[#1f44e4] disabled:opacity-50 ${
            confirming
              ? 'bg-red-600 text-white hover:bg-red-700'
              : 'text-[#47464b] hover:bg-[#f4f2fd] hover:text-red-700'
          }`}
        >
          {deleting ? (
            <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" />
          ) : (
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
              />
            </svg>
          )}
        </button>
        {confirming && !deleting && (
          <button
            type="button"
            onClick={() => {
              setConfirming(false);
              setError(null);
            }}
            aria-label="Cancel delete"
            className="mt-0.5 text-[11px] font-medium text-[#47464b] underline hover:text-[#1a1b22]"
          >
            Cancel
          </button>
        )}
      </span>
      {error && (
        <span role="alert" className="mt-0.5 max-w-[160px] text-right text-[11px] text-red-600">
          {error}
        </span>
      )}
    </span>
  );
}

function isImageMime(mimeType: string): boolean {
  const mime = mimeType.toLowerCase();
  return (
    mime === 'image/jpeg' ||
    mime === 'image/png' ||
    mime === 'image/gif' ||
    mime === 'image/webp' ||
    mime === 'image/svg+xml'
  );
}

function FileIcon({ mimeType, className }: { mimeType: string; className?: string }) {
  const mime = mimeType.toLowerCase();
  const cls = className ?? 'h-5 w-5';

  if (mime.includes('pdf')) {
    return (
      <svg className={cls} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z"
        />
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M9 9h1a2 2 0 012 2v0a2 2 0 01-2 2H9m0 0v3m4-5h1a2 2 0 012 2v0a2 2 0 01-2 2h-1m-4 0h3"
        />
      </svg>
    );
  }
  if (
    mime.includes('zip') ||
    mime.includes('compressed') ||
    mime.includes('gzip') ||
    mime.includes('tar')
  ) {
    return (
      <svg className={cls} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4"
        />
      </svg>
    );
  }
  if (
    mime.includes('word') ||
    mime.includes('document') ||
    mime.includes('text/plain') ||
    mime.includes('markdown')
  ) {
    return (
      <svg className={cls} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
        />
      </svg>
    );
  }
  return (
    <svg className={cls} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z"
      />
    </svg>
  );
}

function ImageAttachmentItem({
  attachment,
  showDelete,
  onDeleted,
}: {
  attachment: MessageAttachment | Attachment;
  showDelete: boolean;
  onDeleted: (attachmentId: string) => void;
}) {
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    const controller = new AbortController();

    setLoading(true);
    setError(null);

    fetchAttachmentDownloadUrl(attachment.id, undefined, controller.signal)
      .then((res) => {
        if (!active) return;
        if (res.ok) {
          setDownloadUrl(res.url);
        } else {
          setError(res.error);
        }
      })
      .catch(() => {
        if (!active) return;
        setError('Failed to load image preview');
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
      controller.abort();
    };
  }, [attachment.id]);

  if (loading) {
    return (
      <div
        className="flex h-36 w-48 items-center justify-center rounded-lg border border-[#e3e1ec] bg-[#f4f2fd]"
        aria-label={`Loading image preview for ${attachment.originalName}`}
      >
        <span className="h-4 w-4 animate-spin rounded-full border-2 border-[#c8c5cb] border-t-[#47464b]" />
      </div>
    );
  }

  if (error || !downloadUrl) {
    return (
      <FileAttachmentItem
        attachment={attachment}
        errorMessage={error || 'File unavailable'}
        showDelete={showDelete}
        onDeleted={onDeleted}
      />
    );
  }

  return (
    <div className="group/item relative max-w-sm overflow-hidden rounded-lg border border-[#e3e1ec] bg-[#f4f2fd] transition-shadow hover:shadow-xs">
      <a
        href={downloadUrl}
        target="_blank"
        rel="noopener noreferrer"
        download={attachment.originalName}
        className="block cursor-pointer rounded-lg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1f44e4]"
        aria-label={`View or download image ${attachment.originalName}`}
      >
        <img
          src={downloadUrl}
          alt={attachment.originalName}
          loading="lazy"
          className="max-h-64 w-auto object-contain transition-transform group-hover/item:scale-[1.01]"
        />
      </a>
      <div className="flex items-center justify-between border-t border-[#e3e1ec]/60 bg-white px-2.5 py-1 text-[11px] text-[#47464b]">
        <span className="truncate font-medium max-w-[180px]" title={attachment.originalName}>
          {attachment.originalName}
        </span>
        <span className="flex shrink-0 items-center gap-1">
          <span className="text-[#5f5e61] ml-2">{formatFileSize(attachment.size)}</span>
          {showDelete && <AttachmentDeleteButton attachment={attachment} onDeleted={onDeleted} />}
        </span>
      </div>
    </div>
  );
}

function FileAttachmentItem({
  attachment,
  errorMessage,
  showDelete,
  onDeleted,
}: {
  attachment: MessageAttachment | Attachment;
  errorMessage?: string;
  showDelete: boolean;
  onDeleted: (attachmentId: string) => void;
}) {
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState<string | null>(errorMessage ?? null);

  const handleDownload = async () => {
    if (downloading) return;
    setDownloading(true);
    setError(null);

    try {
      const res = await fetchAttachmentDownloadUrl(attachment.id);
      if (res.ok) {
        const a = document.createElement('a');
        a.href = res.url;
        a.download = attachment.originalName;
        a.target = '_blank';
        a.rel = 'noopener noreferrer';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
      } else {
        setError(res.error);
      }
    } catch {
      setError('Could not retrieve download link.');
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div className="flex max-w-sm items-center justify-between gap-3 rounded-lg border border-[#e3e1ec] bg-white p-2.5 shadow-xs transition-colors hover:border-[#c8c5cb]">
      <div className="flex min-w-0 items-center gap-2.5">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-[#f4f2fd] text-[#47464b]">
          <FileIcon mimeType={attachment.mimeType} />
        </div>
        <div className="min-w-0 flex-1">
          <p
            className="truncate text-[13px] font-medium text-[#1a1b22]"
            title={attachment.originalName}
          >
            {attachment.originalName}
          </p>
          <p className="text-[11px] text-[#5f5e61]">{formatFileSize(attachment.size)}</p>
          {error && <p className="text-[11px] text-red-600">{error}</p>}
        </div>
      </div>

      {showDelete && <AttachmentDeleteButton attachment={attachment} onDeleted={onDeleted} />}

      <button
        type="button"
        onClick={handleDownload}
        disabled={downloading}
        aria-label={`Download ${attachment.originalName}`}
        className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-[#47464b] transition-colors hover:bg-[#f4f2fd] hover:text-[#1a1b22] focus-visible:outline-2 focus-visible:outline-[#1f44e4] disabled:opacity-50"
      >
        {downloading ? (
          <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-[#c8c5cb] border-t-[#47464b]" />
        ) : (
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
            />
          </svg>
        )}
      </button>
    </div>
  );
}

export function AttachmentDisplay({
  attachments,
  className,
  currentUserId,
  messageAuthorId,
  onAttachmentDeleted,
}: AttachmentDisplayProps) {
  const [deletedIds, setDeletedIds] = useState<string[]>([]);

  const handleDeleted = (attachmentId: string) => {
    setDeletedIds((prev) => (prev.includes(attachmentId) ? prev : [...prev, attachmentId]));
    onAttachmentDeleted?.(attachmentId);
  };

  if (!attachments || attachments.length === 0) {
    return null;
  }

  const visible = attachments.filter((att) => !deletedIds.includes(att.id));
  if (visible.length === 0) {
    return null;
  }

  return (
    <div
      className={`mt-2 flex flex-wrap gap-2.5 ${className ?? ''}`}
      aria-label="Message attachments"
      data-testid="message-attachments"
    >
      {visible.map((att) => {
        const showDelete = canDeleteAttachment(att, currentUserId, messageAuthorId);
        if (isImageMime(att.mimeType)) {
          return (
            <ImageAttachmentItem
              key={att.id}
              attachment={att}
              showDelete={showDelete}
              onDeleted={handleDeleted}
            />
          );
        }
        return (
          <FileAttachmentItem
            key={att.id}
            attachment={att}
            showDelete={showDelete}
            onDeleted={handleDeleted}
          />
        );
      })}
    </div>
  );
}
