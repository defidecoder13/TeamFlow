import React, { useState, useEffect, useRef } from 'react';
import type { Message } from '../../../lib/messages';
import { MessageItem } from './MessageItem';
import { MessageListSkeleton } from '../primitives/MessageListSkeleton';
import { ArrowDown, MessageSquareOff, AlertCircle, RefreshCw, ChevronUp } from 'lucide-react';

interface MessageFeedProps {
  messages: Message[];
  isLoading?: boolean;
  error?: string | null;
  onRetry?: () => void;
  onOpenThread?: (message: Message) => void;
  onEditMessage?: (messageId: string, body: string) => Promise<{ ok: boolean; error?: string }>;
  onDeleteMessage?: (messageId: string) => Promise<{ ok: boolean; error?: string }>;
  onRemoveAttachment?: (messageId: string, attachmentId: string) => void;
  hasMore?: boolean;
  isLoadingOlder?: boolean;
  onLoadOlder?: () => void;
  loadOlderError?: string | null;
  emptyTitle?: string;
  emptyDescription?: string;
}

export const MessageFeed: React.FC<MessageFeedProps> = ({
  messages,
  isLoading = false,
  error = null,
  onRetry,
  onOpenThread,
  onEditMessage,
  onDeleteMessage,
  onRemoveAttachment,
  hasMore = false,
  isLoadingOlder = false,
  onLoadOlder,
  loadOlderError = null,
  emptyTitle = 'No messages yet',
  emptyDescription = 'Start the conversation by sending a message below.',
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const bottomAnchorRef = useRef<HTMLDivElement>(null);
  const [showJumpToBottom, setShowJumpToBottom] = useState(false);
  const [announcerText, setAnnouncerText] = useState('');

  const handleScroll = () => {
    if (!containerRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = containerRef.current;
    const distanceToBottom = scrollHeight - scrollTop - clientHeight;
    const isScrolledUp = distanceToBottom > 160;

    if (isScrolledUp !== showJumpToBottom) {
      setShowJumpToBottom(isScrolledUp);
      if (isScrolledUp) {
        setAnnouncerText('New messages available below. Jump button active.');
      }
    }
  };

  const scrollToBottom = (behavior: ScrollBehavior = 'smooth') => {
    // jsdom (tests) has no scrollIntoView; browsers always do.
    bottomAnchorRef.current?.scrollIntoView?.({ behavior });
    setShowJumpToBottom(false);
    setAnnouncerText('Scrolled to latest message.');
  };

  useEffect(() => {
    if (!showJumpToBottom) {
      scrollToBottom('instant');
    }
  }, [messages.length]);

  if (isLoading) {
    return <MessageListSkeleton count={6} />;
  }

  if (error) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-8 text-center" role="alert">
        <div className="w-12 h-12 rounded-full bg-red-50 text-[#ba1a1a] flex items-center justify-center mb-3">
          <AlertCircle className="w-6 h-6" />
        </div>
        <h3 className="text-[16px] font-semibold text-[#1a1b22]">{error}</h3>
        <p className="text-[13px] text-[#5f5e61] mt-1 max-w-sm">
          There was an issue connecting to the channel feed.
        </p>
        {onRetry && (
          <button
            type="button"
            onClick={onRetry}
            className="mt-4 px-4 py-2 text-[13px] font-medium text-white bg-black hover:bg-neutral-800 rounded-[8px] flex items-center gap-1.5 transition-colors focus-visible:ring-2 focus-visible:ring-[#1f44e4]"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>Try again</span>
          </button>
        )}
      </div>
    );
  }

  if (messages.length === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-8 text-center">
        <div className="w-12 h-12 rounded-full bg-[#f4f2fd] text-[#5f5e61] flex items-center justify-center mb-3">
          <MessageSquareOff className="w-6 h-6" />
        </div>
        <h3 className="text-[16px] font-semibold text-[#1a1b22]">{emptyTitle}</h3>
        <p className="text-[13px] text-[#5f5e61] mt-1 max-w-sm">{emptyDescription}</p>
      </div>
    );
  }

  return (
    <div className="relative flex-1 flex flex-col min-h-0">
      <span className="sr-only" role="status" aria-live="polite">
        {announcerText}
      </span>

      <div
        ref={containerRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto px-2 sm:px-4 py-4 space-y-1"
        tabIndex={0}
        aria-label="Conversation messages"
      >
        {hasMore && onLoadOlder && (
          <div className="flex flex-col items-center gap-1 pb-3">
            <button
              type="button"
              onClick={onLoadOlder}
              disabled={isLoadingOlder}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-[12px] font-medium text-[#4F5360] bg-white border border-[#E4E2DF] rounded-full hover:bg-[#F6F5F3] disabled:opacity-50 disabled:cursor-not-allowed transition-colors focus-visible:ring-2 focus-visible:ring-[#3157D5]"
            >
              <ChevronUp className="w-3.5 h-3.5" />
              <span>{isLoadingOlder ? 'Loading…' : 'Load earlier messages'}</span>
            </button>
            {loadOlderError && (
              <p className="text-[12px] text-[#C94A45]" role="alert">
                {loadOlderError}
              </p>
            )}
          </div>
        )}

        {messages.map((message) => (
          <MessageItem
            key={message.id}
            message={message}
            onOpenThread={onOpenThread}
            onEditMessage={onEditMessage}
            onDeleteMessage={onDeleteMessage}
            onRemoveAttachment={onRemoveAttachment}
          />
        ))}
        <div ref={bottomAnchorRef} aria-hidden="true" />
      </div>

      {showJumpToBottom && (
        <button
          type="button"
          onClick={() => scrollToBottom('smooth')}
          className="absolute bottom-4 right-6 z-20 flex items-center gap-1.5 px-3 py-1.5 bg-black text-white text-[12px] font-semibold rounded-full shadow-lg hover:bg-neutral-800 active:scale-95 transition-all duration-160 focus-visible:ring-2 focus-visible:ring-[#1f44e4]"
          aria-label="Jump to latest message"
        >
          <span>Jump to latest</span>
          <ArrowDown className="w-3.5 h-3.5" />
        </button>
      )}
    </div>
  );
};
