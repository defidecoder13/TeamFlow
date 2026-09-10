'use client';

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';

const useIsomorphicLayoutEffect = typeof window !== 'undefined' ? useLayoutEffect : useEffect;
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useSessionUser } from '@/lib/use-session-user';
import { useWorkspaces } from '@/lib/use-workspaces';
import { useDirectConversation } from '@/lib/use-direct-conversation';
import { useDirectMessages } from '@/lib/use-direct-messages';
import {
  consumeDeepLinkParams,
  scrollToMessage,
  useDeepLink,
  useSeekMessage,
} from '@/lib/use-deep-link';
import type { WorkspaceRole } from '@/lib/workspaces';
import type { SessionUser } from '@/lib/auth-guard';
import {
  MessageRow,
  MessageComposer,
  MessageEditor,
  DeleteMessageDialog,
  AppShell,
  AppShellSkeleton,
  ThreadPanel,
  GroupMembersDialog,
  TypingIndicator,
} from '@/components/app';
import { useTyping } from '@/lib/use-typing';
import type { Message, DirectConversation } from '@/lib/messages';

function DirectMessageHeader({
  conversation,
  currentUserId,
  onOpenMembers,
}: {
  conversation: DirectConversation;
  currentUserId?: string | null;
  onOpenMembers?: () => void;
}) {
  const isGroup = conversation.type === 'GROUP';
  const groupDisplayName =
    conversation.name?.trim() ||
    (conversation.participants && conversation.participants.length > 0
      ? conversation.participants
          .filter((p) => !currentUserId || p.id !== currentUserId)
          .map((p) => p.name)
          .join(', ') || 'Group Message'
      : 'Group Message');

  const peer = conversation.peer ?? conversation.participant;
  const peerName = isGroup ? groupDisplayName : (peer?.name ?? 'Direct Message');
  const peerEmail = isGroup
    ? `${conversation.participants.length} member${conversation.participants.length === 1 ? '' : 's'}`
    : (peer?.email ?? '');
  const initial = peerName.trim().charAt(0).toUpperCase() || '?';

  return (
    <header className="flex h-14 shrink-0 items-center justify-between border-b border-stone-200 bg-white px-4 sm:px-6">
      <div className="flex min-w-0 items-center gap-2.5">
        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-stone-200 text-xs font-semibold text-stone-700">
          {initial}
        </div>
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h1 className="truncate text-[15px] font-semibold text-stone-900">{peerName}</h1>
          </div>
          {peerEmail && <p className="truncate text-[12px] text-stone-500">{peerEmail}</p>}
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-3">
        {isGroup && onOpenMembers && (
          <button
            type="button"
            onClick={onOpenMembers}
            className="flex items-center gap-1.5 rounded-md border border-stone-200 bg-white px-2.5 py-1 text-xs font-medium text-stone-700 hover:bg-stone-50 hover:border-stone-300 transition-colors shadow-2xs"
          >
            <span>Members</span>
            <span className="rounded-full bg-stone-100 px-1.5 py-0.2 text-[10px] text-stone-600 font-semibold">
              {conversation.participants.length}
            </span>
          </button>
        )}
        <div className="text-[12px] text-stone-400">{isGroup ? 'Group DM' : 'Direct Message'}</div>
      </div>
    </header>
  );
}

function DirectMessageEmptyState({ peerName, isGroup }: { peerName: string; isGroup?: boolean }) {
  const initial = peerName.trim().charAt(0).toUpperCase() || '?';
  return (
    <div className="flex flex-1 flex-col items-center justify-center p-8 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-full bg-stone-100 text-lg font-semibold text-stone-600">
        {initial}
      </div>
      <h2 className="mt-4 text-base font-semibold text-stone-900">
        {isGroup
          ? `This is the start of the ${peerName} conversation`
          : `This is the start of your direct message history with ${peerName}`}
      </h2>
      <p className="mt-1 max-w-sm text-sm text-stone-500">
        {isGroup
          ? 'Messages sent here are shared with everyone in this group.'
          : 'Messages sent here are private between the two of you. Send a message to get things started!'}
      </p>
    </div>
  );
}

function DirectMessageList({
  peerName,
  conversationId,
  messages,
  hasMore,
  isLoadingOlder,
  loadOlderError,
  onLoadOlder,
  userId,
  editingMessageId,
  editingBody,
  setEditingBody,
  cancelEdit,
  submitEdit,
  deleteMessage,
  submitting,
  onEdit,
  onDelete,
  selectedThreadRootMessageId,
  highlightedMessageId,
  onReplyInThread,
  onMarkRead,
}: {
  peerName: string;
  conversationId: string;
  messages: Message[];
  hasMore?: boolean;
  isLoadingOlder?: boolean;
  loadOlderError?: string | null;
  onLoadOlder?: () => void;
  userId: string | null;
  editingMessageId: string | null;
  editingBody: string;
  setEditingBody: (v: string) => void;
  cancelEdit: () => void;
  submitEdit: (body: string) => Promise<unknown>;
  deleteMessage: (messageId: string) => Promise<{ ok: boolean; error?: string }>;
  submitting: boolean;
  onEdit: (messageId: string) => void;
  onDelete: (messageId: string) => void;
  selectedThreadRootMessageId?: string | null;
  highlightedMessageId?: string | null;
  onReplyInThread?: (message: Message) => void;
  onMarkRead?: (messageId?: string) => void;
}) {
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const scrollPosBeforeLoadRef = useRef<{ scrollHeight: number; scrollTop: number } | null>(null);
  const prevMessagesLengthRef = useRef<number>(messages.length);
  const isInitialMountRef = useRef<boolean>(true);
  const prevConversationIdRef = useRef<string | null>(conversationId);
  const isNearBottomRef = useRef<boolean>(true);
  const [showJumpToBottom, setShowJumpToBottom] = useState(false);

  // If conversation changes, reset initial mount state
  if (prevConversationIdRef.current !== conversationId) {
    prevConversationIdRef.current = conversationId;
    isInitialMountRef.current = true;
    scrollPosBeforeLoadRef.current = null;
  }

  const handleLoadOlder = useCallback(() => {
    if (scrollContainerRef.current) {
      scrollPosBeforeLoadRef.current = {
        scrollHeight: scrollContainerRef.current.scrollHeight,
        scrollTop: scrollContainerRef.current.scrollTop,
      };
    }
    onLoadOlder?.();
  }, [onLoadOlder]);

  const handleScroll = useCallback(() => {
    const el = scrollContainerRef.current;
    if (!el) return;
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    const nearBottom = distanceFromBottom < 120;
    const wasNearBottom = isNearBottomRef.current;
    isNearBottomRef.current = nearBottom;
    setShowJumpToBottom(!nearBottom);

    if (nearBottom && !wasNearBottom && messages.length > 0) {
      const latestMessage = messages[messages.length - 1];
      if (latestMessage) {
        onMarkRead?.(latestMessage.id);
      }
    }
  }, [messages, onMarkRead]);

  const scrollToBottom = useCallback(() => {
    const el = scrollContainerRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
    setShowJumpToBottom(false);
    isNearBottomRef.current = true;
    const latestMessage = messages[messages.length - 1];
    if (latestMessage) {
      onMarkRead?.(latestMessage.id);
    }
  }, [messages, onMarkRead]);

  useIsomorphicLayoutEffect(() => {
    const el = scrollContainerRef.current;
    if (!el) return;

    if (scrollPosBeforeLoadRef.current) {
      const diff = el.scrollHeight - scrollPosBeforeLoadRef.current.scrollHeight;
      el.scrollTop = scrollPosBeforeLoadRef.current.scrollTop + diff;
      scrollPosBeforeLoadRef.current = null;
    } else if (isInitialMountRef.current) {
      el.scrollTop = el.scrollHeight;
      isInitialMountRef.current = false;
      setShowJumpToBottom(false);
      const latestMessage = messages[messages.length - 1];
      if (latestMessage) {
        onMarkRead?.(latestMessage.id);
      }
    } else if (messages.length > prevMessagesLengthRef.current) {
      if (isNearBottomRef.current) {
        el.scrollTop = el.scrollHeight;
        setShowJumpToBottom(false);
        const latestMessage = messages[messages.length - 1];
        if (latestMessage) {
          onMarkRead?.(latestMessage.id);
        }
      } else {
        setShowJumpToBottom(true);
      }
    }
    prevMessagesLengthRef.current = messages.length;
  }, [messages, conversationId, onMarkRead]);

  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      <div
        ref={scrollContainerRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto px-3 py-2"
      >
        {!hasMore && messages.length > 0 && (
          <div
            className="mb-4 border-b border-stone-100 px-3 pb-4 pt-6"
            data-testid="dm-start-banner"
          >
            <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-stone-200 text-sm font-bold text-stone-700">
              {peerName.trim().charAt(0).toUpperCase() || '?'}
            </div>
            <h2 className="text-base font-bold text-stone-900">{peerName}</h2>
            <p className="mt-1 text-xs text-stone-500">
              This is the start of your direct message history with {peerName}.
            </p>
          </div>
        )}

        {hasMore && (
          <div className="flex justify-center pb-2 pt-1">
            {isLoadingOlder ? (
              <div className="flex items-center gap-2 py-1 text-xs text-stone-500">
                <span className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-stone-300 border-t-stone-600" />
                <span>Loading older messages…</span>
              </div>
            ) : loadOlderError ? (
              <div className="flex items-center gap-2 py-1 text-xs text-red-600">
                <span>{loadOlderError}</span>
                <button
                  type="button"
                  onClick={handleLoadOlder}
                  className="font-medium underline hover:text-red-700"
                >
                  Retry
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={handleLoadOlder}
                className="rounded-md px-2.5 py-1 text-[12px] font-medium text-stone-500 transition-colors hover:bg-stone-100 hover:text-stone-700"
              >
                Load older messages
              </button>
            )}
          </div>
        )}

        <div className="flex flex-col">
          {messages.map((message, idx) => {
            const prev = idx === 0 ? null : messages[idx - 1];
            const showTimestamp =
              idx === 0 || prev?.authorId !== message.authorId || !message.createdAt;
            const isCurrentUser = userId !== null && message.authorId === userId;
            if (editingMessageId === message.id) {
              return (
                <MessageEditor
                  key={message.id}
                  message={message}
                  isCurrentUser={isCurrentUser}
                  showTimestamp={showTimestamp}
                  previousMessage={prev}
                  onEdit={onEdit}
                  editingBody={editingBody}
                  setEditingBody={setEditingBody}
                  cancelEdit={cancelEdit}
                  submitEdit={submitEdit}
                  deleteMessage={deleteMessage}
                  submitting={submitting}
                />
              );
            }
            return (
              <MessageRow
                key={message.id}
                message={message}
                currentUserId={userId}
                isCurrentUser={isCurrentUser}
                showTimestamp={showTimestamp}
                previousMessage={prev}
                isSelected={selectedThreadRootMessageId === message.id}
                highlighted={highlightedMessageId === message.id}
                onEdit={onEdit}
                onDelete={onDelete}
                onReplyInThread={onReplyInThread}
              />
            );
          })}
        </div>
      </div>

      {showJumpToBottom && (
        <div className="pointer-events-none absolute bottom-3 right-4 flex justify-end">
          <button
            type="button"
            onClick={scrollToBottom}
            className="pointer-events-auto flex items-center gap-1.5 rounded-full border border-stone-200 bg-white px-3 py-1.5 text-xs font-medium text-stone-700 shadow-md transition-colors hover:bg-stone-50"
          >
            <span>Jump to present</span>
            <svg className="h-3.5 w-3.5" viewBox="0 0 20 20" fill="currentColor">
              <path
                fillRule="evenodd"
                d="M10 3a.75.75 0 01.75.75v10.69l3.72-3.72a.75.75 0 111.06 1.06l-5 5a.75.75 0 01-1.06 0l-5-5a.75.75 0 111.06-1.06l3.72 3.72V3.75A.75.75 0 0110 3z"
                clipRule="evenodd"
              />
            </svg>
          </button>
        </div>
      )}
    </div>
  );
}

function LoadError({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="flex min-h-[320px] flex-col items-center justify-center gap-3 rounded-xl border border-red-200 bg-red-50 px-5 py-10 text-center">
      <p className="text-[13px] text-red-700">{message}</p>
      <button
        type="button"
        onClick={onRetry}
        className="text-[13px] font-medium text-stone-600 underline hover:text-stone-800"
      >
        Retry
      </button>
    </div>
  );
}

function LoadingMessages() {
  return (
    <div className="flex min-h-[320px] items-center justify-center">
      <div className="flex flex-col items-center gap-3">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-stone-200 border-t-stone-500" />
        <p className="text-sm text-stone-500">Loading messages…</p>
      </div>
    </div>
  );
}

function LoadingConversation() {
  return (
    <div className="flex min-h-[320px] items-center justify-center">
      <div className="flex flex-col items-center gap-3">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-stone-200 border-t-stone-500" />
        <p className="text-sm text-stone-500">Loading conversation…</p>
      </div>
    </div>
  );
}

function ConversationNotFound() {
  return (
    <div className="flex min-h-[320px] flex-col items-center justify-center gap-3 rounded-xl border border-stone-200 bg-stone-50 px-5 py-10 text-center">
      <p className="text-[15px] font-semibold text-stone-900">Conversation not found</p>
      <p className="text-[13px] text-stone-500">
        This conversation doesn&apos;t exist or you don&apos;t have access to it.
      </p>
      <Link href="/app" className="mt-2 text-[13px] font-medium text-zinc-900 underline">
        Return to conversations
      </Link>
    </div>
  );
}

function AuthRequired() {
  return (
    <div className="flex min-h-[320px] flex-col items-center justify-center gap-3 rounded-xl border border-red-200 bg-red-50 px-5 py-10 text-center">
      <p className="text-[13px] text-red-700">Session expired. Please sign in again.</p>
      <Link href="/sign-in" className="text-[13px] text-stone-600 underline">
        Sign in
      </Link>
    </div>
  );
}

type DirectMessagePageInnerProps = {
  workspace: { id: string; name: string; role: WorkspaceRole | null };
  conversationId: string;
  user: SessionUser;
};

function DirectMessagePageInner({ workspace, conversationId, user }: DirectMessagePageInnerProps) {
  const userId = user.id;
  const router = useRouter();

  const convState = useDirectConversation(conversationId, userId);
  const messagesHook = useDirectMessages(
    convState.state.status === 'ready' ? convState.state.conversation.id : null,
  );

  const {
    state: messagesState,
    retry: retryMessages,
    loadOlder,
    send,
    edit,
    remove,
    markRead,
    isLoadingOlder,
    loadOlderError,
  } = messagesHook;

  const conversation = convState.state.status === 'ready' ? convState.state.conversation : null;
  const messages = messagesState.status === 'ready' ? messagesState.messages : [];

  const isGroup = conversation?.type === 'GROUP';
  const groupDisplayName =
    conversation?.name?.trim() ||
    (conversation?.participants && conversation.participants.length > 0
      ? conversation.participants
          .filter((p) => p.id !== userId)
          .map((p) => p.name)
          .join(', ') || 'Group Message'
      : 'Group Message');

  const peer = conversation?.peer ?? conversation?.participant;
  const peerName = isGroup ? groupDisplayName : (peer?.name ?? 'Direct Message');

  const { typingUserIds } = useTyping(conversationId ? { conversationId } : null, {
    currentUserId: userId,
  });

  const typingMembers = useMemo(() => {
    if (!conversation) return [];
    if (conversation.participants && conversation.participants.length > 0) {
      return conversation.participants.map((p) => ({ id: p.id, name: p.name }));
    }
    const list: { id: string; name: string }[] = [];
    if (conversation.peer) list.push({ id: conversation.peer.id, name: conversation.peer.name });
    if (conversation.participant)
      list.push({ id: conversation.participant.id, name: conversation.participant.name });
    return list;
  }, [conversation]);

  const [membersDialogOpen, setMembersDialogOpen] = useState(false);
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
  const [editingBody, setEditingBody] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [selectedThreadRootMessage, setSelectedThreadRootMessage] = useState<Message | null>(null);
  const [highlightedMessageId, setHighlightedMessageId] = useState<string | null>(null);
  const [highlightedReplyId, setHighlightedReplyId] = useState<string | null>(null);
  const deepLink = useDeepLink();
  const deepLinkConsumedRef = useRef(false);

  // Clear thread selection when switching conversations
  useEffect(() => {
    setSelectedThreadRootMessage(null);
    setHighlightedMessageId(null);
    setHighlightedReplyId(null);
    deepLinkConsumedRef.current = false;
  }, [conversationId]);

  // Search deep link (?message=<id>[&reply=<replyId>]): page back through
  // history until the target loads, then highlight it, open its thread for
  // replies, and scroll into view. Params are consumed only on the terminal
  // found/missing states — never before handling completes.
  const seekStatus = useSeekMessage({
    active: messagesState.status === 'ready',
    targetId: deepLink.messageId,
    messages,
    hasMore: messagesState.status === 'ready' && messagesState.hasMore,
    isLoadingOlder,
    loadOlderError,
    loadOlder,
  });
  useEffect(() => {
    if (deepLinkConsumedRef.current) {
      return;
    }
    if (!deepLink.messageId) {
      if (deepLink.replyId) {
        deepLinkConsumedRef.current = true;
        consumeDeepLinkParams();
      }
      return;
    }
    if (seekStatus === 'missing') {
      // Graceful failure (deleted, inaccessible, or beyond the page cap):
      // open the conversation normally and drop the params.
      deepLinkConsumedRef.current = true;
      consumeDeepLinkParams();
      return;
    }
    if (seekStatus !== 'found') {
      return;
    }
    const targetId = deepLink.messageId;
    const target = messages.find((m) => m.id === targetId);
    if (!target) {
      return;
    }
    deepLinkConsumedRef.current = true;
    setHighlightedMessageId(target.id);
    if (deepLink.replyId) {
      setSelectedThreadRootMessage(target);
      setHighlightedReplyId(deepLink.replyId);
    }
    requestAnimationFrame(() => {
      scrollToMessage(target.id);
    });
    consumeDeepLinkParams();
  }, [seekStatus, deepLink, messages, messagesState.status]);

  // Keep selected root message fresh if message state updates
  useEffect(() => {
    if (selectedThreadRootMessage) {
      const fresh = messages.find((m) => m.id === selectedThreadRootMessage.id);
      if (fresh && fresh !== selectedThreadRootMessage) {
        setSelectedThreadRootMessage(fresh);
      }
    }
  }, [messages, selectedThreadRootMessage]);

  const handleSelectThread = useCallback((message: Message) => {
    setSelectedThreadRootMessage(message);
  }, []);

  const handleCloseThread = useCallback(() => {
    setSelectedThreadRootMessage(null);
  }, []);

  const handleSend = useCallback(
    async (body: string): Promise<{ ok: boolean; error?: string; messageId?: string }> => {
      setSubmitting(true);
      setSubmitError(null);
      try {
        const result = await send(body);
        if (!result.ok) {
          setSubmitError(result.error ?? 'Could not send message.');
          return result;
        }
        return result;
      } finally {
        setSubmitting(false);
      }
    },
    [send],
  );

  const handleEdit = useCallback(
    (messageId: string) => {
      const message = messages.find((m) => m.id === messageId);
      if (!message || message.authorId !== userId || message.body === null) return;
      setEditingMessageId(messageId);
      setEditingBody(message.body);
      setSubmitError(null);
    },
    [messages, userId],
  );

  const handleCancelEdit = useCallback(() => {
    setEditingMessageId(null);
    setEditingBody(null);
    setSubmitError(null);
  }, []);

  const handleEditSubmit = useCallback(
    async (newBody?: string): Promise<{ ok: boolean; error?: string }> => {
      const bodyToSubmit = newBody ?? editingBody;
      if (!editingMessageId || !bodyToSubmit) {
        return { ok: false, error: 'No message to edit.' };
      }
      setSubmitting(true);
      setSubmitError(null);
      try {
        const result = await edit(editingMessageId, bodyToSubmit);
        if (!result.ok) {
          return result;
        } else {
          setEditingMessageId(null);
          setEditingBody(null);
          return { ok: true };
        }
      } finally {
        setSubmitting(false);
      }
    },
    [edit, editingMessageId, editingBody],
  );

  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const handleDeleteRequest = useCallback(
    (messageId: string) => {
      const message = messages.find((m) => m.id === messageId);
      if (!message || message.authorId !== userId) return;
      setConfirmDeleteId(messageId);
      setDeleteError(null);
    },
    [messages, userId],
  );

  const handleConfirmDelete = useCallback(async () => {
    if (!confirmDeleteId) return;
    const messageId = confirmDeleteId;
    setSubmitting(true);
    setDeleteError(null);
    try {
      const result = await remove(messageId);
      if (!result.ok) {
        setDeleteError(result.error ?? 'Could not delete message.');
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

  // Conversation loading states
  if (convState.state.status === 'loading' || convState.state.status === 'idle') {
    return (
      <AppShell
        user={user}
        workspaceName={workspace.name}
        workspaceId={workspace.id}
        location={peerName}
        contentLayout="full"
      >
        <LoadingConversation />
      </AppShell>
    );
  }

  // Conversation error states
  if (convState.state.status === 'unauthenticated') {
    return (
      <AppShell
        user={user}
        workspaceName={workspace.name}
        workspaceId={workspace.id}
        location={peerName}
        contentLayout="full"
      >
        <AuthRequired />
      </AppShell>
    );
  }

  if (convState.state.status === 'error') {
    return (
      <AppShell
        user={user}
        workspaceName={workspace.name}
        workspaceId={workspace.id}
        location={peerName}
        contentLayout="full"
      >
        <LoadError message={convState.state.message} onRetry={convState.retry} />
      </AppShell>
    );
  }

  if (convState.state.status === 'notFound') {
    return (
      <AppShell
        user={user}
        workspaceName={workspace.name}
        workspaceId={workspace.id}
        location="Direct Message"
        contentLayout="full"
      >
        <ConversationNotFound />
      </AppShell>
    );
  }

  if (convState.state.status !== 'ready' || !conversation) {
    return null;
  }

  return (
    <AppShell
      user={user}
      workspaceName={workspace.name}
      workspaceId={workspace.id}
      location={peerName}
      contentLayout="full"
    >
      <div
        className="flex min-h-0 flex-1 flex-col bg-white"
        data-selected-thread-id={selectedThreadRootMessage?.id ?? undefined}
      >
        <DirectMessageHeader
          conversation={conversation}
          currentUserId={userId}
          onOpenMembers={() => setMembersDialogOpen(true)}
        />

        <div className="flex min-h-0 flex-1 flex-row">
          <div className="flex min-h-0 flex-1 flex-col">
            <div className="flex min-h-0 flex-1 flex-col">
              {messagesState.status === 'unauthenticated' ? (
                <AuthRequired />
              ) : messagesState.status === 'loading' ? (
                <LoadingMessages />
              ) : messagesState.status === 'error' ? (
                <LoadError message={messagesState.message} onRetry={retryMessages} />
              ) : messagesState.status === 'notFound' ? (
                <ConversationNotFound />
              ) : messages.length === 0 ? (
                <DirectMessageEmptyState peerName={peerName} isGroup={isGroup} />
              ) : (
                <DirectMessageList
                  peerName={peerName}
                  conversationId={conversationId}
                  messages={messages}
                  hasMore={messagesState.status === 'ready' && messagesState.hasMore}
                  isLoadingOlder={isLoadingOlder}
                  loadOlderError={loadOlderError}
                  onLoadOlder={loadOlder}
                  userId={userId}
                  editingMessageId={editingMessageId}
                  editingBody={editingBody ?? ''}
                  setEditingBody={setEditingBody}
                  cancelEdit={handleCancelEdit}
                  submitEdit={handleEditSubmit}
                  deleteMessage={remove}
                  submitting={submitting}
                  onEdit={handleEdit}
                  onDelete={handleDeleteRequest}
                  selectedThreadRootMessageId={selectedThreadRootMessage?.id}
                  highlightedMessageId={highlightedMessageId}
                  onReplyInThread={handleSelectThread}
                  onMarkRead={markRead}
                />
              )}
            </div>

            <div className="border-t border-stone-200 bg-white p-2 px-3 sm:px-6">
              <TypingIndicator
                typingUserIds={typingUserIds}
                members={typingMembers}
                className="mb-1 px-1"
              />
              <MessageComposer
                placeholder={`Message ${peerName}`}
                send={handleSend}
                disabled={messagesState.status !== 'ready'}
                loading={submitting}
                container={conversationId ? { conversationId } : null}
                currentUserId={userId}
              />
            </div>

            {submitError && (
              <div className="rounded-md bg-red-50 px-4 py-2 text-[13px] text-red-700">
                {submitError}
              </div>
            )}
          </div>

          {selectedThreadRootMessage && (
            <ThreadPanel
              rootMessage={selectedThreadRootMessage}
              userId={userId}
              onClose={handleCloseThread}
              highlightedReplyId={highlightedReplyId}
            />
          )}
        </div>

        <DeleteMessageDialog
          isOpen={confirmDeleteId !== null}
          onClose={handleCancelDelete}
          onConfirm={handleConfirmDelete}
          deleting={submitting}
          error={deleteError}
        />

        {membersDialogOpen && conversation && (
          <GroupMembersDialog
            conversation={conversation}
            workspaceId={workspace.id}
            currentUserId={userId}
            onClose={() => setMembersDialogOpen(false)}
            onConversationUpdated={(updated) => {
              convState.setConversation(updated);
            }}
            onLeftConversation={() => {
              setMembersDialogOpen(false);
              router.push('/app');
            }}
            onUnauthenticated={() => router.replace('/sign-in')}
          />
        )}
      </div>
    </AppShell>
  );
}

export default function DirectMessagePage() {
  const router = useRouter();
  const params = useParams();
  const conversationId = params?.conversationId as string | undefined;

  const session = useSessionUser();
  const { state: workspacesState, retry: retryWorkspaces } = useWorkspaces(
    session.status === 'authenticated',
  );

  const signedOut =
    session.status === 'unauthenticated' || workspacesState.status === 'unauthenticated';

  useEffect(() => {
    if (signedOut) {
      router.replace('/sign-in');
    }
  }, [signedOut, router]);

  if (conversationId === undefined) {
    return <ConversationNotFound />;
  }

  if (signedOut) {
    return (
      <div className="flex min-h-[320px] flex-col items-center justify-center gap-3 rounded-xl border border-red-200 bg-red-50 px-5 py-10 text-center">
        <p className="text-[13px] text-red-700">Session expired. Please sign in again.</p>{' '}
        <Link href="/sign-in" className="text-[13px] text-stone-600 underline">
          Sign in
        </Link>
      </div>
    );
  }

  if (
    session.status === 'loading' ||
    workspacesState.status === 'loading' ||
    workspacesState.status === 'idle'
  ) {
    return <AppShellSkeleton />;
  }

  if (session.status === 'error') {
    return <LoadError message={session.message} onRetry={() => window.location.reload()} />;
  }

  if (workspacesState.status === 'error') {
    return <LoadError message={workspacesState.message} onRetry={retryWorkspaces} />;
  }

  if (workspacesState.status === 'ready' && !workspacesState.current) {
    return (
      <AppShell user={session.user} workspaceName={null} workspaceId={null} location="Home">
        <div className="flex min-h-[320px] flex-col items-center justify-center gap-3 rounded-xl border border-red-200 bg-red-50 px-5 py-10 text-center">
          <p className="text-[13px] text-red-700">No workspace selected.</p>
          <Link href="/app" className="text-[13px] text-stone-600 underline">
            Return to conversations
          </Link>
        </div>
      </AppShell>
    );
  }

  const currentWorkspace = workspacesState.status === 'ready' ? workspacesState.current : null;
  if (!currentWorkspace) {
    return null;
  }

  return (
    <DirectMessagePageInner
      workspace={{
        id: currentWorkspace.id,
        name: currentWorkspace.name,
        role: currentWorkspace.role,
      }}
      conversationId={conversationId}
      user={session.user}
    />
  );
}
