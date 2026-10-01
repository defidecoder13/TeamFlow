import React, { useState, useRef, useMemo, useEffect } from 'react';
import { useApp } from '../../lib/mock-context';
import { useShell } from '../../lib/shell-context';
import { useRouter } from '../../lib/mock-hooks/useRouter';
import { useWorkspaceChannel } from '../../lib/use-workspace-channel';
import { useMessages } from '../../lib/use-messages';
import { useChannelMembers } from '../../lib/use-channel-members';
import { useTyping } from '../../lib/use-typing';
import {
  consumeDeepLinkParams,
  useDeepLink,
  useSeekMessage,
} from '../../lib/use-deep-link';
import { getApiBaseUrl } from '../../lib/config';
import {
  updateChannel,
  deleteChannel,
  leaveChannel,
  type Channel as RealChannel,
} from '../../lib/channels';
import { uploadSingleAttachmentDraft, type AttachmentDraft } from '../../lib/attachments';
import type { Message } from '../../lib/messages';
import type { MentionMember } from '../../lib/mentions';
import { MessageFeed } from '../mock-ui/feed/MessageFeed';
import { MessageComposer, type SendMessageResult } from '../mock-ui/feed/MessageComposer';
import { ThreadPanel } from '../mock-ui/feed/ThreadPanel';
import { ChannelMembersDialog } from '../mock-ui/shell/ChannelMembersDialog';
import { Dialog } from '../mock-ui/primitives/Dialog';
import { AuthField } from '../mock-ui/primitives/AuthField';
import { TypingIndicator } from '../app/TypingIndicator';
import {
  Hash,
  Lock,
  Users,
  MoreVertical,
  Edit2,
  LogOut,
  Trash2,
  Star,
  BellOff,
  AlertTriangle,
  RefreshCw,
} from 'lucide-react';

function StatusPanel({
  title,
  message,
  actionLabel,
  onAction,
  icon,
}: {
  title: string;
  message: string;
  actionLabel?: string;
  onAction?: () => void;
  icon?: React.ReactNode;
}) {
  return (
    <main
      id="main-content"
      className="flex-1 flex flex-col items-center justify-center p-8 text-center bg-[#FAF9F8]"
    >
      <div className="w-12 h-12 rounded-full bg-[#F1F0EE] text-[#737782] flex items-center justify-center mb-3">
        {icon ?? <Hash className="w-6 h-6" />}
      </div>
      <h1 className="text-[20px] font-semibold text-[#171A21]">{title}</h1>
      <p className="text-[13px] text-[#4F5360] mt-1 max-w-sm">{message}</p>
      {actionLabel && onAction && (
        <button
          type="button"
          onClick={onAction}
          className="mt-4 px-4 py-2 text-[13px] font-medium text-white bg-[#2E3440] hover:bg-[#1E222A] rounded-[8px] transition-colors focus-visible:ring-2 focus-visible:ring-[#3157D5] inline-flex items-center gap-1.5"
        >
          {icon && actionLabel === 'Try again' ? <RefreshCw className="w-3.5 h-3.5" /> : null}
          {actionLabel}
        </button>
      )}
    </main>
  );
}

const DEFAULT_USER_STATE = {
  unreadCount: 0,
  hasUnread: false,
  lastReadMessageId: null as string | null,
  isStarred: false,
  isMuted: false,
};

export const ChannelView: React.FC<{ slug: string }> = ({ slug }) => {
  const shell = useShell();
  const app = useApp();
  const { push } = useRouter();

  const workspaceId = shell.currentWorkspace?.id ?? null;
  const channelQuery = useWorkspaceChannel(workspaceId, slug);
  const channel =
    channelQuery.state.status === 'ready' ? channelQuery.state.channel : null;
  const channelId = channel?.id ?? null;

  const messages = useMessages(channelId);
  const isPrivate = channel?.type === 'PRIVATE';
  const membersQuery = useChannelMembers(
    workspaceId,
    slug,
    Boolean(channel) && isPrivate,
  );

  const typing = useTyping(channelId ? { channelId } : null, {
    currentUserId: shell.currentUser?.id,
  });

  const [activeThread, setActiveThread] = useState<Message | null>(null);
  const [isMenuOpen, setMenuOpen] = useState(false);
  const [isEditOpen, setEditOpen] = useState(false);
  const [isDeleteOpen, setDeleteOpen] = useState(false);
  const [isLeaveOpen, setLeaveOpen] = useState(false);
  const [editName, setEditName] = useState('');
  const [editTopic, setEditTopic] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [editError, setEditError] = useState('');
  const [isSavingEdit, setIsSavingEdit] = useState(false);
  const editInputRef = useRef<HTMLInputElement>(null);

  const deepLink = useDeepLink();
  const messagesReady = messages.state.status === 'ready';
  const loadedMessages = messages.state.status === 'ready' ? messages.state.messages : [];
  const hasMoreInitial = messages.state.status === 'ready' ? messages.state.hasMore : false;
  const seekStatus = useSeekMessage({
    active: Boolean(deepLink.messageId) && messagesReady,
    targetId: deepLink.messageId,
    messages: loadedMessages,
    hasMore: hasMoreInitial,
    isLoadingOlder: messages.isLoadingOlder,
    loadOlderError: messages.loadOlderError,
    loadOlder: () => void messages.loadOlder(),
  });
  const deepLinkHandledRef = useRef(false);

  useEffect(() => {
    if (!deepLink.messageId || deepLinkHandledRef.current) return;
    if (seekStatus === 'missing') {
      deepLinkHandledRef.current = true;
      consumeDeepLinkParams();
      return;
    }
    if (seekStatus !== 'found') return;
    const target = loadedMessages.find((m: Message) => m.id === deepLink.messageId);
    if (!target) return;
    deepLinkHandledRef.current = true;
    const shouldOpenThread =
      Boolean(deepLink.replyId) || (target.replyCount ?? 0) > 0 || Boolean(target.parentMessageId);
    if (shouldOpenThread) {
      const root = target.parentMessageId
        ? loadedMessages.find((m: Message) => m.id === target.parentMessageId) ?? target
        : target;
      setActiveThread(root);
    }
    consumeDeepLinkParams();
  }, [deepLink.messageId, deepLink.replyId, seekStatus, loadedMessages]);

  const listChannel = shell.channels.find((c) => c.id === channel?.id || c.slug === slug);
  const userState = channel?.userState ?? listChannel?.userState ?? DEFAULT_USER_STATE;
  const channelWithState: RealChannel | null = channel
    ? { ...channel, userState }
    : null;

  const memberCount = useMemo(() => {
    if (isPrivate) {
      return membersQuery.state.status === 'ready'
        ? membersQuery.state.members.length
        : undefined;
    }
    if (shell.members.state.status === 'ready') {
      return shell.members.state.members.length;
    }
    return undefined;
  }, [isPrivate, membersQuery.state, shell.members.state]);

  const mentionMembers: MentionMember[] = useMemo(() => {
    if (shell.members.state.status !== 'ready') return [];
    return shell.members.state.members.map((m) => ({
      id: m.user.id,
      name: m.user.name,
      image: m.user.image,
      email: m.user.email,
    }));
  }, [shell.members.state]);

  const typingMembers = useMemo(() => {
    if (shell.members.state.status !== 'ready') return [];
    return shell.members.state.members.map((m) => ({
      id: m.user.id,
      name: m.user.name,
    }));
  }, [shell.members.state]);

  const canEdit =
    channel !== null &&
    shell.currentWorkspace !== null &&
    (channel.createdById === shell.currentUser?.id ||
      shell.currentWorkspace.role === 'OWNER' ||
      shell.currentWorkspace.role === 'ADMIN');

  const handleSendMessage = async (
    body: string,
    files: File[],
  ): Promise<SendMessageResult> => {
    const result = await messages.send(body);
    if (!result.ok || !result.messageId || files.length === 0) {
      return result;
    }

    const errors: string[] = [];
    for (const file of files) {
      const draft: AttachmentDraft = {
        id: `draft-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`,
        file,
        name: file.name,
        size: file.size,
        mimeType: file.type || 'application/octet-stream',
        status: 'idle',
        progress: 0,
      };
      const upload = await uploadSingleAttachmentDraft(result.messageId, draft);
      if (!upload.ok) {
        errors.push(upload.error);
      }
    }

    await messages.refresh();
    if (errors.length > 0) {
      return { ok: true, messageId: result.messageId, error: errors.join(' ') };
    }
    return result;
  };

  const handleOpenEdit = () => {
    if (!channel) return;
    setEditName(channel.name);
    setEditTopic(channel.topic ?? '');
    setEditDescription(channel.description ?? '');
    setEditError('');
    setMenuOpen(false);
    setEditOpen(true);
  };

  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!channel || !workspaceId) return;
    const name = editName.trim();
    if (!name) {
      setEditError('Channel name cannot be empty');
      editInputRef.current?.focus();
      return;
    }
    setIsSavingEdit(true);
    setEditError('');
    try {
      const result = await updateChannel(getApiBaseUrl(), workspaceId, slug, {
        name,
        topic: editTopic.trim() || null,
        description: editDescription.trim() || null,
      });
      if (result.ok) {
        const next = result.channel;
        channelQuery.setChannel({ ...next, userState });
        shell.channelState.updateChannelState({
          ...next,
          userState,
        });
        setEditOpen(false);
        if (next.slug !== slug) {
          push(`/app/channels/${next.slug}`);
        }
        app.showToast('Channel updated', 'success');
        return;
      }
      if (result.kind === 'unauthenticated') {
        setEditError('Session expired. Please sign in again.');
      } else if (result.kind === 'conflict') {
        setEditError(result.message);
      } else if (result.kind === 'validation') {
        setEditError(result.message);
      } else if (result.kind === 'forbidden') {
        setEditError('You do not have permission to edit this channel.');
      } else if (result.kind === 'notFound') {
        setEditError('Channel not found.');
      } else {
        setEditError("We couldn't update the channel. Please try again.");
      }
    } finally {
      setIsSavingEdit(false);
    }
  };

  const handleDeleteConfirm = async () => {
    if (!channel || !workspaceId) return;
    const result = await deleteChannel(getApiBaseUrl(), workspaceId, slug);
    setDeleteOpen(false);
    if (result.ok) {
      shell.channelState.removeChannel(channel.id);
      app.showToast(`#${channel.name} deleted`, 'success');
      push('/app');
      return;
    }
    if (result.kind === 'unauthenticated') {
      app.showToast('Session expired. Please sign in again.', 'error');
    } else {
      app.showToast(
        result.message ?? "We couldn't delete the channel. Please try again.",
        'error',
      );
    }
  };

  const handleLeaveConfirm = async () => {
    if (!channel || !workspaceId) return;
    const result = await leaveChannel(getApiBaseUrl(), workspaceId, slug);
    setLeaveOpen(false);
    if (result.ok) {
      shell.channelState.removeChannel(channel.id);
      app.showToast(`You left #${channel.name}`, 'success');
      push('/app');
      return;
    }
    if (result.kind === 'forbidden') {
      app.showToast('You do not have permission to leave this channel.', 'error');
    } else {
      app.showToast(
        result.message ?? "We couldn't leave the channel. Please try again.",
        'error',
      );
    }
  };

  // --- Channel load states ---
  if (shell.session.status === 'loading') {
    return (
      <StatusPanel title="Loading channel…" message="Checking your session." />
    );
  }
  if (shell.session.status === 'unauthenticated') {
    return (
      <StatusPanel
        title="Please sign in"
        message="You need to be signed in to view this channel."
        actionLabel="Go to sign in"
        onAction={() => push('/sign-in')}
      />
    );
  }
  if (channelQuery.state.status === 'loading' || channelQuery.state.status === 'idle') {
    return <StatusPanel title="Loading channel…" message="Fetching channel details." />;
  }
  if (channelQuery.state.status === 'notFound') {
    return (
      <StatusPanel
        title="Channel not found"
        message={`The channel #${slug} does not exist or you do not have permission to view it.`}
        actionLabel="Return to home"
        onAction={() => push('/app')}
      />
    );
  }
  if (channelQuery.state.status === 'unauthenticated') {
    return (
      <StatusPanel
        title="Please sign in"
        message="Your session has expired."
        actionLabel="Go to sign in"
        onAction={() => push('/sign-in')}
      />
    );
  }
  if (channelQuery.state.status === 'error') {
    return (
      <StatusPanel
        title="Couldn’t load channel"
        message={channelQuery.state.message}
        actionLabel="Try again"
        onAction={channelQuery.retry}
        icon={<RefreshCw className="w-6 h-6" />}
      />
    );
  }

  if (!channel || !channelWithState) {
    return (
      <StatusPanel
        title="Channel not found"
        message={`The channel #${slug} does not exist or you do not have permission to view it.`}
        actionLabel="Return to home"
        onAction={() => push('/app')}
      />
    );
  }

  // --- Messages state mapping ---
  const feedLoading = messages.state.status === 'loading' || messages.state.status === 'idle';
  let feedError: string | null = null;
  if (messages.state.status === 'error') feedError = messages.state.message;
  else if (messages.state.status === 'unauthenticated') feedError = 'Session expired.';
  else if (messages.state.status === 'channelNotFound')
    feedError = 'Channel no longer available.';

  const rootMessages =
    messages.state.status === 'ready'
      ? messages.state.messages.filter((m) => !m.parentMessageId)
      : [];
  const hasMore = messages.state.status === 'ready' ? messages.state.hasMore : false;

  const handleOpenThread = (message: Message) => {
    setActiveThread(message);
  };

  return (
    <main
      id="main-content"
      className="flex-1 flex flex-col h-full min-w-0 bg-white overflow-hidden relative"
    >
      {/* Channel Header */}
      <header className="h-14 px-4 sm:px-6 border-b border-[#E4E2DF] flex items-center justify-between gap-3 bg-white shrink-0 z-10">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="p-1.5 rounded-[6px] bg-[#F6F5F3] text-[#171A21] shrink-0 border border-[#E4E2DF]">
            {channel.type === 'PRIVATE' ? (
              <Lock className="w-3.5 h-3.5" />
            ) : (
              <Hash className="w-3.5 h-3.5" />
            )}
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h1 className="text-[15px] font-semibold text-[#171A21] truncate leading-tight">
                {channel.name}
              </h1>
              {channel.type === 'PRIVATE' && (
                <span className="text-[11px] font-medium text-[#737782] bg-[#F1F0EE] px-1.5 py-0.5 rounded border border-[#E4E2DF]">
                  Private
                </span>
              )}
            </div>
            {channel.topic && (
              <p className="text-[12px] text-[#737782] truncate max-w-md hidden sm:block">
                {channel.topic}
              </p>
            )}
          </div>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          <button
            type="button"
            onClick={() => app.setChannelMembersOpen(true)}
            className="flex items-center gap-1.5 px-2.5 py-1.5 text-[12px] font-medium text-[#4F5360] hover:text-[#171A21] hover:bg-[#F1F0EE] rounded-[8px] border border-[#E4E2DF] transition-colors focus-visible:ring-2 focus-visible:ring-[#3157D5]"
            aria-label={`View members in #${channel.name}`}
          >
            <Users className="w-3.5 h-3.5 text-[#737782]" />
            <span className="tabular-nums font-semibold">
              {memberCount === undefined ? '…' : memberCount}
            </span>
          </button>

          <button
            type="button"
            onClick={() => void shell.toggleChannelStar(channelWithState)}
            className={`p-2 rounded-[8px] transition-colors ${
              userState.isStarred
                ? 'text-amber-500 fill-amber-500'
                : 'text-[#737782] hover:text-[#171A21] hover:bg-[#F1F0EE]'
            }`}
            title={userState.isStarred ? 'Remove star' : 'Star channel'}
            aria-label={userState.isStarred ? 'Remove star' : 'Star channel'}
          >
            <Star className="w-4 h-4" />
          </button>

          <div className="relative">
            <button
              type="button"
              onClick={() => setMenuOpen(!isMenuOpen)}
              className="p-2 rounded-[8px] text-[#737782] hover:text-[#171A21] hover:bg-[#F1F0EE] transition-colors focus-visible:ring-2 focus-visible:ring-[#3157D5]"
              aria-label="Channel actions menu"
              aria-haspopup="menu"
              aria-expanded={isMenuOpen}
            >
              <MoreVertical className="w-4 h-4" />
            </button>

            {isMenuOpen && (
              <div
                role="menu"
                className="absolute right-0 top-11 w-56 bg-white border border-[#E4E2DF] rounded-[10px] shadow-[0_12px_32px_rgba(20,24,32,0.12)] p-1 z-50 animate-in fade-in zoom-in-95 duration-100"
              >
                {canEdit && (
                  <button
                    role="menuitem"
                    onClick={handleOpenEdit}
                    className="w-full text-left px-3 py-2 text-[13px] text-[#171A21] hover:bg-[#F1F0EE] rounded-[6px] flex items-center gap-2 transition-colors"
                  >
                    <Edit2 className="w-3.5 h-3.5 text-[#737782]" />
                    <span>Edit channel #{channel.name}</span>
                  </button>
                )}

                <button
                  role="menuitem"
                  onClick={() => {
                    setMenuOpen(false);
                    void shell.toggleChannelMute(channelWithState);
                  }}
                  className="w-full text-left px-3 py-2 text-[13px] text-[#171A21] hover:bg-[#F1F0EE] rounded-[6px] flex items-center gap-2 transition-colors"
                >
                  <BellOff className="w-3.5 h-3.5 text-[#737782]" />
                  <span>
                    {userState.isMuted ? `Unmute #${channel.name}` : `Mute #${channel.name}`}
                  </span>
                </button>

                <div className="my-1 border-t border-[#E4E2DF]" />

                <button
                  role="menuitem"
                  onClick={() => {
                    setMenuOpen(false);
                    setLeaveOpen(true);
                  }}
                  className="w-full text-left px-3 py-2 text-[13px] text-[#C94A45] hover:bg-rose-50 rounded-[6px] flex items-center gap-2 transition-colors"
                >
                  <LogOut className="w-3.5 h-3.5 text-[#C94A45]" />
                  <span>Leave #{channel.name}</span>
                </button>

                {canEdit && (
                  <button
                    role="menuitem"
                    onClick={() => {
                      setMenuOpen(false);
                      setDeleteOpen(true);
                    }}
                    className="w-full text-left px-3 py-2 text-[13px] text-[#C94A45] hover:bg-rose-50 rounded-[6px] flex items-center gap-2 transition-colors"
                  >
                    <Trash2 className="w-3.5 h-3.5 text-[#C94A45]" />
                    <span>Delete #{channel.name}</span>
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      </header>

      {/* Main Body: Message Feed + Thread Panel */}
      <div className="flex-1 flex min-h-0 overflow-hidden">
        <div className="flex-1 flex flex-col min-w-0 h-full">
          <MessageFeed
            messages={rootMessages}
            isLoading={feedLoading}
            error={feedError}
            onRetry={messages.retry}
            onOpenThread={handleOpenThread}
            onEditMessage={messages.edit}
            onDeleteMessage={messages.remove}
            onRemoveAttachment={messages.removeAttachment}
            hasMore={hasMore}
            isLoadingOlder={messages.isLoadingOlder}
            onLoadOlder={() => void messages.loadOlder()}
            loadOlderError={messages.loadOlderError}
            emptyTitle={`Welcome to #${channel.name}`}
            emptyDescription={
              channel.description ||
              'This is the start of the conversation. Send a message to get started.'
            }
          />

          <div className="px-3 sm:px-4 bg-white border-t border-[#E4E2DF]">
            <TypingIndicator typingUserIds={typing.typingUserIds} members={typingMembers} />
          </div>

          <div className="p-3 sm:p-4 bg-white">
            <MessageComposer
              placeholder={`Message #${channel.name}`}
              onSendMessage={handleSendMessage}
              mentionMembers={mentionMembers}
              onTypingChange={typing.handleInputChange}
              onSendComplete={typing.handleStopTyping}
              draftContext={
                workspaceId
                  ? {
                      workspaceId,
                      targetKind: 'CHANNEL',
                      targetId: channel.id,
                    }
                  : null
              }
            />
          </div>
        </div>

        {activeThread && (
          <ThreadPanel
            rootMessage={activeThread}
            channelId={channelId}
            onClose={() => setActiveThread(null)}
            mentionMembers={mentionMembers}
          />
        )}
      </div>

      <ChannelMembersDialog channel={channel} />

      {/* Edit Channel Dialog */}
      <Dialog
        isOpen={isEditOpen}
        onClose={() => setEditOpen(false)}
        title={`Edit channel #${channel.name}`}
        description="Update channel topic, details, or handle."
        initialFocusRef={editInputRef}
      >
        <form onSubmit={(e) => void handleSaveEdit(e)} className="space-y-4">
          <AuthField
            ref={editInputRef}
            label="Channel name"
            prefixText="#"
            value={editName}
            onChange={(e) => {
              setEditName(e.target.value);
              if (editError) setEditError('');
            }}
            error={editError}
            required
          />

          <AuthField
            label="Topic"
            value={editTopic}
            onChange={(e) => setEditTopic(e.target.value)}
            placeholder="What is this channel about?"
          />

          <div className="flex flex-col gap-1.5">
            <label htmlFor="edit-desc" className="text-[13px] font-semibold text-[#171A21]">
              Description
            </label>
            <textarea
              id="edit-desc"
              rows={3}
              value={editDescription}
              onChange={(e) => setEditDescription(e.target.value)}
              className="w-full px-3 py-2 text-[14px] text-[#171A21] bg-white border border-[#E4E2DF] rounded-[8px] outline-none resize-none focus-visible:border-[#3157D5] focus-visible:ring-2 focus-visible:ring-[#EEF2FF]"
            />
          </div>

          <div className="flex items-center justify-end gap-2 pt-4 border-t border-[#E4E2DF]">
            <button
              type="button"
              onClick={() => setEditOpen(false)}
              className="px-4 py-2 text-[13px] font-medium text-[#4F5360] hover:text-[#171A21] hover:bg-[#F1F0EE] rounded-[8px] border border-[#E4E2DF] transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSavingEdit}
              className="px-4 py-2 text-[13px] font-semibold text-white bg-[#2E3440] hover:bg-[#1E222A] rounded-[8px] transition-colors shadow-2xs disabled:opacity-50"
            >
              {isSavingEdit ? 'Saving…' : 'Save changes'}
            </button>
          </div>
        </form>
      </Dialog>

      {/* Leave Channel Confirm */}
      <Dialog
        isOpen={isLeaveOpen}
        onClose={() => setLeaveOpen(false)}
        title={`Leave #${channel.name}?`}
        description={`Are you sure you want to leave #${channel.name}? You will no longer receive notifications or updates from this channel.`}
        role="alertdialog"
      >
        <div className="flex items-center justify-end gap-2 pt-2">
          <button
            type="button"
            onClick={() => setLeaveOpen(false)}
            className="px-4 py-2 text-[13px] font-medium text-[#4F5360] hover:text-[#171A21] hover:bg-[#F1F0EE] rounded-[8px] border border-[#E4E2DF] transition-colors"
          >
            Stay in #{channel.name}
          </button>
          <button
            type="button"
            onClick={() => void handleLeaveConfirm()}
            className="px-4 py-2 text-[13px] font-semibold text-white bg-[#C94A45] hover:bg-rose-700 rounded-[8px] transition-colors"
          >
            Leave #{channel.name}
          </button>
        </div>
      </Dialog>

      {/* Delete Channel Confirm */}
      <Dialog
        isOpen={isDeleteOpen}
        onClose={() => setDeleteOpen(false)}
        title={`Delete #${channel.name}?`}
        description={`This will permanently delete #${channel.name} and all ${rootMessages.length} messages and attachments. This action cannot be undone.`}
        role="alertdialog"
      >
        <div className="p-3 bg-rose-50 border border-rose-200 rounded-[8px] text-[13px] text-[#C94A45] mb-4 flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          <span>All messages in this channel will be purged immediately.</span>
        </div>

        <div className="flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={() => setDeleteOpen(false)}
            className="px-4 py-2 text-[13px] font-medium text-[#4F5360] hover:text-[#171A21] hover:bg-[#F1F0EE] rounded-[8px] border border-[#E4E2DF] transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => void handleDeleteConfirm()}
            className="px-4 py-2 text-[13px] font-semibold text-white bg-[#C94A45] hover:bg-rose-700 rounded-[8px] transition-colors"
          >
            Permanently delete #{channel.name}
          </button>
        </div>
      </Dialog>
    </main>
  );
};
