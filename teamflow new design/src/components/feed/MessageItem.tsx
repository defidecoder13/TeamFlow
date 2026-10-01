import React, { useState } from 'react';
import { Message } from '../../types';
import { useApp } from '../../context/AppContext';
import {
  MessageSquare,
  Smile,
  Copy,
  Check,
  Bookmark,
  FileText,
  Download,
  Image as ImageIcon,
} from 'lucide-react';

interface MessageItemProps {
  message: Message;
  onOpenThread?: (message: Message) => void;
  isThreadRoot?: boolean;
}

const QUICK_EMOJIS = ['👍', '❤️', '🎉', '🚀', '👀', '🔥'];

export const MessageItem: React.FC<MessageItemProps> = ({
  message,
  onOpenThread,
  isThreadRoot = false,
}) => {
  const { members, currentUser, toggleReaction, showToast } = useApp();
  const [copied, setCopied] = useState(false);
  const [isEmojiPickerOpen, setEmojiPickerOpen] = useState(false);
  const [isBookmarked, setIsBookmarked] = useState(false);

  const sender = members.find((m) => m.id === message.senderId) || {
    id: message.senderId,
    name: 'Teammate',
    avatarUrl: '',
    role: 'member',
    title: 'Team member',
    presence: 'offline',
  };

  const isSelf = sender.id === currentUser.id;

  const handleCopy = () => {
    navigator.clipboard.writeText(message.content);
    setCopied(true);
    showToast('Message copied to clipboard', 'info');
    setTimeout(() => setCopied(false), 1500);
  };

  const renderFormattedContent = (content: string) => {
    // Split by @mention or `code`
    const parts = content.split(/(@[a-zA-Z0-9_-]+|`[^`]+`)/g);

    return parts.map((part, i) => {
      if (part.startsWith('@')) {
        return (
          <mark
            key={i}
            className="bg-[#EEF2FF] text-[#3157D5] font-medium px-1 py-0.5 rounded-[4px] not-italic"
          >
            {part}
          </mark>
        );
      }
      if (part.startsWith('`') && part.endsWith('`')) {
        return (
          <code
            key={i}
            className="px-1.5 py-0.5 bg-[#F6F5F3] text-[#171A21] rounded-[4px] text-[13px] border border-[#E4E2DF]"
          >
            {part.slice(1, -1)}
          </code>
        );
      }
      return <span key={i}>{part}</span>;
    });
  };

  const formatFileSize = (bytes: number) => {
    if (bytes >= 1048576) {
      return (bytes / 1048576).toFixed(1) + ' MB';
    }
    return (bytes / 1024).toFixed(0) + ' KB';
  };

  return (
    <div
      className={`group relative flex items-start gap-3 px-4 py-2.5 hover:bg-[#FAF9F8] transition-colors rounded-[8px] ${
        isThreadRoot ? 'bg-[#F7F6F5]/60 border-b border-[#E4E2DF]' : ''
      }`}
    >
      {/* Sender Avatar with presence */}
      <div className="relative shrink-0 mt-0.5">
        <img
          src={sender.avatarUrl || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=100&auto=format&fit=crop&q=80'}
          alt={sender.name}
          referrerPolicy="no-referrer"
          className="w-9 h-9 rounded-[8px] object-cover bg-[#ECEAE7]"
        />
        <span
          role="img"
          aria-label={`Presence: ${sender.presence}`}
          className={`absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2 border-white ${
            sender.presence === 'online'
              ? 'bg-[#48B88A]'
              : sender.presence === 'away'
              ? 'bg-[#E8A33A]'
              : 'bg-neutral-400'
          }`}
        />
      </div>

      {/* Message content area */}
      <div className="flex-1 min-w-0">
        {/* Header row: Author + role + timestamp */}
        <div className="flex items-center gap-2 mb-1 flex-wrap">
          <span className="text-[14px] font-semibold text-[#171A21] hover:underline cursor-pointer">
            {sender.name}
          </span>
          {isSelf && (
            <span className="text-[11px] font-medium text-[#737782] bg-[#F1F0EE] px-1 rounded">
              You
            </span>
          )}
          {sender.role === 'owner' && (
            <span className="text-[10px] uppercase font-semibold text-[#737782] bg-[#F1F0EE] px-1 rounded border border-[#E4E2DF]">
              Owner
            </span>
          )}
          <time className="text-[12px] text-[#737782] tabular-nums">{message.createdAt}</time>
        </div>

        {/* Message body */}
        <div className="text-[14px] text-[#171A21] leading-relaxed whitespace-pre-wrap break-words">
          {renderFormattedContent(message.content)}
        </div>

        {/* Attachments preview */}
        {message.attachments && message.attachments.length > 0 && (
          <div className="mt-2.5 flex flex-wrap gap-2">
            {message.attachments.map((att) => {
              const isImage = att.type.startsWith('image/');
              return (
                <div
                  key={att.id}
                  className="flex items-center gap-2.5 p-2 bg-white border border-[#e3e1ec] rounded-[8px] shadow-2xs hover:border-[#c8c6d3] transition-colors max-w-sm"
                >
                  <div className="p-2 bg-[#f4f2fd] rounded-[6px] text-[#1f44e4]">
                    {isImage ? <ImageIcon className="w-4 h-4" /> : <FileText className="w-4 h-4" />}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-[13px] font-medium text-[#1a1b22] truncate">{att.name}</p>
                    <span className="text-[11px] text-[#5f5e61] tabular-nums">
                      {formatFileSize(att.sizeBytes)}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => showToast(`Downloading ${att.name}`, 'info')}
                    className="p-1 text-[#5f5e61] hover:text-[#1a1b22] rounded-[4px] hover:bg-[#f4f2fd]"
                    aria-label={`Download ${att.name}`}
                  >
                    <Download className="w-3.5 h-3.5" />
                  </button>
                </div>
              );
            })}
          </div>
        )}

        {/* Reactions row */}
        <div className="flex flex-wrap items-center gap-1.5 mt-2">
          {message.reactions.map((reaction) => {
            const hasReacted = reaction.users.includes(currentUser.id);
            return (
              <button
                key={reaction.emoji}
                type="button"
                onClick={() => toggleReaction(message.id, reaction.emoji)}
                aria-pressed={hasReacted}
                aria-label={`React with ${reaction.emoji}, count ${reaction.count}`}
                className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-[6px] text-[12px] font-medium transition-colors border ${
                  hasReacted
                    ? 'bg-[#EEF2FF] border-[#3157D5]/30 text-[#3157D5]'
                    : 'bg-white border-[#E4E2DF] text-[#4F5360] hover:bg-[#F6F5F3]'
                }`}
              >
                <span>{reaction.emoji}</span>
                <span className="tabular-nums font-semibold">{reaction.count}</span>
              </button>
            );
          })}

          {/* Thread indicator pill */}
          {!isThreadRoot && (message.replyCount || 0) > 0 && onOpenThread && (
            <button
              type="button"
              onClick={() => onOpenThread(message)}
              className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-[6px] text-[12px] font-medium text-[#3157D5] bg-[#EEF2FF] hover:bg-[#E0E7FF] transition-colors"
              aria-label={`${message.replyCount} replies in thread. Latest at ${message.lastReplyAt}`}
            >
              <MessageSquare className="w-3 h-3" />
              <span className="tabular-nums font-semibold">
                {message.replyCount} {message.replyCount === 1 ? 'reply' : 'replies'}
              </span>
              {message.lastReplyAt && (
                <span className="text-[#737782] font-normal tabular-nums">
                  · Last reply {message.lastReplyAt}
                </span>
              )}
            </button>
          )}
        </div>
      </div>

      {/* Floating Action Toolbar */}
      <div className="absolute top-2 right-4 flex items-center bg-white border border-[#E4E2DF] rounded-[8px] shadow-2xs p-0.5 gap-0.5 z-10 opacity-0 group-hover:opacity-100 sm:focus-within:opacity-100 transition-opacity">
        {/* Quick reaction popover */}
        <div className="relative">
          <button
            type="button"
            onClick={() => setEmojiPickerOpen(!isEmojiPickerOpen)}
            className="p-1.5 min-w-[32px] min-h-[32px] flex items-center justify-center rounded-[6px] text-[#737782] hover:text-[#171A21] hover:bg-[#F1F0EE] transition-colors"
            title="Add reaction"
            aria-label="Add reaction"
          >
            <Smile className="w-4 h-4" />
          </button>

          {isEmojiPickerOpen && (
            <div
              className="absolute right-0 top-9 bg-white border border-[#E4E2DF] rounded-[8px] shadow-[0_8px_24px_rgba(20,24,32,0.12)] p-1.5 flex items-center gap-1 z-30 animate-in fade-in zoom-in-95 duration-100"
              role="toolbar"
              aria-label="Emoji reactions"
            >
              {QUICK_EMOJIS.map((emoji) => (
                <button
                  key={emoji}
                  type="button"
                  onClick={() => {
                    toggleReaction(message.id, emoji);
                    setEmojiPickerOpen(false);
                  }}
                  className="w-7 h-7 flex items-center justify-center text-[15px] hover:bg-[#eeedf7] rounded-[4px] transition-transform active:scale-125"
                  aria-label={`React ${emoji}`}
                >
                  {emoji}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Reply in thread */}
        {!isThreadRoot && onOpenThread && (
          <button
            type="button"
            onClick={() => onOpenThread(message)}
            className="p-1.5 min-w-[32px] min-h-[32px] flex items-center justify-center rounded-[6px] text-[#5f5e61] hover:text-[#1a1b22] hover:bg-[#eeedf7] transition-colors"
            title="Reply in thread"
            aria-label="Reply in thread"
          >
            <MessageSquare className="w-4 h-4" />
          </button>
        )}

        {/* Copy text */}
        <button
          type="button"
          onClick={handleCopy}
          className="p-1.5 min-w-[32px] min-h-[32px] flex items-center justify-center rounded-[6px] text-[#5f5e61] hover:text-[#1a1b22] hover:bg-[#eeedf7] transition-colors"
          title="Copy text"
          aria-label="Copy text"
        >
          {copied ? <Check className="w-4 h-4 text-emerald-600" /> : <Copy className="w-4 h-4" />}
        </button>

        {/* Bookmark */}
        <button
          type="button"
          onClick={() => {
            setIsBookmarked(!isBookmarked);
            showToast(isBookmarked ? 'Bookmark removed' : 'Message bookmarked', 'info');
          }}
          className={`p-1.5 min-w-[32px] min-h-[32px] flex items-center justify-center rounded-[6px] transition-colors ${
            isBookmarked
              ? 'text-amber-500 fill-amber-500'
              : 'text-[#5f5e61] hover:text-[#1a1b22] hover:bg-[#eeedf7]'
          }`}
          title={isBookmarked ? 'Remove bookmark' : 'Bookmark message'}
          aria-label={isBookmarked ? 'Remove bookmark' : 'Bookmark message'}
        >
          <Bookmark className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};
