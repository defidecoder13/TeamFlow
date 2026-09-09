'use client';

import { useCallback, useRef, useState, useEffect } from 'react';
import type { Message } from '../../lib/messages';
import { UserAvatar } from './UserAvatar';
import { formatMessageTime } from './message-utils';

interface MessageEditorProps {
  message: Message;
  isCurrentUser: boolean;
  showTimestamp: boolean;
  previousMessage?: Message | null;
  onEdit?: (messageId: string) => void;
  editingBody: string;
  setEditingBody: (v: string) => void;
  cancelEdit: () => void;
  submitEdit: (body: string) => Promise<unknown>;
  deleteMessage?: (messageId: string) => Promise<{ ok: boolean; error?: string }>;
  submitting: boolean;
}

export function MessageEditor({
  message,
  isCurrentUser,
  showTimestamp,
  editingBody,
  setEditingBody,
  cancelEdit,
  submitEdit,
  submitting,
}: MessageEditorProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [size, setSize] = useState(1);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const showTimestampActual = showTimestamp;
  const authorName = message.author?.name ?? 'Unknown';
  const authorImage = message.author?.image;

  const adjustSize = useCallback(() => {
    const el = textareaRef.current;
    if (!el) return;
    const newSize = Math.max(1, Math.ceil(el.scrollHeight / 24));
    setSize((prev) => (prev !== newSize ? newSize : prev));
  }, []);

  useEffect(() => {
    adjustSize();
  }, [adjustSize, editingBody]);

  useEffect(() => {
    const el = textareaRef.current;
    if (el) {
      el.focus();
      const len = el.value.length;
      el.setSelectionRange(len, len);
    }
  }, []);

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      const trimmed = editingBody.trim();
      if (!trimmed || submitting) return;
      setSubmitError(null);
      try {
        const res = await submitEdit(trimmed);
        if (res && typeof res === 'object' && 'ok' in res && !(res as { ok: boolean }).ok) {
          setSubmitError((res as { error?: string }).error ?? 'Could not save message.');
        }
      } catch (err: unknown) {
        setSubmitError(err instanceof Error ? err.message : 'Could not save message.');
      }
    },
    [editingBody, submitting, submitEdit],
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        cancelEdit();
      } else if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        const form = e.currentTarget.closest('form');
        form?.requestSubmit();
      }
    },
    [cancelEdit],
  );

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      setEditingBody(e.target.value);
      if (submitError) {
        setSubmitError(null);
      }
    },
    [setEditingBody, submitError],
  );

  if (message.body === null) {
    return null;
  }

  return (
    <div className="group relative flex items-start gap-3 bg-stone-50/70 px-4 py-2 sm:px-6">
      <div className="shrink-0 pt-0.5">
        <UserAvatar name={authorName} image={authorImage} size="md" />
      </div>

      <div className="min-w-0 flex-1">
        <div className="mb-1 flex items-baseline gap-2 leading-none">
          <span className="truncate text-[13px] font-semibold text-stone-900">{authorName}</span>
          {showTimestampActual && (
            <span className="shrink-0 text-[11px] font-normal text-stone-400">
              {formatMessageTime(message.createdAt)}
            </span>
          )}
          {isCurrentUser && (
            <span className="shrink-0 rounded bg-stone-100 px-1.5 py-0.5 text-[10px] font-medium text-stone-500">
              You
            </span>
          )}
        </div>

        <form onSubmit={handleSubmit} className="mt-1 flex flex-col gap-2">
          <textarea
            ref={textareaRef}
            value={editingBody}
            onChange={handleChange}
            onKeyDown={handleKeyDown}
            rows={size}
            placeholder="Edit message…"
            autoFocus
            aria-label="Edit message"
            className="w-full resize-none rounded-lg border border-stone-300 bg-white px-3 py-2 text-[14px] leading-relaxed text-stone-900 placeholder:text-stone-400 shadow-xs focus:border-stone-500 focus:outline-none focus:ring-1 focus:ring-stone-500"
            style={{ minHeight: '36px', height: `${Math.max(36, size * 24)}px` }}
          />
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={cancelEdit}
              disabled={submitting}
              className="rounded-md border border-stone-200 bg-white px-2.5 py-1 text-[12px] font-medium text-stone-600 shadow-xs transition-colors hover:bg-stone-50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Cancel
            </button>
            {submitError ? (
              <span role="alert" className="flex-1 text-[12px] text-red-600">
                {submitError}
              </span>
            ) : (
              <span className="hidden text-[11px] text-stone-400 sm:inline">
                escape to cancel · enter to save · shift+enter for new line
              </span>
            )}
            <button
              type="submit"
              disabled={submitting || !editingBody.trim()}
              className="ml-auto rounded-md bg-stone-900 px-3 py-1 text-[12px] font-medium text-white shadow-xs transition-colors hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {submitting ? 'Saving…' : 'Save'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
