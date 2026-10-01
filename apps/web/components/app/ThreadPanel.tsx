'use client';

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { Message } from '../../lib/messages';
import type { MentionMember, MentionSource } from '../../lib/mentions';
import { useThreadMessages } from '../../lib/use-thread-messages';
import { useTyping, type TypingContainer } from '../../lib/use-typing';
import { scrollToMessage, useSeekMessage } from '../../lib/use-deep-link';
import { TypingIndicator } from './TypingIndicator';
import { CloseIcon } from './icons';
import { UserAvatar } from './UserAvatar';
import { formatMessageTime } from './message-utils';
import { MessageRow, MessageBody } from './MessageRow';
import { MessageEditor } from './MessageEditor';
import { MessageComposer } from './MessageComposer';
import { AttachmentDisplay } from './AttachmentDisplay';
import { DeleteMessageDialog } from './DeleteMessageDialog';
import { MessageReactions } from './MessageReactions';
import { MessageListSkeleton } from './MessageListSkeleton';

/**
 * Container-scoped typing display for one open thread. Keyed by thread id
 * at the call site so switching threads never retains the previous
 * thread's typing users (the backend contract has no thread identifier).
 */
function ThreadTypingIndicator({
  container,
  userId,
  members,
}: {
  container: TypingContainer | null;
  userId: string | null;
  members?: Array<{ id: string; name: string }>;
}) {
  const { typingUserIds } = useTyping(container, { currentUserId: userId });
  return <TypingIndicator typingUserIds={typingUserIds} members={members} className="mb-1 px-1" />;
}

interface ThreadPanelProps {
  rootMessage: Message;
  userId: string | null;
  onClose: () => void;
  /** Search deep-link: highlight + scroll to this reply once loaded. */
  highlightedReplyId?: string | null;
  /** Known members for @ mention highlighting + reply-composer autocomplete. */
  mentionMembers?: MentionMember[];
  mentionSource?: MentionSource;
  onRetryMentionMembers?: () => void;
  /** Members for resolving typing names. Same source as the parent view. */
  typingMembers?: Array<{ id: string; name: string }>;
}

export function ThreadPanel({
  rootMessage,
  userId,
  onClose,
  highlightedReplyId,
  mentionMembers,
  mentionSource,
  onRetryMentionMembers,
  typingMembers,
}: ThreadPanelProps) {
  // Thread typing is container-scoped: the backend typing contract carries
  // only channelId/conversationId (no thread id), so the panel reflects the
  // same conversation typing as its parent view — never inferred per-thread
  // state. Replies composed here emit typing into that container.
  const threadContainer: TypingContainer | null = useMemo(
    () =>
      rootMessage.channelId
        ? { channelId: rootMessage.channelId }
        : rootMessage.directMessageConversationId
          ? { conversationId: rootMessage.directMessageConversationId }
          : null,
    [rootMessage.channelId, rootMessage.directMessageConversationId],
  );
  const panelRef = useRef<HTMLDivElement>(null);
  const repliesScrollRef = useRef<HTMLDivElement>(null);
  const scrollPosBeforeLoadRef = useRef<{ scrollHeight: number; scrollTop: number } | null>(null);
  const prevRepliesCountRef = useRef<number>(0);

  const {
    state,
    isLoadingOlder,
    loadOlderError,
    retry,
    loadOlder,
    send,
    edit,
    remove,
    removeAttachment,
  } = useThreadMessages(rootMessage.id, rootMessage.channelId);

  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
  const [editingBody, setEditingBody] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const replies = state.status === 'ready' ? state.messages : [];
  const hasMore = state.status === 'ready' && state.hasMore;

  const isNearBottomRef = useRef(true);
  const [showJumpToBottom, setShowJumpToBottom] = useState(false);
  const isInitialMountRef = useRef(true);
  const prevRootIdRef = useRef(rootMessage.id);

  if (prevRootIdRef.current !== rootMessage.id) {
    prevRootIdRef.current = rootMessage.id;
    isInitialMountRef.current = true;
    scrollPosBeforeLoadRef.current = null;
  }

  // Scroll compensation when older replies are prepended
  const handleLoadOlder = useCallback(() => {
    const el = repliesScrollRef.current;
    if (el) {
      scrollPosBeforeLoadRef.current = {
        scrollHeight: el.scrollHeight,
        scrollTop: el.scrollTop,
      };
    }
    prevRepliesCountRef.current = replies.length;
    void loadOlder();
  }, [loadOlder, replies.length]);

  const handleScroll = useCallback(() => {
    const el = repliesScrollRef.current;
    if (!el) return;
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    const nearBottom = distanceFromBottom < 100;
    isNearBottomRef.current = nearBottom;
    setShowJumpToBottom(!nearBottom);
  }, []);

  const scrollToBottom = useCallback(() => {
    const el = repliesScrollRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
    setShowJumpToBottom(false);
  }, []);

  useLayoutEffect(() => {
    const el = repliesScrollRef.current;
    if (!el) return;

    if (scrollPosBeforeLoadRef.current) {
      const heightDelta = el.scrollHeight - scrollPosBeforeLoadRef.current.scrollHeight;
      el.scrollTop = scrollPosBeforeLoadRef.current.scrollTop + heightDelta;
      scrollPosBeforeLoadRef.current = null;
    } else if (isInitialMountRef.current) {
      el.scrollTop = el.scrollHeight;
      isInitialMountRef.current = false;
      setShowJumpToBottom(false);
    } else if (replies.length > prevRepliesCountRef.current) {
      if (isNearBottomRef.current) {
        el.scrollTop = el.scrollHeight;
        setShowJumpToBottom(false);
      } else {
        setShowJumpToBottom(true);
      }
    }
    prevRepliesCountRef.current = replies.length;
  }, [replies.length, rootMessage.id]);

  // Search deep link: page back through thread history until the linked
  // reply loads, then scroll it into view. Reply ids are unique to this
  // panel, so a document query cannot collide with the main message list
  // (roots only). Failures resolve to missing and leave the thread open.
  const replySeekStatus = useSeekMessage({
    active: state.status === 'ready',
    targetId: highlightedReplyId ?? null,
    messages: replies,
    hasMore,
    isLoadingOlder,
    loadOlderError,
    loadOlder,
  });
  useEffect(() => {
    if (replySeekStatus !== 'found' || !highlightedReplyId) {
      return;
    }
    const targetId = highlightedReplyId;
    requestAnimationFrame(() => {
      scrollToMessage(targetId);
    });
  }, [replySeekStatus, highlightedReplyId]);

  // On small screens the panel is a bottom sheet: move focus into it on
  // open so touch/keyboard users land in the thread. Desktop keeps the
  // side-panel behavior untouched (no focus steal). On unmount, return
  // focus to whatever opened the thread (usually the Reply button), like
  // Dialog does for modals.
  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    if (
      typeof window !== 'undefined' &&
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(max-width: 639px)').matches
    ) {
      panelRef.current?.focus({ preventScroll: true });
    }
    return () => {
      if (opener && document.contains(opener)) {
        opener.focus({ preventScroll: true });
      }
    };
  }, [rootMessage.id]);

  // Handle Escape key at panel level (cancel edit/delete first, otherwise close panel).
  // Yields to nested dialogs and pickers: if the event started inside one,
  // its own handler owns the keypress.
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        const target = e.target as HTMLElement | null;
        if (target?.closest?.('[role="dialog"], [role="toolbar"], [role="menu"]')) {
          return;
        }
        if (editingMessageId) {
          e.stopPropagation();
          setEditingMessageId(null);
          setEditingBody(null);
          return;
        }
        if (confirmDeleteId) {
          e.stopPropagation();
          setConfirmDeleteId(null);
          setDeleteError(null);
          return;
        }
        e.stopPropagation();
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [editingMessageId, confirmDeleteId, onClose]);

  // Reply Edit Handlers
  const handleEdit = useCallback(
    (messageId: string) => {
      const target = replies.find((m) => m.id === messageId);
      if (!target || target.authorId !== userId || target.body === null) return;
      setEditingMessageId(messageId);
      setEditingBody(target.body);
    },
    [replies, userId],
  );

  const handleCancelEdit = useCallback(() => {
    setEditingMessageId(null);
    setEditingBody(null);
  }, []);

  const handleEditSubmit = useCallback(
    async (newBody?: string): Promise<{ ok: boolean; error?: string }> => {
      const bodyToSubmit = newBody ?? editingBody;
      if (!editingMessageId || !bodyToSubmit) {
        return { ok: false, error: 'No message to edit.' };
      }
      setSubmitting(true);
      try {
        const result = await edit(editingMessageId, bodyToSubmit);
        if (result.ok) {
          setEditingMessageId(null);
          setEditingBody(null);
          return { ok: true };
        }
        return result;
      } finally {
        setSubmitting(false);
      }
    },
    [edit, editingMessageId, editingBody],
  );

  // Reply Delete Handlers
  const handleDeleteRequest = useCallback(
    (messageId: string) => {
      const target = replies.find((m) => m.id === messageId);
      if (!target || target.authorId !== userId) return;
      setConfirmDeleteId(messageId);
      setDeleteError(null);
    },
    [replies, userId],
  );

  const handleConfirmDelete = useCallback(async () => {
    if (!confirmDeleteId) return;
    setSubmitting(true);
    setDeleteError(null);
    try {
      const result = await remove(confirmDeleteId);
      if (!result.ok) {
        setDeleteError(result.error ?? 'Could not delete reply.');
      } else {
        setConfirmDeleteId(null);
        setDeleteError(null);
      }
    } finally {
      setSubmitting(false);
    }
  }, [confirmDeleteId, remove]);

  const handleCancelDelete = useCallback(() => {
    setConfirmDeleteId(null);
    setDeleteError(null);
  }, []);

  const rootAuthorName = rootMessage.author?.name ?? 'Unknown';

  return (
    <>
      {/* Mobile backdrop: the sheet overlays the feed below `sm`. Keyboard
          users close via Escape (handled at panel level); this layer is
          pointer-only so it never duplicates the header close action. */}
      <div
        role="presentation"
        onClick={onClose}
        className="fixed inset-0 z-30 bg-[#1a1b22]/40 backdrop-blur-[2px] sm:hidden"
      />
      <aside
        ref={panelRef}
        role="region"
        aria-label="Thread panel"
        tabIndex={-1}
        className="fixed inset-x-0 bottom-0 top-auto z-40 flex max-h-[85dvh] w-full flex-col rounded-t-2xl border-t border-[#E4E2DF] bg-white transition-[opacity,translate] duration-200 ease-out-expo starting:translate-y-4 starting:opacity-0 sm:static sm:z-auto sm:h-full sm:max-h-none sm:w-[420px] sm:shrink-0 sm:rounded-none sm:border-l sm:border-t-0 sm:starting:translate-x-4 lg:w-[440px]"
      >
        {/* Thread Header */}
        <header className="flex h-14 items-center justify-between border-b border-[#E4E2DF] px-4 bg-white">
          <div className="min-w-0">
            <h2 className="text-[15px] font-semibold text-[#171A21]">Thread</h2>
            <p className="truncate text-[11px] text-[#737782]">with {rootAuthorName}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close thread"
            title="Close thread"
            className="touch-hit flex h-7 w-7 items-center justify-center rounded-[6px] text-[#737782] transition-colors hover:bg-[#F1F0EE] hover:text-[#171A21] focus-visible:outline-2 focus-visible:outline-[#3157D5]"
          >
            <CloseIcon className="h-4 w-4" />
          </button>
        </header>

        {/* Pinned Root Message */}
        <div className="border-b border-[#E4E2DF] bg-[#FAF9F8] p-4">
          {rootMessage.body === null ? (
            <div>
              <div className="text-[13px] italic text-[#5f5e61]">Message deleted</div>
              <MessageReactions messageId={rootMessage.id} currentUserId={userId} isDeleted />
            </div>
          ) : (
            <div className="flex items-start gap-3">
              <div className="shrink-0 pt-0.5">
                <UserAvatar name={rootAuthorName} image={rootMessage.author?.image} size="md" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="mb-1 flex items-baseline gap-2 leading-none">
                  <span className="truncate text-[13px] font-semibold text-[#1a1b22]">
                    {rootAuthorName}
                  </span>
                  <span className="shrink-0 text-[11px] font-normal text-[#5f5e61]">
                    {formatMessageTime(rootMessage.createdAt)}
                  </span>
                </div>
                <p className="break-words text-[14px] leading-relaxed text-[#1a1b22] whitespace-pre-wrap">
                  <MessageBody body={rootMessage.body} mentionMembers={mentionMembers} />
                </p>
                {rootMessage.attachments && rootMessage.attachments.length > 0 && (
                  <AttachmentDisplay
                    attachments={rootMessage.attachments}
                    currentUserId={null}
                    messageAuthorId={rootMessage.authorId}
                  />
                )}
                <MessageReactions
                  messageId={rootMessage.id}
                  currentUserId={userId}
                  showAddWhenEmpty
                />
              </div>
            </div>
          )}
        </div>

        {/* Scrollable Replies Container */}
        <div className="relative flex min-h-0 flex-1 flex-col">
          <div
            ref={repliesScrollRef}
            onScroll={handleScroll}
            className="flex min-h-0 flex-1 flex-col overflow-y-auto py-2"
            data-testid="thread-replies-scroll"
          >
            {state.status === 'loading' && (
              <MessageListSkeleton rows={3} label="Loading replies" className="flex-1" />
            )}

            {state.status === 'error' && (
              <div className="m-4 rounded-lg border border-red-200 bg-red-50 p-3 text-center">
                <p className="text-[13px] text-red-700">{state.message}</p>
                <button
                  type="button"
                  onClick={retry}
                  className="mt-2 text-xs font-semibold text-red-800 underline hover:text-red-950"
                >
                  Retry
                </button>
              </div>
            )}

            {state.status === 'unauthenticated' && (
              <div className="flex flex-1 flex-col items-center justify-center gap-2 p-8 text-center">
                <p className="text-[14px] font-medium text-[#47464b]">Session expired</p>
                <p className="text-[12px] text-[#47464b]">
                  Sign in again to keep following this thread.
                </p>
                <a
                  href="/sign-in"
                  className="mt-1 rounded-[8px] bg-[#2E3440] px-4 py-2 text-[13px] font-medium text-white transition-colors hover:bg-[#1E222A]"
                >
                  Go to sign in
                </a>
                <button
                  type="button"
                  onClick={onClose}
                  className="mt-1 text-[13px] font-medium text-[#1a1b22] underline decoration-[#c8c5cb] underline-offset-4 transition-colors hover:decoration-[#1a1b22]"
                >
                  Close thread
                </button>
              </div>
            )}

            {state.status === 'notFound' && (
              <div className="flex flex-1 flex-col items-center justify-center gap-2 p-8 text-center">
                <p className="text-[14px] font-medium text-[#47464b]">Thread unavailable</p>
                <p className="text-[12px] text-[#47464b]">
                  This thread no longer exists or you no longer have access to it.
                </p>
                <button
                  type="button"
                  onClick={onClose}
                  className="mt-1 text-[13px] font-medium text-[#1a1b22] underline decoration-[#c8c5cb] underline-offset-4 transition-colors hover:decoration-[#1a1b22]"
                >
                  Close thread
                </button>
              </div>
            )}

            {state.status === 'ready' && (
              <>
                {(rootMessage.replyCount ?? replies.length) > 0 && (
                  <p className="px-4 pb-1 pt-3 text-[11px] font-semibold uppercase tracking-[0.06em] text-[#5f5e61]">
                    {rootMessage.replyCount ?? replies.length}{' '}
                    {(rootMessage.replyCount ?? replies.length) === 1 ? 'reply' : 'replies'}
                  </p>
                )}
                {/* Load Older Replies */}
                {hasMore && (
                  <div className="py-2 text-center">
                    <button
                      type="button"
                      onClick={handleLoadOlder}
                      disabled={isLoadingOlder}
                      className="rounded-md border border-[#e3e1ec] bg-white px-3 py-1 text-[12px] font-medium text-[#47464b] shadow-xs hover:bg-[#f4f2fd] disabled:opacity-50"
                    >
                      {isLoadingOlder ? 'Loading…' : 'Load older replies'}
                    </button>
                    {loadOlderError && (
                      <p className="mt-1 text-xs text-red-600">{loadOlderError}</p>
                    )}
                  </div>
                )}

                {!hasMore && replies.length > 0 && (
                  <div className="px-4 py-2 text-center text-[11px] text-[#5f5e61]">
                    Start of thread
                  </div>
                )}

                {/* Empty Thread State */}
                {replies.length === 0 && (
                  <div className="flex flex-1 flex-col items-center justify-center p-8 text-center text-[#47464b]">
                    <p className="text-[14px] font-medium text-[#47464b]">No replies yet</p>
                    <p className="text-[12px] text-[#5f5e61]">
                      Start the conversation in this thread.
                    </p>
                  </div>
                )}

                {/* Chronological Replies List */}
                {replies.map((reply, idx) => {
                  const prev = idx > 0 ? replies[idx - 1] : null;
                  const isCurrentUser = reply.authorId === userId;

                  if (editingMessageId === reply.id) {
                    return (
                      <MessageEditor
                        key={reply.id}
                        message={reply}
                        isCurrentUser={isCurrentUser}
                        showTimestamp={true}
                        previousMessage={prev}
                        editingBody={editingBody ?? ''}
                        setEditingBody={setEditingBody}
                        cancelEdit={handleCancelEdit}
                        submitEdit={handleEditSubmit}
                        submitting={submitting}
                      />
                    );
                  }

                  return (
                    <MessageRow
                      key={reply.id}
                      message={reply}
                      currentUserId={userId}
                      isCurrentUser={isCurrentUser}
                      showTimestamp={true}
                      previousMessage={prev}
                      mentionMembers={mentionMembers}
                      highlighted={highlightedReplyId === reply.id}
                      onEdit={handleEdit}
                      onDelete={handleDeleteRequest}
                      onAttachmentDeleted={removeAttachment}
                    />
                  );
                })}
              </>
            )}
          </div>

          {showJumpToBottom && (
            <button
              type="button"
              onClick={scrollToBottom}
              aria-label="Jump to latest"
              className="absolute bottom-3 left-1/2 -translate-x-1/2 rounded-full bg-[#000000] px-3 py-1 text-xs font-medium tabular-nums text-white shadow-md transition-[opacity,scale,background-color] duration-160 ease-out-expo starting:scale-90 starting:opacity-0 hover:bg-[#1a1b22] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1f44e4]"
            >
              Jump to latest <span aria-hidden="true">↓</span>
            </button>
          )}
        </div>

        {/* Thread Composer — hidden when replies are unavailable so no stale
          reply controls are exposed */}
        {state.status !== 'unauthenticated' && state.status !== 'notFound' && (
          <div className="border-t border-[#E4E2DF] bg-white p-3">
            <ThreadTypingIndicator
              key={rootMessage.id}
              container={threadContainer}
              userId={userId}
              members={typingMembers}
            />
            <MessageComposer
              placeholder="Reply..."
              send={send}
              disabled={state.status !== 'ready'}
              container={threadContainer}
              currentUserId={userId}
              mentionSource={mentionSource}
              onRetryMentionMembers={onRetryMentionMembers}
            />
          </div>
        )}

        {/* Reply Delete Confirmation Dialog */}
        <DeleteMessageDialog
          isOpen={confirmDeleteId !== null}
          onClose={handleCancelDelete}
          onConfirm={handleConfirmDelete}
          deleting={submitting}
          error={deleteError}
        />
      </aside>
    </>
  );
}
