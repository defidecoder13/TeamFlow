'use client';

import { useEffect, useState } from 'react';
import { fetchAttachmentDownloadUrl, formatFileSize, type Attachment } from '../../lib/attachments';
import type { MessageAttachment } from '../../lib/messages';

interface AttachmentDisplayProps {
  attachments?: (MessageAttachment | Attachment)[] | null;
  className?: string;
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

function ImageAttachmentItem({ attachment }: { attachment: MessageAttachment | Attachment }) {
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
        className="flex h-36 w-48 items-center justify-center rounded-lg border border-stone-200 bg-stone-50"
        aria-label={`Loading image preview for ${attachment.originalName}`}
      >
        <span className="h-4 w-4 animate-spin rounded-full border-2 border-stone-300 border-t-stone-600" />
      </div>
    );
  }

  if (error || !downloadUrl) {
    return (
      <FileAttachmentItem attachment={attachment} errorMessage={error || 'File unavailable'} />
    );
  }

  return (
    <div className="group/item relative max-w-sm overflow-hidden rounded-lg border border-stone-200 bg-stone-50 transition-shadow hover:shadow-xs">
      <a
        href={downloadUrl}
        target="_blank"
        rel="noopener noreferrer"
        download={attachment.originalName}
        className="block cursor-pointer focus:outline-none focus:ring-2 focus:ring-stone-400 focus:ring-offset-1"
        aria-label={`View or download image ${attachment.originalName}`}
      >
        <img
          src={downloadUrl}
          alt={attachment.originalName}
          loading="lazy"
          className="max-h-64 w-auto object-contain transition-transform group-hover/item:scale-[1.01]"
        />
      </a>
      <div className="flex items-center justify-between border-t border-stone-100 bg-white px-2.5 py-1 text-[11px] text-stone-600">
        <span className="truncate font-medium max-w-[180px]" title={attachment.originalName}>
          {attachment.originalName}
        </span>
        <span className="shrink-0 text-stone-400 ml-2">{formatFileSize(attachment.size)}</span>
      </div>
    </div>
  );
}

function FileAttachmentItem({
  attachment,
  errorMessage,
}: {
  attachment: MessageAttachment | Attachment;
  errorMessage?: string;
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
    <div className="flex max-w-sm items-center justify-between gap-3 rounded-lg border border-stone-200 bg-white p-2.5 shadow-xs transition-colors hover:border-stone-300">
      <div className="flex min-w-0 items-center gap-2.5">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-stone-100 text-stone-600">
          <FileIcon mimeType={attachment.mimeType} />
        </div>
        <div className="min-w-0 flex-1">
          <p
            className="truncate text-[13px] font-medium text-stone-900"
            title={attachment.originalName}
          >
            {attachment.originalName}
          </p>
          <p className="text-[11px] text-stone-400">{formatFileSize(attachment.size)}</p>
          {error && <p className="text-[10px] text-red-600">{error}</p>}
        </div>
      </div>

      <button
        type="button"
        onClick={handleDownload}
        disabled={downloading}
        aria-label={`Download ${attachment.originalName}`}
        className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-stone-500 transition-colors hover:bg-stone-100 hover:text-stone-900 focus:outline-none focus:ring-1 focus:ring-stone-400 disabled:opacity-50"
      >
        {downloading ? (
          <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-stone-300 border-t-stone-600" />
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

export function AttachmentDisplay({ attachments, className }: AttachmentDisplayProps) {
  if (!attachments || attachments.length === 0) {
    return null;
  }

  return (
    <div
      className={`mt-2 flex flex-wrap gap-2.5 ${className ?? ''}`}
      aria-label="Message attachments"
      data-testid="message-attachments"
    >
      {attachments.map((att) => {
        if (isImageMime(att.mimeType)) {
          return <ImageAttachmentItem key={att.id} attachment={att} />;
        }
        return <FileAttachmentItem key={att.id} attachment={att} />;
      })}
    </div>
  );
}
