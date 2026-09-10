'use client';

import { useCallback, useRef, useState } from 'react';
import {
  ALLOWED_MIME_TYPES,
  MAX_ATTACHMENTS_PER_MESSAGE,
  formatFileSize,
  uploadSingleAttachmentDraft,
  validateAttachmentFile,
  type AttachmentDraft,
} from '../../lib/attachments';
import { useTyping, type TypingContainer } from '../../lib/use-typing';

export type SendMessageFunction = (
  body: string,
  attachments?: File[],
) => Promise<{ ok: boolean; error?: string | undefined; messageId?: string | undefined }>;

interface MessageComposerProps {
  placeholder?: string;
  send: SendMessageFunction;
  disabled?: boolean;
  loading?: boolean;
  container?: TypingContainer | null;
  currentUserId?: string | null;
}

export function MessageComposer({
  placeholder = 'Message #channel',
  send,
  disabled = false,
  loading = false,
  container,
  currentUserId,
}: MessageComposerProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const isSubmittingRef = useRef(false);
  const errorTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [body, setBody] = useState('');
  const [draftAttachments, setDraftAttachments] = useState<AttachmentDraft[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [size, setSize] = useState(1);
  const [error, setError] = useState<string | null>(null);
  const [showError, setShowError] = useState(false);
  const busy = submitting || loading;

  const { handleInputChange, handleStopTyping } = useTyping(container, { currentUserId });

  const adjustSize = useCallback(() => {
    const el = textareaRef.current;
    if (!el) return;
    const newSize = Math.max(1, Math.ceil(el.scrollHeight / 24));
    setSize((prev) => (prev !== newSize ? newSize : prev));
  }, []);

  const clearError = useCallback(() => {
    if (errorTimerRef.current) {
      clearTimeout(errorTimerRef.current);
      errorTimerRef.current = null;
    }
    setShowError(false);
    setError(null);
  }, []);

  const triggerError = useCallback((msg: string) => {
    if (errorTimerRef.current) {
      clearTimeout(errorTimerRef.current);
    }
    setError(msg);
    setShowError(true);
    errorTimerRef.current = setTimeout(() => {
      setShowError(false);
      errorTimerRef.current = null;
    }, 5000);
  }, []);

  const handleFilesSelected = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = e.target.files ? Array.from(e.target.files) : [];
      if (files.length === 0) return;

      // Reset file input so selecting the same file again triggers onChange
      e.target.value = '';

      if (draftAttachments.length + files.length > MAX_ATTACHMENTS_PER_MESSAGE) {
        triggerError(`You can only attach up to ${MAX_ATTACHMENTS_PER_MESSAGE} files per message.`);
        return;
      }

      const newDrafts: AttachmentDraft[] = [];
      for (const file of files) {
        const validation = validateAttachmentFile(file);
        if (!validation.ok) {
          triggerError(validation.error);
          return;
        }

        const draftId = `draft-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
        newDrafts.push({
          id: draftId,
          file,
          name: file.name,
          size: file.size,
          mimeType: file.type || 'application/octet-stream',
          status: 'idle',
          progress: 0,
        });
      }

      setDraftAttachments((prev) => [...prev, ...newDrafts]);
      clearError();
    },
    [draftAttachments.length, triggerError, clearError],
  );

  const handleRemoveAttachment = useCallback((id: string) => {
    setDraftAttachments((prev) => {
      const found = prev.find((item) => item.id === id);
      if (found?.abortController) {
        found.abortController.abort();
      }
      return prev.filter((item) => item.id !== id);
    });
  }, []);

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (isSubmittingRef.current || submitting || loading || disabled) {
        return;
      }

      const trimmed = body.trim();
      if (!trimmed && draftAttachments.length === 0) {
        triggerError('Message cannot be empty.');
        return;
      }

      // If message body is required when sending attachments, ensure trimmed or default caption
      // The current backend createMessage requires min(1) body.
      const messageBody = trimmed || (draftAttachments.length > 0 ? '(Attachment)' : '');
      if (!messageBody) {
        triggerError('Message cannot be empty.');
        return;
      }

      isSubmittingRef.current = true;
      setSubmitting(true);
      clearError();

      try {
        const rawFiles = draftAttachments.map((d) => d.file);
        const result =
          rawFiles.length > 0 ? await send(messageBody, rawFiles) : await send(messageBody);
        if (result.ok) {
          // If the send function didn't already process the uploads and returned a messageId,
          // upload the drafts now:
          if (result.messageId && draftAttachments.length > 0) {
            const messageId = result.messageId;
            let anyFailed = false;

            for (const draft of draftAttachments) {
              const abortController = new AbortController();
              draft.abortController = abortController;

              const uploadRes = await uploadSingleAttachmentDraft(
                messageId,
                draft,
                (progress) => {
                  setDraftAttachments((current) =>
                    current.map((d) => (d.id === draft.id ? { ...d, progress } : d)),
                  );
                },
                (status, errorMsg) => {
                  setDraftAttachments((current) =>
                    current.map((d) =>
                      d.id === draft.id ? { ...d, status, error: errorMsg ?? null } : d,
                    ),
                  );
                },
              );

              if (!uploadRes.ok) {
                anyFailed = true;
              }
            }

            if (anyFailed) {
              triggerError('Some attachments failed to upload.');
              return;
            }
          }

          // Successfully completed
          setBody('');
          setDraftAttachments([]);
          handleStopTyping();
          setSize(1);
          if (textareaRef.current) {
            textareaRef.current.style.height = 'auto';
          }
        } else {
          triggerError(result.error ?? 'Could not send message.');
        }
      } catch {
        triggerError('Could not send message.');
      } finally {
        isSubmittingRef.current = false;
        setSubmitting(false);
      }
    },
    [
      body,
      draftAttachments,
      submitting,
      loading,
      disabled,
      send,
      clearError,
      triggerError,
      handleStopTyping,
    ],
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        const trimmed = body.trim();
        const hasAttachments = draftAttachments.length > 0;
        if (
          (trimmed || hasAttachments) &&
          !isSubmittingRef.current &&
          !submitting &&
          !loading &&
          !disabled
        ) {
          const form = textareaRef.current?.closest('form');
          form?.requestSubmit();
        }
      }
    },
    [body, draftAttachments.length, submitting, loading, disabled],
  );

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      const nextValue = e.target.value;
      setBody(nextValue);
      handleInputChange(nextValue);
      if (showError) {
        clearError();
      }
      adjustSize();
    },
    [adjustSize, showError, clearError, handleInputChange],
  );

  const canSubmit = (body.trim().length > 0 || draftAttachments.length > 0) && !disabled && !busy;

  return (
    <div className="flex flex-col">
      <form
        onSubmit={handleSubmit}
        className="rounded-xl border border-stone-200 bg-white transition-colors hover:border-stone-300 focus-within:border-stone-400 focus-within:shadow-xs"
      >
        {/* Attachment preview strip */}
        {draftAttachments.length > 0 && (
          <div
            className="flex flex-wrap gap-2 border-b border-stone-100 px-3 py-2"
            aria-label="Attached files"
            data-testid="attachments-preview-strip"
          >
            {draftAttachments.map((draft) => (
              <div
                key={draft.id}
                className="group relative flex items-center gap-1.5 rounded-lg border border-stone-200 bg-stone-50 px-2.5 py-1 text-[12px] text-stone-800 transition-colors"
              >
                <svg
                  className="h-3.5 w-3.5 shrink-0 text-stone-400"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  aria-hidden="true"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13"
                  />
                </svg>
                <span className="max-w-[140px] truncate font-medium" title={draft.name}>
                  {draft.name}
                </span>
                <span className="text-[11px] text-stone-400">({formatFileSize(draft.size)})</span>

                {draft.status === 'uploading' && (
                  <span className="text-[10px] text-stone-500">{draft.progress}%</span>
                )}
                {draft.status === 'failed' && (
                  <span className="text-[10px] text-red-600">Failed</span>
                )}

                <button
                  type="button"
                  onClick={() => handleRemoveAttachment(draft.id)}
                  disabled={busy}
                  className="ml-1 rounded text-stone-400 hover:text-stone-700 disabled:opacity-40"
                  aria-label={`Remove attachment ${draft.name}`}
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        )}

        <div className="px-3 pt-3 pb-1.5">
          <textarea
            ref={textareaRef}
            value={body}
            onChange={handleChange}
            onKeyDown={handleKeyDown}
            rows={size}
            placeholder={placeholder}
            disabled={disabled || busy}
            className={`w-full resize-none overflow-hidden bg-transparent text-[14px] leading-relaxed text-stone-900 placeholder:text-stone-400 focus:outline-none ${
              busy ? 'pointer-events-none opacity-50' : ''
            }`}
            style={{ minHeight: '36px', height: `${Math.max(36, size * 24)}px` }}
          />
        </div>

        <div className="flex items-center justify-between border-t border-stone-100 px-3 py-2">
          <div className="flex items-center gap-2">
            {/* Hidden native file input */}
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept={Array.from(ALLOWED_MIME_TYPES).join(',')}
              onChange={handleFilesSelected}
              disabled={disabled || busy || draftAttachments.length >= MAX_ATTACHMENTS_PER_MESSAGE}
              className="hidden"
              data-testid="file-upload-input"
              aria-label="Upload files"
            />

            {/* Paperclip attachment button */}
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={disabled || busy || draftAttachments.length >= MAX_ATTACHMENTS_PER_MESSAGE}
              aria-label="Attach file"
              title={
                draftAttachments.length >= MAX_ATTACHMENTS_PER_MESSAGE
                  ? `Maximum ${MAX_ATTACHMENTS_PER_MESSAGE} attachments allowed`
                  : 'Attach files (up to 5 files, 25MB each)'
              }
              className="inline-flex h-7 w-7 items-center justify-center rounded-lg text-stone-400 transition-colors hover:bg-stone-100 hover:text-stone-700 focus:outline-none focus:ring-1 focus:ring-stone-400 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <svg
                className="h-4 w-4"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                aria-hidden="true"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13"
                />
              </svg>
            </button>

            <p className="flex select-none items-center gap-1.5 text-[11px] text-stone-400">
              <span>Enter to send</span>
              <span aria-hidden="true">·</span>
              <span>Shift+Enter for new line</span>
            </p>
          </div>

          <button
            type="submit"
            disabled={!canSubmit}
            className={`inline-flex items-center justify-center rounded-lg px-3 py-1.5 text-[12px] font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
              canSubmit
                ? 'bg-stone-900 text-white shadow-xs hover:bg-zinc-800'
                : 'bg-stone-100 text-stone-400'
            }`}
          >
            {submitting ? (
              <span className="flex items-center gap-1.5">
                <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-current border-t-transparent" />
                Sending…
              </span>
            ) : (
              'Send'
            )}
          </button>
        </div>

        {showError && error && (
          <div
            role="alert"
            className="flex items-center justify-between border-t border-red-100 bg-red-50 px-3 py-1.5 text-[12px] text-red-700"
          >
            <span>{error}</span>
            <button
              type="button"
              onClick={clearError}
              className="ml-2 rounded px-1 text-stone-400 hover:text-stone-600"
              aria-label="Dismiss error"
            >
              ×
            </button>
          </div>
        )}
      </form>
    </div>
  );
}
