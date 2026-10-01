import React, { useEffect, useRef } from 'react';
import { useApp } from '../../context/AppContext';
import { MessageItem } from './MessageItem';
import { MessageComposer } from './MessageComposer';
import { X, MessageSquare } from 'lucide-react';
import { Attachment } from '../../types';

export const ThreadPanel: React.FC = () => {
  const { activeThread, closeThread, messages, sendMessage } = useApp();
  const panelRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (activeThread) {
      // Focus close button or panel for accessibility
      closeButtonRef.current?.focus();

      const handleKeyDown = (e: KeyboardEvent) => {
        if (e.key === 'Escape') {
          closeThread();
        }
      };
      window.addEventListener('keydown', handleKeyDown);
      return () => window.removeEventListener('keydown', handleKeyDown);
    }
  }, [activeThread, closeThread]);

  if (!activeThread) return null;

  // Find all replies to this thread
  const replies = messages.filter((m) => m.parentId === activeThread.id);

  const handleSendReply = (content: string, attachments: Attachment[]) => {
    sendMessage({
      channelId: activeThread.channelId,
      conversationId: activeThread.conversationId,
      content,
      attachments,
      parentId: activeThread.id,
    });
  };

  return (
    <aside
      ref={panelRef}
      role="complementary"
      aria-label="Thread replies"
      className="w-full sm:w-[380px] lg:w-[420px] shrink-0 bg-white border-l border-[#E4E2DF] flex flex-col h-full z-20 shadow-[-4px_0_16px_rgba(20,24,32,0.03)]"
    >
      {/* Header */}
      <div className="h-14 px-4 border-b border-[#E4E2DF] flex items-center justify-between bg-white shrink-0">
        <div className="flex items-center gap-2">
          <MessageSquare className="w-4 h-4 text-[#737782]" />
          <h2 className="text-[14px] font-semibold text-[#171A21]">Thread</h2>
          <span className="text-[12px] text-[#737782] tabular-nums">
            ({replies.length} {replies.length === 1 ? 'reply' : 'replies'})
          </span>
        </div>
        <button
          ref={closeButtonRef}
          type="button"
          onClick={closeThread}
          className="p-1.5 rounded-[8px] text-[#737782] hover:text-[#171A21] hover:bg-[#F1F0EE] transition-colors focus-visible:ring-2 focus-visible:ring-[#3157D5]"
          aria-label="Close thread panel"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Thread Content */}
      <div className="flex-1 overflow-y-auto">
        {/* Root message */}
        <MessageItem message={activeThread} isThreadRoot />

        {/* Divider */}
        <div className="px-4 py-2 flex items-center gap-2">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-[#737782]">
            {replies.length === 0 ? 'No replies yet' : 'Replies'}
          </span>
          <div className="flex-1 h-[1px] bg-[#ECEAE7]" />
        </div>

        {/* Replies list */}
        <div className="space-y-1">
          {replies.map((reply) => (
            <MessageItem key={reply.id} message={reply} />
          ))}
        </div>
      </div>

      {/* Reply Composer */}
      <div className="p-3 border-t border-[#ECEAE7]/80 bg-white shrink-0">
        <MessageComposer
          placeholder="Reply in thread..."
          onSendMessage={handleSendReply}
          parentId={activeThread.id}
        />
      </div>
    </aside>
  );
};
