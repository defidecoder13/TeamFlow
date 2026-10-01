import React from 'react';
import { useApp } from '../context/AppContext';
import { useRouter } from '../hooks/useRouter';
import { AtSign, Hash, ArrowRight, Clock, MessageSquare } from 'lucide-react';

export const MentionsView: React.FC = () => {
  const { messages, channels, members, dms, openThread, currentUser } = useApp();
  const { push } = useRouter();

  // Find all messages containing an @mention or directed to user
  const mentionMessages = messages.filter(
    (m) =>
      m.content.includes('@') ||
      m.content.toLowerCase().includes(currentUser.name.toLowerCase().split(' ')[0])
  );

  const getDestination = (message: (typeof messages)[0]) => {
    if (message.channelId) {
      const channel = channels.find((c) => c.id === message.channelId);
      return {
        type: 'channel',
        name: channel ? `#${channel.name}` : '#channel',
        slug: channel?.slug,
      };
    }
    if (message.conversationId) {
      const dm = dms.find((d) => d.id === message.conversationId);
      const otherId = dm?.participantIds.find((id) => id !== currentUser.id);
      const other = members.find((m) => m.id === otherId);
      return {
        type: 'dm',
        name: other ? `@${other.name}` : 'Direct message',
        conversationId: dm?.id,
      };
    }
    return { type: 'unknown', name: 'Message' };
  };

  const handleJumpToMessage = (message: (typeof messages)[0]) => {
    const dest = getDestination(message);
    if (dest.type === 'channel' && dest.slug) {
      push(`/app/channels/${dest.slug}`);
      if (message.parentId) {
        const parent = messages.find((m) => m.id === message.parentId);
        if (parent) openThread(parent);
      }
    } else if (dest.type === 'dm' && dest.conversationId) {
      push(`/app/dms/${dest.conversationId}`);
      if (message.parentId) {
        const parent = messages.find((m) => m.id === message.parentId);
        if (parent) openThread(parent);
      }
    }
  };

  return (
    <main id="main-content" className="flex-1 flex flex-col h-full min-w-0 bg-[#FAF9F8] overflow-y-auto">
      {/* Minimal Header */}
      <header className="h-14 px-4 sm:px-6 border-b border-[#E4E2DF] flex items-center justify-between gap-3 bg-white shrink-0 z-10">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="p-1.5 rounded-[6px] bg-[#F6F5F3] text-[#171A21] shrink-0 border border-[#E4E2DF]">
            <AtSign className="w-3.5 h-3.5" />
          </div>
          <h1 className="text-[15px] font-semibold text-[#171A21] tracking-tight">Mentions</h1>
        </div>
        {mentionMessages.length > 0 && (
          <span className="text-[11px] font-semibold text-[#737782] bg-[#F1F0EE] px-2 py-0.5 rounded-[6px] border border-[#E4E2DF] tabular-nums">
            {mentionMessages.length}
          </span>
        )}
      </header>

      {/* Body */}
      <div className="p-6 max-w-4xl w-full mx-auto">
        {mentionMessages.length === 0 ? (
          <div className="p-12 text-center bg-white border border-[#E4E2DF] rounded-[12px] shadow-2xs">
            <div className="w-12 h-12 rounded-full bg-[#F1F0EE] text-[#737782] flex items-center justify-center mx-auto mb-3">
              <AtSign className="w-6 h-6" />
            </div>
            <h2 className="text-[16px] font-semibold text-[#171A21]">No mentions yet</h2>
            <p className="text-[13px] text-[#4F5360] mt-1 max-w-sm mx-auto">
              When teammates tag you with @alex or reference your handle, their messages will appear here.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {mentionMessages.map((msg) => {
              const sender = members.find((m) => m.id === msg.senderId) || {
                name: 'Teammate',
                avatarUrl: '',
              };
              const dest = getDestination(msg);

              return (
                <div
                  key={msg.id}
                  onClick={() => handleJumpToMessage(msg)}
                  className="p-4 bg-white border border-[#E4E2DF] rounded-[12px] shadow-2xs hover:border-[#D2D0CC] hover:shadow-xs transition-all cursor-pointer group"
                >
                  <div className="flex items-center justify-between gap-3 mb-2.5">
                    <div className="flex items-center gap-2">
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-[6px] text-[12px] font-medium bg-[#EEF2FF] text-[#3157D5] border border-[#3157D5]/20">
                        {dest.name}
                      </span>
                      <span className="text-[12px] text-[#737782]">{sender.name}</span>
                    </div>

                    <div className="flex items-center gap-1.5 text-[12px] text-[#737782]">
                      <Clock className="w-3.5 h-3.5" />
                      <span className="tabular-nums">{msg.createdAt}</span>
                    </div>
                  </div>

                  <div className="flex items-start gap-3">
                    <img
                      src={
                        sender.avatarUrl ||
                        'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=100&auto=format&fit=crop&q=80'
                      }
                      alt=""
                      className="w-7 h-7 rounded-[6px] object-cover bg-[#ECEAE7] shrink-0 mt-0.5"
                    />
                    <div className="flex-1 min-w-0">
                      <p className="text-[14px] text-[#171A21] leading-relaxed">
                        {msg.content}
                      </p>
                    </div>
                  </div>

                  <div className="mt-3 pt-3 border-t border-[#ECEAE7] flex items-center justify-between">
                    <span className="text-[12px] text-[#737782]">
                      {msg.parentId ? 'In thread discussion' : 'In channel feed'}
                    </span>

                    <span className="text-[12px] font-medium text-[#4F5360] group-hover:text-[#171A21] flex items-center gap-1 transition-colors">
                      <span>Jump to message</span>
                      <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform" />
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </main>
  );
};
