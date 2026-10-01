'use client';

import { memo, useRef, useState } from 'react';
import type { Message } from '../../lib/messages';
import { UserAvatar } from './UserAvatar';
import { formatMessageTime, formatThreadSummary, isConsecutiveSameAuthor } from './message-utils';
import { MessageActionsMenu } from './message-actions';
import { useMenuKeyboard } from './dialog';
import { MoreVerticalIcon, PencilIcon, SmileyIcon, ThreadsIcon, TrashIcon } from './icons';
import { useMessageReactions } from '../../lib/use-message-reactions';
import { MessageReactions } from './MessageReactions';
import { EmojiPicker } from './EmojiPicker';
import { AttachmentDisplay } from './AttachmentDisplay';
import { resolveMentionSpans, type MentionMember, type MentionSpan } from '../../lib/mentions';

interface MessageRowProps {
  message: Message;
  currentUserId?: string | null;
  isCurrentUser: boolean;
  showTimestamp: boolean;
  previousMessage?: Message | null;
  /**
   * Known members for @ mention highlighting. Omitted (undefined) renders
   * the body as plain text — the safe default. Highlighting is visual
   * convenience only and never navigates anywhere.
   */
  mentionMembers?: MentionMember[];
  /**
   * Called with (messageId, attachmentId) after an attachment DELETE
   * succeeds, so the owner splices it from message state. Omitted callers
   * keep the previous local-only hide behavior.
   */
  onAttachmentDeleted?: (messageId: string, attachmentId: string) => void;
  isSelected?: boolean;
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
  mentionMembers,
  onAttachmentDeleted,
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
  const menuTriggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useMenuKeyboard({
    open: menuProps !== null,
    onClose: handleCloseMenu,
    triggerRef: menuTriggerRef,
  });
  const pickerTriggerRef = useRef<HTMLButtonElement>(null);

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
        className={`flex flex-col gap-1 rounded-lg px-4 py-1 sm:px-6 ${
          isSelected ? 'bg-[#f4f2fd] ring-1 ring-inset ring-[#e3e1ec]' : ''
        } ${highlighted ? 'rounded-md bg-amber-50 ring-2 ring-inset ring-amber-300' : ''}`}
        aria-label="Message deleted"
        data-message-id={message.id}
      >
        <div className="flex items-center gap-3 text-[#5f5e61]">
          <div
            className="flex h-8 w-8 shrink-0 select-none items-center justify-center text-xs text-[#c8c5cb]"
            aria-hidden="true"
          >
            ○
          </div>
          <span className="text-[13px] italic text-[#5f5e61]">Message deleted</span>
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
              className="inline-flex items-center gap-1.5 rounded-md bg-white px-2 py-1 text-[12px] font-medium tabular-nums text-[#47464b] ring-1 ring-[#e3e1ec] transition-colors hover:bg-[#f4f2fd] hover:text-[#1a1b22] focus-visible:outline-2 focus-visible:outline-[#1f44e4]"
            >
              <ThreadsIcon className="h-3.5 w-3.5 text-[#5f5e61]" />
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
      className={`group relative flex items-start gap-3 rounded-[8px] px-2 transition-colors hover:bg-[#FAF9F8] sm:mx-2 ${
        isSelected ? 'bg-[#f4f2fd] ring-1 ring-inset ring-[#E4E2DF]' : ''
      } ${highlighted ? 'rounded-[8px] bg-amber-50 ring-2 ring-inset ring-amber-300' : ''} ${consecutive ? 'py-0.5' : 'py-1.5'}`}
      data-message-id={message.id}
    >
      {consecutive ? (
        <div className="flex h-5 w-8 shrink-0 select-none items-center justify-center opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
          <span className="whitespace-nowrap text-[11px] tabular-nums text-[#737782]">
            {formatMessageTime(message.createdAt)}
          </span>
        </div>
      ) : (
        <div className="shrink-0 pt-0.5">
          <UserAvatar name={authorName} image={authorImage} size="md" />
        </div>
      )}

      <div className="min-w-0 flex-1">
        {!consecutive && (
          <div className="mb-1 flex items-baseline gap-2 leading-none">
            <span className="truncate text-[13px] font-semibold text-[#171A21]" title={authorName}>
              {authorName}
            </span>
            {showTimestampActual && (
              <span className="shrink-0 text-[11px] font-normal tabular-nums text-[#737782]">
                {formatMessageTime(message.createdAt)}
              </span>
            )}
            {message.editedAt && (
              <span className="shrink-0 text-[11px] font-normal text-[#737782]">edited</span>
            )}
            {isCurrentUser && (
              <span className="shrink-0 rounded-[4px] bg-[#F1F0EE] px-1.5 py-0.5 text-[11px] font-medium text-[#737782] ring-1 ring-[#E4E2DF]">
                You
              </span>
            )}
          </div>
        )}

        <div className="break-words text-[14px] leading-relaxed text-[#171A21] whitespace-pre-wrap">
          <MessageBody body={message.body} mentionMembers={mentionMembers} />
          {consecutive && message.editedAt && (
            <span className="ml-1.5 inline-block select-none text-[11px] font-normal text-[#737782]">
              edited
            </span>
          )}
        </div>

        {message.attachments && message.attachments.length > 0 && (
          <AttachmentDisplay
            attachments={message.attachments}
            currentUserId={currentUserId}
            messageAuthorId={message.authorId}
            onAttachmentDeleted={
              onAttachmentDeleted
                ? (attachmentId) => onAttachmentDeleted(message.id, attachmentId)
                : undefined
            }
          />
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
              className="inline-flex items-center gap-1.5 rounded-[6px] bg-[#EEF2FF] px-2.5 py-1 text-[12px] font-medium tabular-nums text-[#3157D5] border border-[#3157D5]/20 transition-colors hover:bg-[#E0E7FF] focus-visible:outline-2 focus-visible:outline-[#3157D5]"
            >
              <ThreadsIcon className="h-3.5 w-3.5 text-[#3157D5]" />
              <span>{formatThreadSummary(message.replyCount!, message.latestReplyAt)}</span>
            </button>
          </div>
        )}
      </div>

      {showActions && (
        <div className="message-toolbar pointer-events-none absolute -top-3 right-2 z-10 opacity-0 transition-opacity group-hover:pointer-events-auto group-hover:opacity-100 focus-within:pointer-events-auto focus-within:opacity-100">
          <div className="flex items-center gap-0.5 rounded-[8px] border border-[#E4E2DF] bg-white p-0.5 shadow-2xs">
            {isRootMessage && (
              <button
                type="button"
                onClick={() => onReplyInThread?.(message)}
                aria-label="Reply in thread"
                title="Reply in thread"
                className="touch-hit flex h-7 w-7 items-center justify-center rounded-[6px] text-[#737782] transition-colors hover:bg-[#F1F0EE] hover:text-[#171A21] focus-visible:text-[#171A21] focus-visible:outline-2 focus-visible:outline-[#3157D5]"
              >
                <ThreadsIcon className="h-3.5 w-3.5" />
              </button>
            )}
            {isRootMessage && <div className="mx-0.5 h-3.5 w-px bg-[#E4E2DF]" aria-hidden="true" />}
            <div className="relative">
              <button
                ref={pickerTriggerRef}
                type="button"
                onClick={() => setIsToolbarPickerOpen((prev) => !prev)}
                aria-label="Add reaction"
                aria-expanded={isToolbarPickerOpen}
                aria-haspopup="dialog"
                title="Add reaction"
                className="touch-hit flex h-7 w-7 items-center justify-center rounded-[6px] text-[#737782] transition-colors hover:bg-[#F1F0EE] hover:text-[#171A21] focus-visible:text-[#171A21] focus-visible:outline-2 focus-visible:outline-[#3157D5]"
              >
                <SmileyIcon className="h-3.5 w-3.5" />
              </button>
              <EmojiPicker
                isOpen={isToolbarPickerOpen}
                onSelect={(emoji) => {
                  void addReaction(emoji);
                }}
                onClose={() => setIsToolbarPickerOpen(false)}
                triggerRef={pickerTriggerRef}
                className="top-full right-0 mt-1 origin-top-right"
              />
            </div>
            {isCurrentUser && (
              <>
                <div className="mx-0.5 h-3.5 w-px bg-[#E4E2DF]" aria-hidden="true" />
                <button
                  type="button"
                  onClick={() => onEdit?.(message.id)}
                  aria-label="Edit message"
                  title="Edit message"
                  className="touch-hit flex h-7 w-7 items-center justify-center rounded-[6px] text-[#737782] transition-colors hover:bg-[#F1F0EE] hover:text-[#171A21] focus-visible:text-[#171A21] focus-visible:outline-2 focus-visible:outline-[#3157D5]"
                >
                  <PencilIcon className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => onDelete?.(message.id)}
                  aria-label="Delete message"
                  title="Delete message"
                  className="touch-hit flex h-7 w-7 items-center justify-center rounded-[6px] text-[#737782] transition-colors hover:bg-rose-50 hover:text-[#C94A45] focus-visible:text-[#C94A45] focus-visible:outline-2 focus-visible:outline-[#C94A45]"
                >
                  <TrashIcon className="h-3.5 w-3.5" />
                </button>
                <div className="mx-0.5 h-3.5 w-px bg-[#E4E2DF]" aria-hidden="true" />
                <MessageActionsMenu isOpen={menuProps !== null} onClose={handleCloseMenu}>
                  <button
                    ref={menuTriggerRef}
                    type="button"
                    onClick={handleMenuClick}
                    aria-label="Message actions"
                    aria-expanded={menuProps !== null}
                    aria-haspopup="menu"
                    title="More actions"
                    className="touch-hit flex h-7 w-7 items-center justify-center rounded-[6px] text-[#737782] transition-colors hover:bg-[#F1F0EE] hover:text-[#171A21] focus-visible:text-[#171A21] focus-visible:outline-2 focus-visible:outline-[#3157D5]"
                  >
                    <MoreVerticalIcon className="h-3.5 w-3.5" />
                  </button>
                  {menuProps !== null && (
                    <div
                      ref={menuRef}
                      role="menu"
                      aria-label="Message actions"
                      className="absolute right-0 top-7 z-20 w-36 origin-top-right rounded-[10px] border border-[#E4E2DF] bg-white py-1 shadow-[0_12px_32px_rgba(20,24,32,0.12)] p-1 animate-in fade-in zoom-in-95 duration-100"
                    >
                      <button
                        type="button"
                        role="menuitem"
                        onClick={menuProps.onEdit}
                        className="block w-full rounded-[6px] px-3 py-1.5 text-left text-[13px] text-[#171A21] transition-colors hover:bg-[#F1F0EE] focus-visible:bg-[#F1F0EE] focus-visible:outline-2 focus-visible:outline-inset focus-visible:outline-[#3157D5]"
                      >
                        Edit message
                      </button>
                      <button
                        type="button"
                        role="menuitem"
                        onClick={menuProps.onDelete}
                        className="block w-full rounded-[6px] px-3 py-1.5 text-left text-[13px] text-[#C94A45] transition-colors hover:bg-rose-50 focus-visible:bg-rose-50 focus-visible:outline-2 focus-visible:outline-inset focus-visible:outline-[#C94A45]"
                      >
                        Delete message
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

/**
 * Renders a message body with @ mention spans highlighted against known
 * members. Unknown or ambiguous `@text` stays plain — highlighting never
 * implies navigation or privilege, and tombstones (null body) render
 * nothing here (the deleted placeholder lives above).
 */
export function MessageBody({
  body,
  mentionMembers,
}: {
  body: string;
  mentionMembers?: MentionMember[];
}) {
  const spans: MentionSpan[] =
    mentionMembers && mentionMembers.length > 0 ? resolveMentionSpans(body, mentionMembers) : [];
  if (spans.length === 0) {
    return <>{body}</>;
  }
  const parts: React.ReactNode[] = [];
  let cursor = 0;
  spans.forEach((span, index) => {
    if (span.start > cursor) {
      parts.push(body.slice(cursor, span.start));
    }
    parts.push(
      <mark key={index} className="rounded bg-[#dee0ff] px-1 font-medium text-[#00105a]">
        {body.slice(span.start, span.end)}
      </mark>,
    );
    cursor = span.end;
  });
  if (cursor < body.length) {
    parts.push(body.slice(cursor));
  }
  return <>{parts}</>;
}

export const MessageRow = memo(MessageRowInner);
