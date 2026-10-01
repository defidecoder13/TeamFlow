import React, { useState } from 'react';
import { useApp } from '../context/AppContext';
import { useRouter } from '../hooks/useRouter';
import { MessageFeed } from '../components/feed/MessageFeed';
import { MessageComposer } from '../components/feed/MessageComposer';
import { ThreadPanel } from '../components/feed/ThreadPanel';
import { ChannelMembersDialog } from '../components/shell/ChannelMembersDialog';
import { Users, MessageCircleOff } from 'lucide-react';
import { Attachment } from '../types';

export const DmView: React.FC<{ conversationId: string }> = ({ conversationId }) => {
  const {
    dms,
    messages,
    sendMessage,
    openThread,
    activeThread,
    members,
    currentUser,
    setChannelMembersOpen,
  } = useApp();

  const { push } = useRouter();
  const [isLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const conversation = dms.find((d) => d.id === conversationId);

  if (!conversation) {
    return (
      <main id="main-content" className="flex-1 flex flex-col items-center justify-center p-8 text-center bg-[#FAF9F8]">
        <div className="w-12 h-12 rounded-full bg-[#F1F0EE] text-[#737782] flex items-center justify-center mb-3">
          <MessageCircleOff className="w-6 h-6" />
        </div>
        <h1 className="text-[20px] font-semibold text-[#171A21]">Conversation not found</h1>
        <p className="text-[13px] text-[#4F5360] mt-1 max-w-sm">
          This direct message does not exist or has been archived.
        </p>
        <button
          type="button"
          onClick={() => push('/app')}
          className="mt-4 px-4 py-2 text-[13px] font-medium text-white bg-[#2E3440] hover:bg-[#1E222A] rounded-[8px] transition-colors"
        >
          Return to home
        </button>
      </main>
    );
  }

  // Participants (excluding current user unless talking to self)
  const otherParticipantIds = conversation.participantIds.filter((id) => id !== currentUser.id);
  const otherMembers = members.filter((m) => otherParticipantIds.includes(m.id));
  const primaryOther = otherMembers[0] || currentUser;

  const conversationTitle =
    otherMembers.length > 0
      ? otherMembers.map((m) => m.name).join(', ')
      : `${currentUser.name} (you)`;

  // Conversation messages
  const dmMessages = messages.filter(
    (m) => m.conversationId === conversation.id && !m.parentId
  );

  const handleSendMessage = (content: string, attachments: Attachment[]) => {
    sendMessage({
      conversationId: conversation.id,
      content,
      attachments,
    });
  };

  return (
    <main id="main-content" className="flex-1 flex flex-col h-full min-w-0 bg-white overflow-hidden relative">
      {/* DM Header */}
      <header className="h-14 px-4 sm:px-6 border-b border-[#E4E2DF] flex items-center justify-between gap-3 bg-white shrink-0 z-10">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="relative shrink-0">
            {primaryOther.avatarUrl ? (
              <img
                src={primaryOther.avatarUrl}
                alt={primaryOther.name}
                className="w-8 h-8 rounded-full object-cover bg-[#ECEAE7]"
              />
            ) : (
              <div className="w-8 h-8 rounded-full bg-[#ECEAE7] text-[#171A21] text-[13px] font-semibold flex items-center justify-center">
                {conversationTitle.charAt(0)}
              </div>
            )}
            <span
              role="img"
              aria-label={`Status: ${primaryOther.presence}`}
              className={`absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2 border-white ${
                primaryOther.presence === 'online'
                  ? 'bg-[#48B88A]'
                  : primaryOther.presence === 'away'
                  ? 'bg-[#E8A33A]'
                  : 'bg-neutral-400'
              }`}
            />
          </div>

          <div className="min-w-0">
            <h1 className="text-[15px] font-semibold text-[#171A21] truncate leading-tight">
              {conversationTitle}
            </h1>
            <p className="text-[12px] text-[#737782] truncate">
              {primaryOther.title || 'Direct message'}
              {primaryOther.statusText && ` · ${primaryOther.statusText}`}
            </p>
          </div>
        </div>

        {/* Group members trigger */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setChannelMembersOpen(true)}
            className="flex items-center gap-1.5 px-2.5 py-1.5 text-[12px] font-medium text-[#4F5360] hover:text-[#171A21] hover:bg-[#F1F0EE] rounded-[8px] border border-[#E4E2DF] transition-colors focus-visible:ring-2 focus-visible:ring-[#3157D5]"
            aria-label={`View ${conversation.participantIds.length} participants`}
          >
            <Users className="w-3.5 h-3.5 text-[#737782]" />
            <span className="tabular-nums font-semibold">{conversation.participantIds.length}</span>
          </button>
        </div>
      </header>

      {/* Main Body */}
      <div className="flex-1 flex min-h-0 overflow-hidden">
        <div className="flex-1 flex flex-col min-w-0 h-full">
          <MessageFeed
            messages={dmMessages}
            isLoading={isLoading}
            error={error}
            onRetry={() => setError(null)}
            onOpenThread={openThread}
            emptyTitle={`This is the start of your conversation with ${primaryOther.name}`}
            emptyDescription="Direct messages are private to the participants in this thread."
          />

          <div className="p-3 sm:p-4 bg-white border-t border-[#E4E2DF]">
            <MessageComposer
              placeholder={`Message ${conversationTitle}`}
              onSendMessage={handleSendMessage}
            />
          </div>
        </div>

        {activeThread && <ThreadPanel />}
      </div>

      <ChannelMembersDialog conversation={conversation} />
    </main>
  );
};
