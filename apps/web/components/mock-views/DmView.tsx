import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useApp } from '../../lib/mock-context';
import { useShell } from '../../lib/shell-context';
import { useRouter } from '../../lib/mock-hooks/useRouter';
import { useDirectConversation } from '../../lib/use-direct-conversation';
import { useDirectMessages } from '../../lib/use-direct-messages';
import { useTyping } from '../../lib/use-typing';
import {
  consumeDeepLinkParams,
  useDeepLink,
  useSeekMessage,
} from '../../lib/use-deep-link';
import { uploadSingleAttachmentDraft, type AttachmentDraft } from '../../lib/attachments';
import type { Message, ParticipantProfile } from '../../lib/messages';
import type { MentionMember } from '../../lib/mentions';
import { MessageFeed } from '../mock-ui/feed/MessageFeed';
import { MessageComposer, type SendMessageResult } from '../mock-ui/feed/MessageComposer';
import { ThreadPanel } from '../mock-ui/feed/ThreadPanel';
import { ChannelMembersDialog } from '../mock-ui/shell/ChannelMembersDialog';
import { TypingIndicator } from '../app/TypingIndicator';
import { Users, MessageCircleOff, RefreshCw } from 'lucide-react';
import { Avatar } from '@/components/ui/Avatar';

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
        {icon ?? <MessageCircleOff className="w-6 h-6" />}
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

function otherParticipants(
  participants: ParticipantProfile[],
  currentUserId: string | null,
): ParticipantProfile[] {
  if (!currentUserId) return participants;
  const others = participants.filter((p) => p.id !== currentUserId);
  return others.length > 0 ? others : participants;
}

export const DmView: React.FC<{ conversationId: string }> = ({ conversationId }) => {
  const shell = useShell();
  const app = useApp();
  const { push } = useRouter();

  const currentUserId = shell.currentUser?.id ?? null;

  const conversationQuery = useDirectConversation(conversationId, currentUserId);
  const conversation =
    conversationQuery.state.status === 'ready' ? conversationQuery.state.conversation : null;

  const messages = useDirectMessages(conversationId);
  const typing = useTyping({ conversationId }, { currentUserId });

  const [activeThread, setActiveThread] = useState<Message | null>(null);

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

  const rootMessages =
    messages.state.status === 'ready'
      ? messages.state.messages.filter((m) => !m.parentMessageId)
      : [];
  const lastRootId =
    rootMessages.length > 0 ? rootMessages[rootMessages.length - 1].id : null;

  const markReadRef = useRef(messages.markRead);
  markReadRef.current = messages.markRead;
  const markLocalReadRef = useRef(shell.dmState.markConversationLocallyRead);
  markLocalReadRef.current = shell.dmState.markConversationLocallyRead;

  useEffect(() => {
    if (!lastRootId) return;
    markLocalReadRef.current(conversationId, lastRootId);
    void markReadRef.current(lastRootId);
  }, [conversationId, lastRootId]);

  const others = useMemo(
    () =>
      conversation
        ? otherParticipants(conversation.participants, currentUserId)
        : [],
    [conversation, currentUserId],
  );

  const isGroup = conversation?.type === 'GROUP';
  const primary = others[0] ?? null;

  const conversationTitle = useMemo(() => {
    if (!conversation) return '';
    if (conversation.name) return conversation.name;
    if (others.length === 0) {
      return shell.currentUser ? `${shell.currentUser.name} (you)` : 'Direct message';
    }
    return others.map((p) => p.name).join(', ');
  }, [conversation, others, shell.currentUser]);

  const primaryPresence = primary
    ? shell.presence.getPresence(primary.id)
    : null;

  const headerSubtitle = (() => {
    if (!conversation) return 'Direct message';
    if (isGroup) {
      const count = conversation.participantCount ?? conversation.participants.length;
      return `${count} participants`;
    }
    if (!primary) return 'Direct message';
    const online = primaryPresence?.status === 'ONLINE';
    return online ? 'Online' : 'Offline';
  })();

  const mentionMembers: MentionMember[] = useMemo(() => {
    if (!conversation) return [];
    return conversation.participants.map((p) => ({
      id: p.id,
      name: p.name,
      image: p.image,
      email: p.email,
    }));
  }, [conversation]);

  const typingMembers = useMemo(
    () =>
      conversation
        ? conversation.participants.map((p) => ({ id: p.id, name: p.name }))
        : [],
    [conversation],
  );

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

  // --- Conversation load states ---
  if (shell.session.status === 'loading') {
    return <StatusPanel title="Loading conversation…" message="Checking your session." />;
  }
  if (shell.session.status === 'unauthenticated') {
    return (
      <StatusPanel
        title="Please sign in"
        message="You need to be signed in to view this conversation."
        actionLabel="Go to sign in"
        onAction={() => push('/sign-in')}
      />
    );
  }
  if (
    conversationQuery.state.status === 'loading' ||
    conversationQuery.state.status === 'idle'
  ) {
    return (
      <StatusPanel title="Loading conversation…" message="Fetching direct messages." />
    );
  }
  if (conversationQuery.state.status === 'notFound') {
    return (
      <StatusPanel
        title="Conversation not found"
        message="This direct message does not exist or you no longer have access to it."
        actionLabel="Return to home"
        onAction={() => push('/app')}
      />
    );
  }
  if (conversationQuery.state.status === 'unauthenticated') {
    return (
      <StatusPanel
        title="Please sign in"
        message="Your session has expired."
        actionLabel="Go to sign in"
        onAction={() => push('/sign-in')}
      />
    );
  }
  if (conversationQuery.state.status === 'error') {
    return (
      <StatusPanel
        title="Couldn’t load conversation"
        message={conversationQuery.state.message}
        actionLabel="Try again"
        onAction={conversationQuery.retry}
        icon={<RefreshCw className="w-6 h-6" />}
      />
    );
  }
  if (!conversation) {
    return (
      <StatusPanel
        title="Conversation not found"
        message="This direct message does not exist or you no longer have access to it."
        actionLabel="Return to home"
        onAction={() => push('/app')}
      />
    );
  }

  // --- Messages state mapping ---
  const feedLoading =
    messages.state.status === 'loading' || messages.state.status === 'idle';
  let feedError: string | null = null;
  if (messages.state.status === 'error') feedError = messages.state.message;
  else if (messages.state.status === 'unauthenticated') feedError = 'Session expired.';
  else if (messages.state.status === 'notFound')
    feedError = 'Conversation no longer available.';

  const hasMore = messages.state.status === 'ready' ? messages.state.hasMore : false;
  const participantCount = conversation.participantCount ?? conversation.participants.length;
  const emptyTarget = primary?.name || conversationTitle || 'this conversation';

  return (
    <main
      id="main-content"
      className="flex-1 flex flex-col h-full min-w-0 bg-white overflow-hidden relative"
    >
      {/* DM Header */}
      <header className="h-14 px-4 sm:px-6 border-b border-[#E4E2DF] flex items-center justify-between gap-3 bg-white shrink-0 z-10">
        <div className="flex items-center gap-2.5 min-w-0">
          <Avatar
            name={conversationTitle || emptyTarget}
            src={primary?.image ?? null}
            size={34}
            presence={
              primaryPresence
                ? primaryPresence.status === 'ONLINE'
                  ? 'online'
                  : 'offline'
                : undefined
            }
            showPresence={!isGroup}
          />

          <div className="min-w-0">
            <h1 className="text-[15px] font-semibold text-[#171A21] truncate leading-tight">
              {conversationTitle}
            </h1>
            <p className="text-[12px] text-[#737782] truncate">{headerSubtitle}</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => app.setChannelMembersOpen(true)}
            className="flex items-center gap-1.5 px-2.5 py-1.5 text-[12px] font-medium text-[#4F5360] hover:text-[#171A21] hover:bg-[#F1F0EE] rounded-[8px] border border-[#E4E2DF] transition-colors focus-visible:ring-2 focus-visible:ring-[#3157D5]"
            aria-label={`View ${participantCount} participants`}
          >
            <Users className="w-3.5 h-3.5 text-[#737782]" />
            <span className="tabular-nums font-semibold">{participantCount}</span>
          </button>
        </div>
      </header>

      {/* Main Body */}
      <div className="flex-1 flex min-h-0 overflow-hidden">
        <div className="flex-1 flex flex-col min-w-0 h-full">
          <MessageFeed
            messages={rootMessages}
            isLoading={feedLoading}
            error={feedError}
            onRetry={messages.retry}
            onOpenThread={setActiveThread}
            onEditMessage={messages.edit}
            onDeleteMessage={messages.remove}
            onRemoveAttachment={messages.removeAttachment}
            hasMore={hasMore}
            isLoadingOlder={messages.isLoadingOlder}
            onLoadOlder={() => void messages.loadOlder()}
            loadOlderError={messages.loadOlderError}
            emptyTitle={`This is the start of your conversation with ${emptyTarget}`}
            emptyDescription="Direct messages are private to the participants in this conversation."
          />

          <div className="px-3 sm:px-4 bg-white border-t border-[#E4E2DF]">
            <TypingIndicator
              typingUserIds={typing.typingUserIds}
              members={typingMembers}
            />
          </div>

          <div className="p-3 sm:p-4 bg-white">
            <MessageComposer
              placeholder={`Message ${conversationTitle}`}
              onSendMessage={handleSendMessage}
              mentionMembers={mentionMembers}
              onTypingChange={typing.handleInputChange}
              onSendComplete={typing.handleStopTyping}
              draftContext={
                shell.currentWorkspace
                  ? {
                      workspaceId: shell.currentWorkspace.id,
                      targetKind: 'DIRECT_MESSAGE',
                      targetId: conversationId,
                    }
                  : null
              }
            />
          </div>
        </div>

        {activeThread && (
          <ThreadPanel
            rootMessage={activeThread}
            channelId={null}
            onClose={() => setActiveThread(null)}
            mentionMembers={mentionMembers}
          />
        )}
      </div>

      <ChannelMembersDialog
        directConversation={conversation}
        onDirectConversationChange={conversationQuery.setConversation}
      />
    </main>
  );
};
