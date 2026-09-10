'use client';

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';

const useIsomorphicLayoutEffect = typeof window !== 'undefined' ? useLayoutEffect : useEffect;
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useSessionUser } from '@/lib/use-session-user';
import { useWorkspaces } from '@/lib/use-workspaces';
import { useWorkspaceChannel } from '@/lib/use-workspace-channel';
import { useWorkspaceMembers } from '@/lib/use-workspace-members';
import { useMessages } from '@/lib/use-messages';
import {
  consumeDeepLinkParams,
  scrollToMessage,
  useDeepLink,
  useSeekMessage,
} from '@/lib/use-deep-link';
import { type Channel } from '@/lib/channels';
import type { WorkspaceRole } from '@/lib/workspaces';
import type { WorkspaceMember } from '@/lib/members';
import type { SessionUser } from '@/lib/auth-guard';
import {
  MessageRow,
  MessageComposer,
  ConversationEmptyState,
  MessageEditor,
  DeleteMessageDialog,
  AppShell,
  AppShellSkeleton,
  HashIcon,
  LockIcon,
  ThreadPanel,
  TypingIndicator,
  EditChannelDialog,
} from '@/components/app';
import { ChannelMembersDialog } from '@/components/app/ChannelMembersDialog';
import { ChannelDeleteDialog } from '@/components/app/ChannelDeleteDialog';
import { ChannelLeaveDialog } from '@/components/app/ChannelLeaveDialog';
import { useTyping } from '@/lib/use-typing';
import type { Message } from '@/lib/messages';

type MemberInfo = {
  id: string;
  name: string;
  image: string | null;
  role: string;
};

function ChannelHeader({
  channel,
  members,
  canEdit,
  canDelete,
  onEdit,
  onDelete,
  onLeave,
  onManageMembers,
  canManageMembers,
}: {
  channel: Channel | null;
  members: MemberInfo[];
  canEdit?: boolean;
  canDelete?: boolean;
  onEdit?: () => void;
  onDelete?: () => void;
  onLeave?: () => void;
  onManageMembers?: () => void;
  canManageMembers?: boolean;
}) {
  if (!channel) return null;
  const isPrivate = channel.type === 'PRIVATE';

  return (
    <header className="flex h-14 shrink-0 items-center justify-between border-b border-stone-200 bg-white px-4 sm:px-6">
      <div className="flex min-w-0 items-center gap-2.5">
        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-stone-100 text-stone-500">
          {isPrivate ? <LockIcon className="h-4 w-4" /> : <HashIcon className="h-4 w-4" />}
        </div>
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h1 className="truncate text-[15px] font-semibold text-stone-900">{channel.name}</h1>
            <span className="shrink-0 rounded bg-stone-100 px-1.5 py-0.5 text-[10px] font-medium text-stone-500">
              {isPrivate ? 'Private' : 'Public'}
            </span>
          </div>
          {channel.description && (
            <p className="truncate text-[12px] text-stone-500">{channel.description}</p>
          )}
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {members.length > 0 && (
          <span className="hidden text-[12px] text-stone-400 sm:inline">
            {members.length} {members.length === 1 ? 'member' : 'members'}
          </span>
        )}
        {isPrivate && onManageMembers && (
          <button
            type="button"
            onClick={onManageMembers}
            className="rounded-md border border-stone-200 bg-white px-2.5 py-1 text-[12px] font-medium text-stone-700 shadow-sm transition-colors hover:bg-stone-50 hover:text-stone-900"
            aria-label={canManageMembers ? 'Manage members' : 'View members'}
          >
            {canManageMembers ? 'Manage' : 'Members'}
          </button>
        )}
        {canEdit && onEdit && (
          <button
            type="button"
            onClick={onEdit}
            aria-label="Edit channel"
            className="rounded-md border border-stone-200 bg-white px-2.5 py-1 text-[12px] font-medium text-stone-700 shadow-sm transition-colors hover:bg-stone-50 hover:text-stone-900"
          >
            Edit
          </button>
        )}
        {canDelete && onDelete && (
          <button
            type="button"
            onClick={onDelete}
            aria-label="Delete channel"
            className="rounded-md border border-red-200 bg-white px-2.5 py-1 text-[12px] font-medium text-red-600 shadow-sm transition-colors hover:bg-red-50"
          >
            Delete
          </button>
        )}
        {onLeave && (
          <button
            type="button"
            onClick={onLeave}
            className="rounded-md border border-stone-200 bg-white px-2.5 py-1 text-[12px] font-medium text-stone-700 shadow-sm transition-colors hover:bg-stone-50 hover:text-stone-900"
          >
            Leave
          </button>
        )}
      </div>
    </header>
  );
}

function MessageList({
  channelName,
  channelId,
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
}: {
  channelName?: string;
  channelId?: string | null;
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
}) {
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const scrollPosBeforeLoadRef = useRef<{ scrollHeight: number; scrollTop: number } | null>(null);
  const prevMessagesLengthRef = useRef<number>(messages.length);
  const isInitialMountRef = useRef<boolean>(true);
  const prevChannelIdRef = useRef<string | null>(channelId ?? null);
  const isNearBottomRef = useRef<boolean>(true);
  const [showJumpToBottom, setShowJumpToBottom] = useState(false);

  // If channel changes, reset initial mount state for that channel
  if (prevChannelIdRef.current !== (channelId ?? null)) {
    prevChannelIdRef.current = channelId ?? null;
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
    isNearBottomRef.current = nearBottom;
    setShowJumpToBottom(!nearBottom);
  }, []);

  const scrollToBottom = useCallback(() => {
    const el = scrollContainerRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
    setShowJumpToBottom(false);
  }, []);

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
    } else if (messages.length > prevMessagesLengthRef.current) {
      if (isNearBottomRef.current) {
        el.scrollTop = el.scrollHeight;
        setShowJumpToBottom(false);
      } else {
        setShowJumpToBottom(true);
      }
    }
    prevMessagesLengthRef.current = messages.length;
  }, [messages, channelId]);

  const cleanChannelName = (channelName || 'channel').replace(/^#/, '');

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
            data-testid="channel-start-banner"
          >
            <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-xl bg-stone-100 text-stone-700">
              <HashIcon className="h-5 w-5" />
            </div>
            <h2 className="text-base font-bold text-stone-900">Welcome to #{cleanChannelName}</h2>
            <p className="mt-1 text-xs text-stone-500">
              This is the start of the #{cleanChannelName} channel.
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
        <div className="absolute bottom-3 left-1/2 z-10 -translate-x-1/2">
          <button
            type="button"
            onClick={scrollToBottom}
            className="flex items-center gap-1.5 rounded-full bg-stone-900 px-3 py-1.5 text-xs font-medium text-white shadow-lg transition-transform hover:scale-105 active:scale-95"
          >
            <span>Jump to latest</span>
            <svg
              className="h-3.5 w-3.5"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              aria-hidden="true"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M19 14l-7 7m0 0l-7-7m7 7V3"
              />
            </svg>
          </button>
        </div>
      )}
    </div>
  );
}

function ChannelNotFound() {
  return (
    <div className="flex min-h-[320px] flex-col items-center justify-center gap-3 rounded-xl border border-red-200 bg-red-50 px-5 py-10 text-center">
      <p className="text-[13px] text-red-700">Channel not found.</p>
      <Link href="/app" className="text-[13px] text-stone-600 underline">
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

function LoadingChannel() {
  return (
    <div className="flex min-h-[320px] items-center justify-center">
      <div className="flex flex-col items-center gap-3">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-stone-200 border-t-stone-500" />
        <p className="text-sm text-stone-500">Loading channel…</p>
      </div>
    </div>
  );
}

type ConversationPageInnerProps = {
  workspace: { id: string; name: string; role: WorkspaceRole | null };
  slug: string;
  user: SessionUser;
};

function ConversationPageInner({ workspace, slug, user }: ConversationPageInnerProps) {
  const router = useRouter();
  const userId = user.id;

  const channelState = useWorkspaceChannel(workspace.id, slug);
  const membersState = useWorkspaceMembers(workspace.id);
  const messagesHook = useMessages(
    channelState.state.status === 'ready' && channelState.state.channel
      ? channelState.state.channel.id
      : null,
  );

  const {
    state: messagesState,
    retry: retryMessages,
    loadOlder,
    send,
    edit,
    remove,
    isLoadingOlder,
    loadOlderError,
  } = messagesHook;

  const channel = channelState.state.status === 'ready' ? channelState.state.channel : null;
  const members = membersState.state.status === 'ready' ? membersState.state.members : [];
  const messages = messagesState.status === 'ready' ? messagesState.messages : [];

  const channelName = channel?.name ?? '#channel';
  const channelId = channel?.id ?? null;

  const { typingUserIds } = useTyping(channelId ? { channelId } : null, { currentUserId: userId });

  const typingMembers = useMemo(() => {
    return members.map((m) => ({
      id: m.user.id,
      name: m.user.name,
    }));
  }, [members]);

  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
  const [editingBody, setEditingBody] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [selectedThreadRootMessage, setSelectedThreadRootMessage] = useState<Message | null>(null);
  const [highlightedMessageId, setHighlightedMessageId] = useState<string | null>(null);
  const [highlightedReplyId, setHighlightedReplyId] = useState<string | null>(null);
  const [isMembersDialogOpen, setIsMembersDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [isLeaveDialogOpen, setIsLeaveDialogOpen] = useState(false);
  const deepLink = useDeepLink();
  const deepLinkConsumedRef = useRef(false);
  const canManageChannelMembers = workspace.role === 'OWNER' || workspace.role === 'ADMIN';
  const canEditChannel = workspace.role === 'OWNER' || workspace.role === 'ADMIN';
  const canDeleteChannel = canEditChannel;

  // Clear thread selection when switching channels
  useEffect(() => {
    setSelectedThreadRootMessage(null);
    setHighlightedMessageId(null);
    setHighlightedReplyId(null);
    deepLinkConsumedRef.current = false;
  }, [slug]);

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

  // Channel-level loading states
  if (channelState.state.status === 'loading' || channelState.state.status === 'idle') {
    return (
      <AppShell
        user={user}
        workspaceName={workspace.name}
        workspaceId={workspace.id}
        location={`#${slug}`}
        contentLayout="full"
      >
        <LoadingChannel />
      </AppShell>
    );
  }

  // Channel-level error states
  if (channelState.state.status === 'unauthenticated') {
    return (
      <AppShell
        user={user}
        workspaceName={workspace.name}
        workspaceId={workspace.id}
        location={`#${slug}`}
        contentLayout="full"
      >
        <AuthRequired />
      </AppShell>
    );
  }

  if (channelState.state.status === 'error') {
    return (
      <AppShell
        user={user}
        workspaceName={workspace.name}
        workspaceId={workspace.id}
        location={`#${slug}`}
        contentLayout="full"
      >
        <LoadError message={channelState.state.message} onRetry={channelState.retry} />
      </AppShell>
    );
  }

  // Channel not-found state (only after request has definitively returned notFound)
  if (channelState.state.status === 'notFound') {
    return (
      <AppShell
        user={user}
        workspaceName={workspace.name}
        workspaceId={workspace.id}
        location={`#${slug}`}
        contentLayout="full"
      >
        <ChannelNotFound />
      </AppShell>
    );
  }

  if (channelState.state.status !== 'ready' || !channel) {
    return null;
  }

  // Format members for header
  const memberInfo: MemberInfo[] = members.map((m: WorkspaceMember) => ({
    id: m.id,
    name: m.user.name,
    image: m.user.image,
    role: m.role,
  }));

  return (
    <AppShell
      user={user}
      workspaceName={workspace.name}
      workspaceId={workspace.id}
      location={`#${channel.name}`}
      contentLayout="full"
    >
      <div
        className="flex min-h-0 flex-1 flex-col bg-white"
        data-selected-thread-id={selectedThreadRootMessage?.id ?? undefined}
      >
        <ChannelHeader
          channel={channel}
          members={memberInfo}
          canEdit={canEditChannel}
          canDelete={canDeleteChannel}
          onEdit={() => setIsEditDialogOpen(true)}
          onDelete={() => setIsDeleteDialogOpen(true)}
          onLeave={() => setIsLeaveDialogOpen(true)}
          canManageMembers={canManageChannelMembers}
          onManageMembers={
            channel.type === 'PRIVATE' ? () => setIsMembersDialogOpen(true) : undefined
          }
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
              ) : messages.length === 0 ? (
                <ConversationEmptyState channelName={channelName} />
              ) : (
                <MessageList
                  channelName={channelName}
                  channelId={channelId}
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
                />
              )}
            </div>

            {channelId && (
              <div className="border-t border-stone-200 bg-white p-2 px-3 sm:px-6">
                <TypingIndicator
                  typingUserIds={typingUserIds}
                  members={typingMembers}
                  className="mb-1 px-1"
                />
                <MessageComposer
                  placeholder={`Message ${channelName}`}
                  send={handleSend}
                  disabled={messagesState.status !== 'ready'}
                  loading={submitting}
                  container={channelId ? { channelId } : null}
                  currentUserId={userId}
                />
              </div>
            )}

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
        {isMembersDialogOpen && channel && (
          <ChannelMembersDialog
            workspaceId={workspace.id}
            channel={channel}
            canManage={canManageChannelMembers}
            onClose={() => setIsMembersDialogOpen(false)}
          />
        )}
        {isEditDialogOpen && channel && (
          <EditChannelDialog
            workspaceId={workspace.id}
            channel={channel}
            onClose={() => setIsEditDialogOpen(false)}
            onUpdated={(updated) => {
              setIsEditDialogOpen(false);
              // Dispatch update for sidebar and navigate if slug changed
              try {
                window.dispatchEvent(
                  new CustomEvent('teamflow:channel:updated', {
                    detail: { channel: updated, workspaceId: workspace.id },
                  }),
                );
              } catch {
                // ignore
              }
              if (updated.slug !== channel.slug) {
                router.push(`/app/channels/${updated.slug}`);
              } else {
                channelState.retry();
              }
            }}
            onUnauthenticated={() => router.replace('/sign-in')}
          />
        )}
        {isDeleteDialogOpen && channel && (
          <ChannelDeleteDialog
            workspaceId={workspace.id}
            channel={channel}
            onClose={() => setIsDeleteDialogOpen(false)}
            onDeleted={() => {
              setIsDeleteDialogOpen(false);
              router.push('/app');
            }}
            onUnauthenticated={() => router.replace('/sign-in')}
          />
        )}
        {isLeaveDialogOpen && channel && (
          <ChannelLeaveDialog
            workspaceId={workspace.id}
            channel={channel}
            onClose={() => setIsLeaveDialogOpen(false)}
            onLeft={() => {
              setIsLeaveDialogOpen(false);
              router.push('/app');
            }}
            onUnauthenticated={() => router.replace('/sign-in')}
          />
        )}
      </div>
    </AppShell>
  );
}

export default function ChannelPage() {
  const router = useRouter();
  const params = useParams();
  const slug = params?.slug as string | undefined;

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

  if (slug === undefined) {
    return <ChannelNotFound />;
  }

  // Redirect if signed out
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

  // Waiting for session/workspaces to load
  if (
    session.status === 'loading' ||
    workspacesState.status === 'loading' ||
    workspacesState.status === 'idle'
  ) {
    return <AppShellSkeleton />;
  }

  // Error loading session/workspaces
  if (session.status === 'error') {
    return <LoadError message={session.message} onRetry={() => window.location.reload()} />;
  }

  if (workspacesState.status === 'error') {
    return <LoadError message={workspacesState.message} onRetry={retryWorkspaces} />;
  }

  // No workspaces
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
    <ConversationPageInner
      workspace={{
        id: currentWorkspace.id,
        name: currentWorkspace.name,
        role: currentWorkspace.role,
      }}
      slug={slug}
      user={session.user}
    />
  );
}
