'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ALLOWED_MIME_TYPES,
  MAX_ATTACHMENTS_PER_MESSAGE,
  formatFileSize,
  uploadSingleAttachmentDraft,
  validateAttachmentFile,
  type AttachmentDraft,
} from '../../lib/attachments';
import { useTyping, type TypingContainer } from '../../lib/use-typing';
import {
  filterMentionMembers,
  findMentionQuery,
  insertMention,
  type MentionMember,
  type MentionSource,
} from '../../lib/mentions';
import { AttachmentIcon, SendIcon } from './icons';
import { UserAvatar } from './UserAvatar';
import { Bold, Italic, Code, List, Link2 } from 'lucide-react';

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
  /**
   * Member source for @ mention autocomplete. Omitted (undefined) disables
   * suggestions entirely. `{ status: 'ready', members }` scopes suggestions
   * to the current conversation — never a global directory.
   */
  mentionSource?: MentionSource;
  /** Retries the member load backing mention suggestions. */
  onRetryMentionMembers?: () => void;
}

export function MessageComposer({
  placeholder = 'Message #channel',
  send,
  disabled = false,
  loading = false,
  container,
  currentUserId,
  mentionSource,
  onRetryMentionMembers,
}: MessageComposerProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const isSubmittingRef = useRef(false);
  const [body, setBody] = useState('');
  const [draftAttachments, setDraftAttachments] = useState<AttachmentDraft[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [size, setSize] = useState(1);
  const [error, setError] = useState<string | null>(null);
  const [showError, setShowError] = useState(false);
  const busy = submitting || loading;

  const { handleInputChange, handleStopTyping } = useTyping(container, { currentUserId });

  // @ mention autocomplete state. `mention` tracks the live query; the
  // candidate list derives from the caller-provided member source.
  const [mention, setMention] = useState<{ atIndex: number; query: string } | null>(null);
  const [mentionActive, setMentionActive] = useState(0);
  const mentionOptionRefs = useRef(new Map<number, HTMLDivElement>());

  const mentionCandidates = useMemo(() => {
    if (!mention || !mentionSource || mentionSource.status !== 'ready') return [];
    return filterMentionMembers(mentionSource.members, mention.query);
  }, [mention, mentionSource]);

  const refreshMention = useCallback(
    (value: string, caret: number | null) => {
      if (caret === null || mentionSource === undefined) {
        setMention(null);
        return;
      }
      setMention(findMentionQuery(value, caret));
      setMentionActive(0);
    },
    [mentionSource],
  );

  const closeMention = useCallback(() => {
    setMention(null);
    setMentionActive(0);
  }, []);

  // Mention context never survives a conversation switch.
  const mentionContainerKey = `${container?.channelId ?? ''}:${container?.conversationId ?? ''}`;
  useEffect(() => {
    closeMention();
  }, [mentionContainerKey, closeMention]);

  useEffect(() => {
    // jsdom (tests) has no scrollIntoView; browsers always do.
    mentionOptionRefs.current.get(mentionActive)?.scrollIntoView?.({ block: 'nearest' });
  }, [mentionActive, mentionCandidates.length]);

  const adjustSize = useCallback(() => {
    const el = textareaRef.current;
    if (!el) return;
    const newSize = Math.max(1, Math.ceil(el.scrollHeight / 24));
    setSize((prev) => (prev !== newSize ? newSize : prev));
  }, []);

  const selectMention = useCallback(
    (member: MentionMember) => {
      const el = textareaRef.current;
      if (!el) return;
      const caret = el.selectionStart ?? body.length;
      const found = findMentionQuery(body, caret);
      if (!found || body[found.atIndex] !== '@') {
        closeMention();
        return;
      }
      const next = insertMention(body, caret, found.atIndex, member.name);
      setBody(next.text);
      handleInputChange(next.text);
      adjustSize();
      closeMention();
      requestAnimationFrame(() => {
        el.focus();
        el.setSelectionRange(next.caret, next.caret);
      });
    },
    [body, adjustSize, closeMention, handleInputChange],
  );

  const clearError = useCallback(() => {
    setShowError(false);
    setError(null);
  }, []);

  const triggerError = useCallback((msg: string) => {
    setError(msg);
    setShowError(true);
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
      closeMention();

      try {
        const rawFiles = draftAttachments.map((d) => d.file);
        const result =
          rawFiles.length > 0 ? await send(messageBody, rawFiles) : await send(messageBody);
        if (result.ok) {
          // Stale-send guard (mid-send channel/conversation switch): the send
          // hooks resolve { ok: true } WITHOUT a messageId when the context
          // changed mid-flight. The message may exist elsewhere, but without
          // an id there is nothing to attach uploads to — so never upload,
          // never clear, and say so instead of reporting success.
          if (!result.messageId && draftAttachments.length > 0) {
            triggerError(
              'Conversation changed during send. Your draft was kept — attachments were not uploaded.',
            );
            return;
          }
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
      closeMention,
    ],
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (mention) {
        if ((e.key === 'ArrowDown' || e.key === 'ArrowUp') && mentionCandidates.length > 0) {
          e.preventDefault();
          const delta = e.key === 'ArrowDown' ? 1 : -1;
          setMentionActive(
            (index) => (index + delta + mentionCandidates.length) % mentionCandidates.length,
          );
          return;
        }
        if (e.key === 'Enter' && !e.shiftKey && mentionCandidates.length > 0) {
          e.preventDefault();
          const candidate = mentionCandidates[mentionActive] ?? mentionCandidates[0];
          if (candidate) {
            selectMention(candidate);
          }
          return;
        }
        if (e.key === 'Escape') {
          e.preventDefault();
          e.nativeEvent.stopPropagation();
          closeMention();
          return;
        }
        if (e.key === 'Tab') {
          closeMention();
          return;
        }
      }
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
    [
      body,
      draftAttachments.length,
      submitting,
      loading,
      disabled,
      mention,
      mentionCandidates,
      mentionActive,
      selectMention,
      closeMention,
    ],
  );

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      const nextValue = e.target.value;
      setBody(nextValue);
      handleInputChange(nextValue);
      refreshMention(nextValue, e.target.selectionStart);
      if (showError) {
        clearError();
      }
      adjustSize();
    },
    [adjustSize, showError, clearError, handleInputChange, refreshMention],
  );

  const handleKeyUp = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      // Caret moves without text changes (arrows, clicks are handled
      // separately). Skip keys the keydown handler already resolved so a
      // dismissed popup never reopens from its own keyup.
      if (['ArrowUp', 'ArrowDown', 'Enter', 'Escape', 'Tab'].includes(e.key)) {
        return;
      }
      const el = textareaRef.current;
      refreshMention(el?.value ?? body, el?.selectionStart ?? null);
    },
    [body, refreshMention],
  );

  const handleBlur = useCallback(() => {
    // Suggestion clicks use onMouseDown with preventDefault, so the
    // textarea keeps focus through selection; any real blur dismisses.
    closeMention();
  }, [closeMention]);

  const wrapSelection = useCallback((before: string, after: string = before) => {
    const el = textareaRef.current;
    if (!el) return;
    const start = el.selectionStart;
    const end = el.selectionEnd;
    const selected = body.substring(start, end);
    const replacement = `${before}${selected || 'text'}${after}`;
    const newBody = body.substring(0, start) + replacement + body.substring(end);
    setBody(newBody);
    setTimeout(() => {
      el.focus();
      el.setSelectionRange(start + before.length, start + before.length + (selected.length || 4));
    }, 10);
  }, [body]);

  const canSubmit = (body.trim().length > 0 || draftAttachments.length > 0) && !disabled && !busy;

  return (
    <div className="relative flex flex-col">
      {mention && (
        <div
          role="listbox"
          id="mention-suggestions"
          aria-label="Mention suggestions"
          className="absolute inset-x-0 bottom-full z-20 mb-2 max-h-56 overflow-y-auto rounded-[10px] border border-[#E4E2DF] bg-white p-1.5 shadow-[0_12px_32px_rgba(20,24,32,0.12)]"
        >
          {mentionSource?.status === 'loading' || mentionSource === undefined ? (
            <div role="status" className="px-2.5 py-2 text-[13px] text-[#737782]">
              Loading members…
            </div>
          ) : mentionSource.status === 'error' ? (
            <div className="px-2.5 py-2" role="alert">
              <p className="text-[13px] text-red-700">{mentionSource.message}</p>
              {onRetryMentionMembers ? (
                <button
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={onRetryMentionMembers}
                  className="mt-1 text-[13px] font-medium text-[#171A21] underline decoration-[#E4E2DF] underline-offset-4 hover:decoration-[#171A21]"
                >
                  Try again
                </button>
              ) : null}
            </div>
          ) : mentionCandidates.length === 0 ? (
            <div className="px-2.5 py-2 text-[13px] text-[#737782]">No members found</div>
          ) : (
            mentionCandidates.map((member, index) => (
              <div
                key={member.id}
                role="option"
                id={`mention-option-${member.id}`}
                aria-selected={index === mentionActive}
                onMouseDown={(e) => {
                  e.preventDefault();
                  selectMention(member);
                }}
                ref={(node) => {
                  if (node) {
                    mentionOptionRefs.current.set(index, node);
                  } else {
                    mentionOptionRefs.current.delete(index);
                  }
                }}
                className={`flex cursor-pointer items-center gap-2.5 rounded-[6px] px-2.5 py-1.5 transition-colors ${
                  index === mentionActive ? 'bg-[#EEF2FF] text-[#3157D5]' : 'hover:bg-[#F1F0EE]'
                }`}
              >
                <UserAvatar name={member.name} image={member.image ?? null} size="sm" />
                <span className="min-w-0 flex-1">
                  <span
                    className="block truncate text-[13px] font-medium text-[#171A21]"
                    title={member.name}
                  >
                    {member.name}
                  </span>
                  {member.email ? (
                    <span
                      className="block truncate text-[12px] text-[#737782]"
                      title={member.email}
                    >
                      {member.email}
                    </span>
                  ) : null}
                </span>
              </div>
            ))
          )}
        </div>
      )}
      <form
        onSubmit={handleSubmit}
        className="overflow-hidden rounded-[12px] border border-[#E4E2DF] bg-white shadow-2xs transition-all focus-within:border-[#3157D5] focus-within:ring-1 focus-within:ring-[#EEF2FF]"
      >
        {/* Attachment preview strip */}
        {draftAttachments.length > 0 && (
          <div
            className="flex flex-wrap gap-2 border-b border-[#E4E2DF] px-3 py-2"
            aria-label="Attached files"
            data-testid="attachments-preview-strip"
          >
            {draftAttachments.map((draft) => (
              <div
                key={draft.id}
                className="group relative flex items-center gap-1.5 rounded-[8px] border border-[#E4E2DF] bg-[#F6F5F3] px-2.5 py-1 text-[12px] text-[#171A21] transition-colors"
              >
                <AttachmentIcon className="h-3.5 w-3.5 shrink-0 text-[#737782]" />
                <span className="max-w-[140px] truncate font-medium" title={draft.name}>
                  {draft.name}
                </span>
                <span className="text-[11px] text-[#737782]">({formatFileSize(draft.size)})</span>

                {draft.status === 'uploading' && (
                  <span className="text-[11px] tabular-nums text-[#4F5360]">{draft.progress}%</span>
                )}
                {draft.status === 'failed' && (
                  <span className="text-[11px] text-red-600" title={draft.error ?? 'Upload failed'}>
                    Failed
                  </span>
                )}

                <button
                  type="button"
                  onClick={() => handleRemoveAttachment(draft.id)}
                  disabled={busy}
                  className="ml-1 rounded text-[#737782] transition-colors hover:text-[#171A21] focus-visible:outline-2 focus-visible:outline-[#3157D5] disabled:opacity-40"
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
            onKeyUp={handleKeyUp}
            onBlur={handleBlur}
            onClick={(e) => refreshMention(body, e.currentTarget.selectionStart)}
            aria-expanded={mention !== null}
            aria-controls={mention ? 'mention-suggestions' : undefined}
            aria-activedescendant={
              mention && mentionCandidates.length > 0
                ? `mention-option-${mentionCandidates[mentionActive]?.id ?? ''}`
                : undefined
            }
            rows={size}
            placeholder={placeholder}
            aria-label={placeholder}
            disabled={disabled || busy}
            className={`w-full resize-none overflow-hidden bg-transparent text-[14px] leading-relaxed text-[#171A21] placeholder:text-[#737782] focus:outline-none ${
              busy ? 'pointer-events-none opacity-50' : ''
            }`}
            style={{ minHeight: '36px', height: `${Math.max(36, size * 24)}px` }}
          />
        </div>

        <div className="flex items-center justify-between border-t border-[#ECEAE7] bg-white px-3 py-1.5">
          <div className="flex items-center gap-1">
            {/* Formatting shortcuts */}
            <button
              type="button"
              onClick={() => wrapSelection('**')}
              className="p-1.5 rounded-[6px] text-[#737782] hover:bg-[#F1F0EE] hover:text-[#171A21] transition-colors"
              title="Bold (**)"
              aria-label="Bold text"
            >
              <Bold className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={() => wrapSelection('_')}
              className="p-1.5 rounded-[6px] text-[#737782] hover:bg-[#F1F0EE] hover:text-[#171A21] transition-colors"
              title="Italic (_)"
              aria-label="Italic text"
            >
              <Italic className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={() => wrapSelection('`')}
              className="p-1.5 rounded-[6px] text-[#737782] hover:bg-[#F1F0EE] hover:text-[#171A21] transition-colors"
              title="Code (`)"
              aria-label="Inline code"
            >
              <Code className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={() => wrapSelection('- ')}
              className="p-1.5 rounded-[6px] text-[#737782] hover:bg-[#F1F0EE] hover:text-[#171A21] transition-colors"
              title="List (-)"
              aria-label="Bulleted list"
            >
              <List className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={() => wrapSelection('[', '](url)')}
              className="p-1.5 rounded-[6px] text-[#737782] hover:bg-[#F1F0EE] hover:text-[#171A21] transition-colors"
              title="Link"
              aria-label="Insert link"
            >
              <Link2 className="w-3.5 h-3.5" />
            </button>

            <div className="w-[1px] h-3.5 bg-[#E4E2DF] mx-0.5" />

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
              className="p-1.5 rounded-[6px] text-[#737782] transition-colors hover:bg-[#F1F0EE] hover:text-[#171A21] focus-visible:outline-2 focus-visible:outline-[#3157D5] disabled:cursor-not-allowed disabled:opacity-40"
            >
              <AttachmentIcon className="h-3.5 w-3.5" />
            </button>

            <p className="hidden select-none items-center gap-1.5 text-[11px] text-[#737782] sm:flex ml-1.5">
              <span>Enter to send</span>
              <span aria-hidden="true">·</span>
              <span>Shift+Enter for new line</span>
            </p>
          </div>

          <button
            type="submit"
            disabled={!canSubmit}
            aria-label="Send message"
            title="Send message"
            className="px-3 py-1.5 rounded-[8px] text-[13px] font-medium flex items-center gap-1.5 transition-all active:scale-[0.98] bg-[#2E3440] text-white hover:bg-[#1E222A] shadow-2xs disabled:bg-[#ECEAE7] disabled:text-[#A5A8AE] disabled:cursor-not-allowed cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#3157D5]"
          >
            {submitting ? (
              <span
                aria-hidden="true"
                className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent"
              />
            ) : (
              <>
                <span>Send</span>
                <SendIcon className="h-3 w-3" />
              </>
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
              className="ml-2 rounded px-1 text-[#5f5e61] transition-colors hover:text-[#47464b] focus-visible:outline-2 focus-visible:outline-[#1f44e4]"
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
