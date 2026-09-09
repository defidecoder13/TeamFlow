'use client';

import { useCallback, useRef, useState } from 'react';

interface MessageComposerProps {
  placeholder?: string;
  send: (body: string) => Promise<{ ok: boolean; error?: string | undefined }>;
  disabled?: boolean;
  loading?: boolean;
}

export function MessageComposer({
  placeholder = 'Message #channel',
  send,
  disabled = false,
  loading = false,
}: MessageComposerProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const isSubmittingRef = useRef(false);
  const errorTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [body, setBody] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [size, setSize] = useState(1);
  const [error, setError] = useState<string | null>(null);
  const [showError, setShowError] = useState(false);
  const busy = submitting || loading;

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

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (isSubmittingRef.current || submitting || loading || disabled) {
        return;
      }

      const trimmed = body.trim();
      if (!trimmed) {
        triggerError('Message cannot be empty.');
        return;
      }

      isSubmittingRef.current = true;
      setSubmitting(true);
      clearError();

      try {
        const result = await send(trimmed);
        if (result.ok) {
          setBody('');
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
    [body, submitting, loading, disabled, send, clearError, triggerError],
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        const trimmed = body.trim();
        if (trimmed && !isSubmittingRef.current && !submitting && !loading && !disabled) {
          const form = textareaRef.current?.closest('form');
          form?.requestSubmit();
        }
      }
    },
    [body, submitting, loading, disabled],
  );

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      setBody(e.target.value);
      if (showError) {
        clearError();
      }
      adjustSize();
    },
    [adjustSize, showError, clearError],
  );

  return (
    <div className="flex flex-col">
      <form
        onSubmit={handleSubmit}
        className="rounded-xl border border-stone-200 bg-white transition-colors hover:border-stone-300 focus-within:border-stone-400 focus-within:shadow-xs"
      >
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
          <p className="flex select-none items-center gap-1.5 text-[11px] text-stone-400">
            <span>Enter to send</span>
            <span aria-hidden="true">·</span>
            <span>Shift+Enter for new line</span>
          </p>
          <button
            type="submit"
            disabled={disabled || busy || !body.trim()}
            className={`inline-flex items-center justify-center rounded-lg px-3 py-1.5 text-[12px] font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
              body.trim()
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
