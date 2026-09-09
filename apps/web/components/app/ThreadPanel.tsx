'use client';

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { Message } from '../../lib/messages';
import { useThreadMessages } from '../../lib/use-thread-messages';
import { scrollToMessage, useSeekMessage } from '../../lib/use-deep-link';
import { CloseIcon } from './icons';
import { UserAvatar } from './UserAvatar';
import { formatMessageTime } from './message-utils';
import { MessageRow } from './MessageRow';
import { MessageEditor } from './MessageEditor';
import { MessageComposer } from './MessageComposer';
import { DeleteMessageDialog } from './DeleteMessageDialog';
import { MessageReactions } from './MessageReactions';

interface ThreadPanelProps {
  rootMessage: Message;
  userId: string | null;
  onClose: () => void;
  /** Search deep-link: highlight + scroll to this reply once loaded. */
  highlightedReplyId?: string | null;
}

export function ThreadPanel({
  rootMessage,
  userId,
  onClose,
  highlightedReplyId,
}: ThreadPanelProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const repliesScrollRef = useRef<HTMLDivElement>(null);
  const scrollPosBeforeLoadRef = useRef<{ scrollHeight: number; scrollTop: number } | null>(null);
  const prevRepliesCountRef = useRef<number>(0);

  const { state, isLoadingOlder, loadOlderError, retry, loadOlder, send, edit, remove } =
    useThreadMessages(rootMessage.id, rootMessage.channelId);

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

  // Handle Escape key at panel level (cancel edit/delete first, otherwise close panel)
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
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
    }

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
    <aside
      ref={panelRef}
      role="region"
      aria-label="Thread panel"
      className="flex h-full w-[380px] sm:w-[420px] lg:w-[440px] shrink-0 flex-col border-l border-stone-200 bg-white"
    >
      {/* Thread Header */}
      <header className="flex h-14 items-center justify-between border-b border-stone-200 px-4">
        <div className="min-w-0">
          <h2 className="text-[15px] font-semibold text-stone-900">Thread</h2>
          <p className="truncate text-[11px] text-stone-500">with {rootAuthorName}</p>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close thread"
          title="Close thread"
          className="flex h-7 w-7 items-center justify-center rounded-md text-stone-400 transition-colors hover:bg-stone-100 hover:text-stone-700 focus:outline-none focus:ring-1 focus:ring-stone-400"
        >
          <CloseIcon className="h-4 w-4" />
        </button>
      </header>

      {/* Pinned Root Message */}
      <div className="border-b border-stone-200 bg-stone-50/50 p-4">
        {rootMessage.body === null ? (
          <div>
            <div className="text-[13px] italic text-stone-400">Message deleted</div>
            <MessageReactions messageId={rootMessage.id} currentUserId={userId} isDeleted />
          </div>
        ) : (
          <div className="flex items-start gap-3">
            <div className="shrink-0 pt-0.5">
              <UserAvatar name={rootAuthorName} image={rootMessage.author?.image} size="md" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="mb-1 flex items-baseline gap-2 leading-none">
                <span className="truncate text-[13px] font-semibold text-stone-900">
                  {rootAuthorName}
                </span>
                <span className="shrink-0 text-[11px] font-normal text-stone-400">
                  {formatMessageTime(rootMessage.createdAt)}
                </span>
              </div>
              <p className="break-words text-[14px] leading-relaxed text-stone-800 whitespace-pre-wrap">
                {rootMessage.body}
              </p>
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
            <div className="flex flex-1 items-center justify-center p-8 text-stone-500">
              <div className="flex items-center gap-2 text-sm">
                <div className="h-4 w-4 animate-spin rounded-full border-2 border-stone-300 border-t-stone-600" />
                <span>Loading replies...</span>
              </div>
            </div>
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

          {state.status === 'ready' && (
            <>
              {/* Load Older Replies */}
              {hasMore && (
                <div className="py-2 text-center">
                  <button
                    type="button"
                    onClick={handleLoadOlder}
                    disabled={isLoadingOlder}
                    className="rounded-md border border-stone-200 bg-white px-3 py-1 text-[12px] font-medium text-stone-600 shadow-xs hover:bg-stone-50 disabled:opacity-50"
                  >
                    {isLoadingOlder ? 'Loading...' : 'Load older replies'}
                  </button>
                  {loadOlderError && <p className="mt-1 text-xs text-red-600">{loadOlderError}</p>}
                </div>
              )}

              {!hasMore && replies.length > 0 && (
                <div className="px-4 py-2 text-center text-[11px] text-stone-400">
                  Start of thread
                </div>
              )}

              {/* Empty Thread State */}
              {replies.length === 0 && (
                <div className="flex flex-1 flex-col items-center justify-center p-8 text-center text-stone-500">
                  <p className="text-[14px] font-medium text-stone-700">No replies yet</p>
                  <p className="text-[12px] text-stone-400">
                    Start the conversation in this thread!
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
                    highlighted={highlightedReplyId === reply.id}
                    onEdit={handleEdit}
                    onDelete={handleDeleteRequest}
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
            className="absolute bottom-3 left-1/2 -translate-x-1/2 rounded-full bg-stone-900 px-3 py-1 text-xs font-medium text-white shadow-md transition-opacity hover:bg-stone-800"
          >
            Jump to latest ↓
          </button>
        )}
      </div>

      {/* Thread Composer */}
      <div className="border-t border-stone-200 bg-white p-3">
        <MessageComposer placeholder="Reply..." send={send} disabled={state.status !== 'ready'} />
      </div>

      {/* Reply Delete Confirmation Dialog */}
      <DeleteMessageDialog
        isOpen={confirmDeleteId !== null}
        onClose={handleCancelDelete}
        onConfirm={handleConfirmDelete}
        deleting={submitting}
        error={deleteError}
      />
    </aside>
  );
}
