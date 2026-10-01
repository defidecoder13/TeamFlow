import React, { useState } from 'react';
import type { Message } from '../../../lib/messages';
import { useApp } from '../../../lib/mock-context';
import { useShell } from '../../../lib/shell-context';
import { useMessageReactions } from '../../../lib/use-message-reactions';
import { fetchAttachmentDownloadUrl, formatFileSize } from '../../../lib/attachments';
import { formatMessageTime, formatRelativeTime } from '../../app/message-utils';
import { Avatar } from '@/components/ui/Avatar';
import {
  MessageSquare,
  Smile,
  Copy,
  Check,
  Bookmark,
  FileText,
  Download,
  Image as ImageIcon,
  Pencil,
  Trash2,
} from 'lucide-react';
import { Dialog } from '../primitives/Dialog';

interface MessageItemProps {
  message: Message;
  onOpenThread?: (message: Message) => void;
  onEditMessage?: (messageId: string, body: string) => Promise<{ ok: boolean; error?: string }>;
  onDeleteMessage?: (messageId: string) => Promise<{ ok: boolean; error?: string }>;
  onRemoveAttachment?: (messageId: string, attachmentId: string) => void;
  isThreadRoot?: boolean;
}

const QUICK_EMOJIS = ['👍', '❤️', '🎉', '🚀', '👀', '🔥'];

export const MessageItem: React.FC<MessageItemProps> = ({
  message,
  onOpenThread,
  onEditMessage,
  onDeleteMessage,
  onRemoveAttachment,
  isThreadRoot = false,
}) => {
  const { showToast } = useApp();
  const { currentUser, members, presence } = useShell();
  const currentUserId = currentUser?.id ?? null;

  const { reactions, toggleReaction } = useMessageReactions({
    messageId: message.id,
    currentUserId,
  });

  const [copied, setCopied] = useState(false);
  const [isEmojiPickerOpen, setEmojiPickerOpen] = useState(false);
  const [isBookmarked, setIsBookmarked] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editContent, setEditContent] = useState(message.body ?? '');
  const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const authorId = message.authorId;
  const workspaceMember =
    members.state.status === 'ready'
      ? members.state.members.find((m) => m.user.id === authorId)
      : undefined;
  const senderName = message.author?.name ?? workspaceMember?.user.name ?? 'Unknown';
  const senderImage = message.author?.image ?? workspaceMember?.user.image ?? null;
  const userPresence = presence.getPresence(authorId);
  const avatarPresence = userPresence.status === 'ONLINE' ? 'online' : 'offline';
  const isOwner = workspaceMember?.role === 'OWNER';

  const isSelf = currentUserId !== null && authorId === currentUserId;
  const canModify = isSelf;
  const isDeleted = message.body === null;
  const bodyText = message.body ?? '';

  const handleCopy = () => {
    if (isDeleted) return;
    navigator.clipboard.writeText(bodyText);
    setCopied(true);
    showToast('Message copied to clipboard', 'info');
    setTimeout(() => setCopied(false), 1500);
  };

  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editContent.trim()) {
      showToast('Message cannot be empty', 'error');
      return;
    }
    if (!onEditMessage) return;
    setIsSaving(true);
    try {
      const result = await onEditMessage(message.id, editContent.trim());
      if (result.ok) {
        setIsEditing(false);
      } else {
        showToast(result.error ?? 'Could not edit message', 'error');
      }
    } finally {
      setIsSaving(false);
    }
  };

  const handleCancelEdit = () => {
    setEditContent(bodyText);
    setIsEditing(false);
  };

  const handleDelete = async () => {
    if (!onDeleteMessage) {
      setIsDeleteConfirmOpen(false);
      return;
    }
    const result = await onDeleteMessage(message.id);
    if (!result.ok) {
      showToast(result.error ?? 'Could not delete message', 'error');
    }
    setIsDeleteConfirmOpen(false);
  };

  const handleDownload = async (attachmentId: string, name: string) => {
    const result = await fetchAttachmentDownloadUrl(attachmentId);
    if (result.ok) {
      window.open(result.url, '_blank', 'noopener,noreferrer');
      return;
    }
    showToast(result.error || `Could not download ${name}`, 'error');
  };

  const renderFormattedContent = (content: string) => {
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

  return (
    <div
      className={`group relative flex items-start gap-3 px-4 py-2.5 hover:bg-[#FAF9F8] transition-colors rounded-[8px] ${
        isThreadRoot ? 'bg-[#F7F6F5]/60 border-b border-[#E4E2DF]' : ''
      }`}
    >
      <div className="shrink-0 mt-0.5">
        <Avatar
          name={senderName}
          src={senderImage}
          size={36}
          presence={avatarPresence}
          showPresence
        />
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1 flex-wrap">
          <span className="text-[14px] font-semibold text-[#171A21] hover:underline cursor-pointer">
            {senderName}
          </span>
          {isSelf && (
            <span className="text-[11px] font-medium text-[#737782] bg-[#F1F0EE] px-1 rounded">
              You
            </span>
          )}
          {isOwner && (
            <span className="text-[10px] uppercase font-semibold text-[#737782] bg-[#F1F0EE] px-1 rounded border border-[#E4E2DF]">
              Owner
            </span>
          )}
          <time className="text-[12px] text-[#737782] tabular-nums">
            {formatMessageTime(message.createdAt)}
          </time>
          {message.editedAt && (
            <span className="text-[11px] text-[#737782] italic">
              (edited {formatMessageTime(message.editedAt)})
            </span>
          )}
        </div>

        {isEditing ? (
          <form onSubmit={handleSaveEdit} className="mt-1 space-y-2">
            <textarea
              rows={2}
              value={editContent}
              onChange={(e) => setEditContent(e.target.value)}
              className="w-full px-3 py-2 text-[14px] text-[#171A21] bg-white border border-[#3157D5] rounded-[8px] outline-none ring-2 ring-[#EEF2FF] resize-none"
              autoFocus
            />
            <div className="flex items-center gap-2">
              <button
                type="submit"
                disabled={isSaving}
                className="px-3 py-1 bg-[#2E3440] text-white text-[12px] font-medium rounded-[6px] hover:bg-[#1E222A] transition-colors disabled:opacity-50"
              >
                {isSaving ? 'Saving…' : 'Save'}
              </button>
              <button
                type="button"
                onClick={handleCancelEdit}
                className="px-3 py-1 bg-white border border-[#E4E2DF] text-[#4F5360] hover:text-[#171A21] hover:bg-[#F1F0EE] text-[12px] font-medium rounded-[6px] transition-colors"
              >
                Cancel
              </button>
              <span className="text-[11px] text-[#737782] ml-2">
                escape to cancel · enter to save
              </span>
            </div>
          </form>
        ) : isDeleted ? (
          <div className="text-[14px] text-[#737782] italic leading-relaxed">
            Message deleted
          </div>
        ) : (
          <div className="text-[14px] text-[#171A21] leading-relaxed whitespace-pre-wrap break-words">
            {renderFormattedContent(bodyText)}
          </div>
        )}

        {message.attachments && message.attachments.length > 0 && (
          <div className="mt-2.5 flex flex-wrap gap-2">
            {message.attachments.map((att) => {
              const isImage = att.mimeType.startsWith('image/');
              return (
                <div
                  key={att.id}
                  className="flex items-center gap-2.5 p-2 bg-white border border-[#E4E2DF] rounded-[8px] shadow-2xs hover:border-[#D2D0CC] transition-colors max-w-sm"
                >
                  <div className="p-2 bg-[#EEF2FF] rounded-[6px] text-[#3157D5]">
                    {isImage ? <ImageIcon className="w-4 h-4" /> : <FileText className="w-4 h-4" />}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-[13px] font-medium text-[#171A21] truncate">
                      {att.originalName}
                    </p>
                    <span className="text-[11px] text-[#737782] tabular-nums">
                      {formatFileSize(att.size)}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleDownload(att.id, att.originalName)}
                    className="p-1 text-[#737782] hover:text-[#171A21] rounded-[4px] hover:bg-[#F1F0EE]"
                    aria-label={`Download ${att.originalName}`}
                  >
                    <Download className="w-3.5 h-3.5" />
                  </button>
                  {onRemoveAttachment && isSelf && (
                    <button
                      type="button"
                      onClick={() => onRemoveAttachment(message.id, att.id)}
                      className="p-1 text-[#737782] hover:text-[#C94A45] rounded-[4px] hover:bg-rose-50"
                      aria-label={`Remove ${att.originalName}`}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}

        <div className="flex flex-wrap items-center gap-1.5 mt-2">
          {reactions.map((reaction) => (
            <button
              key={reaction.emoji}
              type="button"
              onClick={() => {
                void toggleReaction(reaction.emoji);
              }}
              aria-pressed={reaction.reacted}
              aria-label={`React with ${reaction.emoji}, count ${reaction.count}`}
              className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-[6px] text-[12px] font-medium transition-colors border ${
                reaction.reacted
                  ? 'bg-[#EEF2FF] border-[#3157D5]/30 text-[#3157D5]'
                  : 'bg-white border-[#E4E2DF] text-[#4F5360] hover:bg-[#F6F5F3]'
              }`}
            >
              <span>{reaction.emoji}</span>
              <span className="tabular-nums font-semibold">{reaction.count}</span>
            </button>
          ))}

          {!isThreadRoot && (message.replyCount || 0) > 0 && onOpenThread && (
            <button
              type="button"
              onClick={() => onOpenThread(message)}
              className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-[6px] text-[12px] font-medium text-[#3157D5] bg-[#EEF2FF] hover:bg-[#E0E7FF] transition-colors"
              aria-label={`${message.replyCount} replies in thread`}
            >
              <MessageSquare className="w-3 h-3" />
              <span className="tabular-nums font-semibold">
                {message.replyCount} {message.replyCount === 1 ? 'reply' : 'replies'}
              </span>
              {message.latestReplyAt && (
                <span className="text-[#737782] font-normal tabular-nums">
                  · Last reply {formatRelativeTime(message.latestReplyAt)}
                </span>
              )}
            </button>
          )}
        </div>
      </div>

      {!isDeleted && (
        <div className="absolute top-2 right-4 flex items-center bg-white border border-[#E4E2DF] rounded-[8px] shadow-2xs p-0.5 gap-0.5 z-10 opacity-0 group-hover:opacity-100 sm:focus-within:opacity-100 transition-opacity">
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
                      void toggleReaction(emoji);
                      setEmojiPickerOpen(false);
                    }}
                    className="w-7 h-7 flex items-center justify-center text-[15px] hover:bg-[#F1F0EE] rounded-[4px] transition-transform active:scale-125"
                    aria-label={`React ${emoji}`}
                  >
                    {emoji}
                  </button>
                ))}
              </div>
            )}
          </div>

          {!isThreadRoot && onOpenThread && (
            <button
              type="button"
              onClick={() => onOpenThread(message)}
              className="p-1.5 min-w-[32px] min-h-[32px] flex items-center justify-center rounded-[6px] text-[#737782] hover:text-[#171A21] hover:bg-[#F1F0EE] transition-colors"
              title="Reply in thread"
              aria-label="Reply in thread"
            >
              <MessageSquare className="w-4 h-4" />
            </button>
          )}

          {canModify && !isEditing && (
            <button
              type="button"
              onClick={() => {
                setEditContent(bodyText);
                setIsEditing(true);
              }}
              className="p-1.5 min-w-[32px] min-h-[32px] flex items-center justify-center rounded-[6px] text-[#737782] hover:text-[#171A21] hover:bg-[#F1F0EE] transition-colors"
              title="Edit message"
              aria-label="Edit message"
            >
              <Pencil className="w-4 h-4" />
            </button>
          )}

          <button
            type="button"
            onClick={handleCopy}
            className="p-1.5 min-w-[32px] min-h-[32px] flex items-center justify-center rounded-[6px] text-[#737782] hover:text-[#171A21] hover:bg-[#F1F0EE] transition-colors"
            title="Copy text"
            aria-label="Copy text"
          >
            {copied ? <Check className="w-4 h-4 text-emerald-600" /> : <Copy className="w-4 h-4" />}
          </button>

          <button
            type="button"
            onClick={() => {
              setIsBookmarked(!isBookmarked);
              showToast(isBookmarked ? 'Bookmark removed' : 'Message bookmarked', 'info');
            }}
            className={`p-1.5 min-w-[32px] min-h-[32px] flex items-center justify-center rounded-[6px] transition-colors ${
              isBookmarked
                ? 'text-amber-500 fill-amber-500'
                : 'text-[#737782] hover:text-[#171A21] hover:bg-[#F1F0EE]'
            }`}
            title={isBookmarked ? 'Remove bookmark' : 'Bookmark message'}
            aria-label={isBookmarked ? 'Remove bookmark' : 'Bookmark message'}
          >
            <Bookmark className="w-4 h-4" />
          </button>

          {canModify && (
            <button
              type="button"
              onClick={() => setIsDeleteConfirmOpen(true)}
              className="p-1.5 min-w-[32px] min-h-[32px] flex items-center justify-center rounded-[6px] text-[#737782] hover:text-[#C94A45] hover:bg-rose-50 transition-colors"
              title="Delete message"
              aria-label="Delete message"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          )}
        </div>
      )}

      <Dialog
        isOpen={isDeleteConfirmOpen}
        onClose={() => setIsDeleteConfirmOpen(false)}
        title="Delete message?"
        description="Are you sure you want to delete this message? This cannot be undone."
        role="alertdialog"
      >
        <div className="flex items-center justify-end gap-2 pt-2">
          <button
            type="button"
            onClick={() => setIsDeleteConfirmOpen(false)}
            className="px-4 py-2 text-[13px] font-medium text-[#4F5360] hover:text-[#171A21] rounded-[8px]"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => void handleDelete()}
            className="px-4 py-2 text-[13px] font-semibold text-white bg-[#C94A45] hover:bg-rose-700 rounded-[8px] transition-colors"
          >
            Delete message
          </button>
        </div>
      </Dialog>
    </div>
  );
};
