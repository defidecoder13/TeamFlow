'use client';

import { memo, useState } from 'react';
import type { Message } from '../../lib/messages';
import { UserAvatar } from './UserAvatar';
import { formatMessageTime, formatThreadSummary, isConsecutiveSameAuthor } from './message-utils';
import { MessageActionsMenu } from './message-actions';
import { PencilIcon, SmileyIcon, ThreadsIcon, TrashIcon } from './icons';
import { useMessageReactions } from '../../lib/use-message-reactions';
import { MessageReactions } from './MessageReactions';
import { EmojiPicker } from './EmojiPicker';
import { AttachmentDisplay } from './AttachmentDisplay';

interface MessageRowProps {
  message: Message;
  currentUserId?: string | null;
  isCurrentUser: boolean;
  showTimestamp: boolean;
  previousMessage?: Message | null;
  isSelected?: boolean;
  /** Search deep-link highlight: amber ring identifying the linked message. */
  highlighted?: boolean;
  onEdit?: (messageId: string) => void;
  onDelete?: (messageId: string) => void;
  onReplyInThread?: (message: Message) => void;
}

function MessageRowInner({
  message,
  currentUserId,
  isCurrentUser,
  showTimestamp,
  previousMessage,
  isSelected,
  highlighted,
  onEdit,
  onDelete,
  onReplyInThread,
}: MessageRowProps) {
  const [menuProps, setMenuProps] = useState<{
    onEdit: () => void;
    onDelete: () => void;
  } | null>(null);

  const { reactions, error, toggleReaction, addReaction, clearError } = useMessageReactions({
    messageId: message.id,
    currentUserId,
  });
  const [isToolbarPickerOpen, setIsToolbarPickerOpen] = useState(false);

  const consecutive = previousMessage ? isConsecutiveSameAuthor(previousMessage, message) : false;
  const isRootMessage = !message.parentMessageId;
  const hasReplies =
    isRootMessage && typeof message.replyCount === 'number' && message.replyCount > 0;
  const showActions = true;

  const showTimestampActual = showTimestamp;
  const authorName = message.author?.name ?? 'Unknown';
  const authorImage = message.author?.image;

  if (message.body === null) {
    return (
      <div
        className={`flex flex-col gap-1 px-4 py-1 sm:px-6 ${
          isSelected ? 'bg-stone-50/90 ring-1 ring-inset ring-stone-200/60' : ''
        } ${highlighted ? 'rounded-md bg-amber-50 ring-2 ring-inset ring-amber-300' : ''}`}
        aria-label="Message deleted"
        data-message-id={message.id}
      >
        <div className="flex items-center gap-3 text-stone-400">
          <div
            className="flex h-8 w-8 shrink-0 select-none items-center justify-center text-xs text-stone-300"
            aria-hidden="true"
          >
            ○
          </div>
          <span className="text-[13px] italic text-stone-400">Message deleted</span>
        </div>
        <div className="ml-11">
          <MessageReactions
            messageId={message.id}
            currentUserId={currentUserId}
            isDeleted={true}
            reactions={reactions}
            error={error}
            toggleReaction={toggleReaction}
            addReaction={addReaction}
            clearError={clearError}
          />
        </div>
        {hasReplies && (
          <div className="ml-11">
            <button
              type="button"
              onClick={() => onReplyInThread?.(message)}
              aria-label={`View thread, ${message.replyCount} ${message.replyCount === 1 ? 'reply' : 'replies'}`}
              className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-[12px] font-medium text-stone-600 transition-colors hover:bg-stone-100 hover:text-stone-900 focus:outline-none focus:ring-1 focus:ring-stone-400"
            >
              <ThreadsIcon className="h-3.5 w-3.5 text-stone-500" />
              <span>{formatThreadSummary(message.replyCount!, message.latestReplyAt)}</span>
            </button>
          </div>
        )}
      </div>
    );
  }

  function handleMenuClick(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    setMenuProps({
      onEdit: () => {
        setMenuProps(null);
        onEdit?.(message.id);
      },
      onDelete: () => {
        setMenuProps(null);
        onDelete?.(message.id);
      },
    });
  }

  function handleCloseMenu() {
    setMenuProps(null);
  }

  return (
    <div
      className={`group relative flex items-start gap-3 px-4 transition-colors hover:bg-stone-50/80 sm:px-6 ${
        isSelected ? 'bg-stone-50/90 ring-1 ring-inset ring-stone-200/60' : ''
      } ${highlighted ? 'rounded-md bg-amber-50 ring-2 ring-inset ring-amber-300' : ''} ${consecutive ? 'py-0.5' : 'pt-2 pb-0.5'}`}
      data-message-id={message.id}
    >
      {consecutive ? (
        <div className="flex h-5 w-8 shrink-0 select-none items-center justify-center opacity-0 group-hover:opacity-100">
          <span className="text-[10px] text-stone-400">{formatMessageTime(message.createdAt)}</span>
        </div>
      ) : (
        <div className="shrink-0 pt-0.5">
          <UserAvatar name={authorName} image={authorImage} size="md" />
        </div>
      )}

      <div className="min-w-0 flex-1">
        {!consecutive && (
          <div className="mb-1 flex items-baseline gap-2 leading-none">
            <span className="truncate text-[13px] font-semibold text-stone-900">{authorName}</span>
            {showTimestampActual && (
              <span className="shrink-0 text-[11px] font-normal text-stone-400">
                {formatMessageTime(message.createdAt)}
              </span>
            )}
            {message.editedAt && (
              <span className="shrink-0 text-[11px] font-normal text-stone-400">edited</span>
            )}
            {isCurrentUser && (
              <span className="shrink-0 rounded bg-stone-100 px-1.5 py-0.5 text-[10px] font-medium text-stone-500">
                You
              </span>
            )}
          </div>
        )}

        <div className="break-words text-[14px] leading-relaxed text-stone-800 whitespace-pre-wrap">
          {message.body}
          {consecutive && message.editedAt && (
            <span className="ml-1.5 inline-block select-none text-[11px] font-normal text-stone-400">
              edited
            </span>
          )}
        </div>

        {message.attachments && message.attachments.length > 0 && (
          <AttachmentDisplay attachments={message.attachments} />
        )}

        <MessageReactions
          messageId={message.id}
          currentUserId={currentUserId}
          isDeleted={false}
          reactions={reactions}
          error={error}
          toggleReaction={toggleReaction}
          addReaction={addReaction}
          clearError={clearError}
        />

        {hasReplies && (
          <div className="mt-1.5">
            <button
              type="button"
              onClick={() => onReplyInThread?.(message)}
              aria-label={`View thread, ${message.replyCount} ${message.replyCount === 1 ? 'reply' : 'replies'}`}
              className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-[12px] font-medium text-stone-600 transition-colors hover:bg-stone-100 hover:text-stone-900 focus:outline-none focus:ring-1 focus:ring-stone-400"
            >
              <ThreadsIcon className="h-3.5 w-3.5 text-stone-500" />
              <span>{formatThreadSummary(message.replyCount!, message.latestReplyAt)}</span>
            </button>
          </div>
        )}
      </div>

      {showActions && (
        <div className="absolute right-4 top-1.5 z-10 opacity-0 transition-opacity pointer-events-none group-hover:opacity-100 group-hover:pointer-events-auto focus-within:opacity-100 focus-within:pointer-events-auto sm:right-6">
          <div className="flex items-center rounded-lg border border-stone-200 bg-white p-0.5 shadow-xs">
            {isRootMessage && (
              <button
                type="button"
                onClick={() => onReplyInThread?.(message)}
                aria-label="Reply in thread"
                title="Reply in thread"
                className="flex h-6 w-6 items-center justify-center rounded text-stone-400 transition-colors hover:bg-stone-100 hover:text-stone-700 focus:text-stone-700 focus:outline-none focus:ring-1 focus:ring-stone-400"
              >
                <ThreadsIcon className="h-3.5 w-3.5" />
              </button>
            )}
            {isRootMessage && <div className="mx-0.5 h-3.5 w-px bg-stone-200" aria-hidden="true" />}
            <div className="relative">
              <button
                type="button"
                onClick={() => setIsToolbarPickerOpen((prev) => !prev)}
                aria-label="Add reaction"
                title="Add reaction"
                className="flex h-6 w-6 items-center justify-center rounded text-stone-400 transition-colors hover:bg-stone-100 hover:text-stone-700 focus:text-stone-700 focus:outline-none focus:ring-1 focus:ring-stone-400"
              >
                <SmileyIcon className="h-3.5 w-3.5" />
              </button>
              <EmojiPicker
                isOpen={isToolbarPickerOpen}
                onSelect={(emoji) => {
                  void addReaction(emoji);
                }}
                onClose={() => setIsToolbarPickerOpen(false)}
                className="top-full right-0 mt-1"
              />
            </div>
            {isCurrentUser && (
              <>
                <div className="mx-0.5 h-3.5 w-px bg-stone-200" aria-hidden="true" />
                <button
                  type="button"
                  onClick={() => onEdit?.(message.id)}
                  aria-label="Edit message"
                  title="Edit message"
                  className="flex h-6 w-6 items-center justify-center rounded text-stone-400 transition-colors hover:bg-stone-100 hover:text-stone-700 focus:text-stone-700 focus:outline-none focus:ring-1 focus:ring-stone-400"
                >
                  <PencilIcon className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => onDelete?.(message.id)}
                  aria-label="Delete message"
                  title="Delete message"
                  className="flex h-6 w-6 items-center justify-center rounded text-stone-400 transition-colors hover:bg-red-50 hover:text-red-600 focus:text-red-600 focus:outline-none focus:ring-1 focus:ring-red-400"
                >
                  <TrashIcon className="h-3.5 w-3.5" />
                </button>
                <div className="mx-0.5 h-3.5 w-px bg-stone-200" aria-hidden="true" />
                <MessageActionsMenu isOpen={menuProps !== null} onClose={handleCloseMenu}>
                  <button
                    type="button"
                    onClick={handleMenuClick}
                    aria-label="Message actions"
                    aria-expanded={menuProps !== null}
                    aria-haspopup="menu"
                    title="More actions"
                    className="flex h-6 w-6 items-center justify-center rounded text-stone-400 transition-colors hover:bg-stone-100 hover:text-stone-700 focus:text-stone-700 focus:outline-none focus:ring-1 focus:ring-stone-400"
                  >
                    <EllipsisIcon className="h-3.5 w-3.5" />
                  </button>
                  {menuProps !== null && (
                    <div
                      role="menu"
                      aria-label="Message actions"
                      className="absolute right-0 top-7 z-20 w-28 rounded-lg border border-stone-200 bg-white py-1 shadow-lg"
                    >
                      <button
                        type="button"
                        role="menuitem"
                        onClick={menuProps.onEdit}
                        className="block w-full px-3 py-1.5 text-left text-[13px] text-stone-700 transition-colors hover:bg-stone-100 focus:bg-stone-100 focus:outline-none"
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        role="menuitem"
                        onClick={menuProps.onDelete}
                        className="block w-full px-3 py-1.5 text-left text-[13px] text-red-700 transition-colors hover:bg-red-50 focus:bg-red-50 focus:outline-none"
                      >
                        Delete
                      </button>
                    </div>
                  )}
                </MessageActionsMenu>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export const MessageRow = memo(MessageRowInner);

function EllipsisIcon({ className }: { className?: string }) {
  return (
    <svg className={className ?? ''} viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
      <circle cx="8" cy="3" r="2" />
      <circle cx="8" cy="8" r="2" />
      <circle cx="8" cy="13" r="2" />
    </svg>
  );
}
