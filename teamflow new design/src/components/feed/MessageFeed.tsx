import React, { useState, useEffect, useRef } from 'react';
import { Message } from '../../types';
import { MessageItem } from './MessageItem';
import { MessageListSkeleton } from '../primitives/MessageListSkeleton';
import { ArrowDown, MessageSquareOff, AlertCircle, RefreshCw } from 'lucide-react';

interface MessageFeedProps {
  messages: Message[];
  isLoading?: boolean;
  error?: string | null;
  onRetry?: () => void;
  onOpenThread?: (message: Message) => void;
  emptyTitle?: string;
  emptyDescription?: string;
}

export const MessageFeed: React.FC<MessageFeedProps> = ({
  messages,
  isLoading = false,
  error = null,
  onRetry,
  onOpenThread,
  emptyTitle = 'No messages yet',
  emptyDescription = 'Start the conversation by sending a message below.',
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const bottomAnchorRef = useRef<HTMLDivElement>(null);
  const [showJumpToBottom, setShowJumpToBottom] = useState(false);
  const [announcerText, setAnnouncerText] = useState('');

  // Handle scroll detection for Jump-to-latest pill
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
    bottomAnchorRef.current?.scrollIntoView({ behavior });
    setShowJumpToBottom(false);
    setAnnouncerText('Scrolled to latest message.');
  };

  // Initial scroll to bottom on mount or when messages change
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
      {/* Screen reader live announcer */}
      <span className="sr-only" role="status" aria-live="polite">
        {announcerText}
      </span>

      {/* Messages list container */}
      <div
        ref={containerRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto px-2 sm:px-4 py-4 space-y-1"
        tabIndex={0}
        aria-label="Conversation messages"
      >
        {messages.map((message) => (
          <MessageItem
            key={message.id}
            message={message}
            onOpenThread={onOpenThread}
          />
        ))}
        <div ref={bottomAnchorRef} aria-hidden="true" />
      </div>

      {/* Jump to latest pill */}
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
