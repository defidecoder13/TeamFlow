'use client';

import { useRef, useState } from 'react';
import type { MessageReactionSummary } from '../../lib/messages';
import { useMessageReactions } from '../../lib/use-message-reactions';
import { EmojiPicker } from './EmojiPicker';

export interface MessageReactionsProps {
  messageId: string;
  currentUserId?: string | null;
  isDeleted?: boolean;
  showAddWhenEmpty?: boolean;
  reactions?: MessageReactionSummary[];
  error?: string | null;
  toggleReaction?: (emoji: string) => Promise<boolean>;
  addReaction?: (emoji: string) => Promise<boolean>;
  clearError?: () => void;
}

export function MessageReactions({
  messageId,
  currentUserId,
  isDeleted = false,
  showAddWhenEmpty = false,
  reactions: controlledReactions,
  error: controlledError,
  toggleReaction: controlledToggle,
  addReaction: controlledAdd,
  clearError: controlledClearError,
}: MessageReactionsProps) {
  const hookResult = useMessageReactions({
    messageId,
    currentUserId,
  });

  const reactions = controlledReactions ?? hookResult.reactions;
  const error = controlledError !== undefined ? controlledError : hookResult.error;
  const toggleReaction = controlledToggle ?? hookResult.toggleReaction;
  const addReaction = controlledAdd ?? hookResult.addReaction;
  const clearError = controlledClearError ?? hookResult.clearError;

  const [isPickerOpen, setIsPickerOpen] = useState(false);
  const pickerTriggerRef = useRef<HTMLButtonElement>(null);

  if (isDeleted && reactions.length === 0) {
    return null;
  }

  if (!showAddWhenEmpty && reactions.length === 0 && !error && !isPickerOpen) {
    return null;
  }

  return (
    <div className="mt-1 flex flex-wrap items-center gap-1">
      {reactions.map((r) => {
        const hasReacted = r.reacted;
        const ariaLabel = `${r.emoji}, ${r.count} ${r.count === 1 ? 'reaction' : 'reactions'}${
          hasReacted ? ' (you reacted, click to remove)' : ' (click to react)'
        }`;

        return (
          <button
            key={r.emoji}
            type="button"
            onClick={() => {
              if (isDeleted) return;
              void toggleReaction(r.emoji);
            }}
            disabled={isDeleted}
            aria-label={ariaLabel}
            aria-pressed={hasReacted}
            className={`inline-flex items-center gap-1 rounded-[6px] border px-2 py-0.5 text-xs transition-colors focus-visible:outline-2 focus-visible:outline-[#3157D5] ${
              hasReacted
                ? 'border-[#3157D5]/30 bg-[#EEF2FF] font-semibold text-[#3157D5]'
                : 'border-[#E4E2DF] bg-white font-normal text-[#4F5360] hover:bg-[#F6F5F3]'
            } ${isDeleted ? 'opacity-60 cursor-default' : 'cursor-pointer'}`}
          >
            <span className="select-none text-[13px] leading-none">{r.emoji}</span>
            <span
              className={`text-[11px] leading-none tabular-nums ${hasReacted ? 'text-[#3157D5]' : 'text-[#4F5360]'}`}
            >
              {r.count}
            </span>
          </button>
        );
      })}

      {!isDeleted && (reactions.length > 0 || showAddWhenEmpty) && (
        <div className="relative inline-flex items-center">
          <button
            ref={pickerTriggerRef}
            type="button"
            onClick={() => setIsPickerOpen((prev) => !prev)}
            aria-label="Add reaction"
            aria-haspopup="dialog"
            aria-expanded={isPickerOpen}
            className="inline-flex h-6 min-w-7 items-center justify-center rounded-[6px] border border-[#E4E2DF] bg-[#FAF9F8] px-1 text-[11px] text-[#737782] transition-colors hover:bg-[#F1F0EE] hover:text-[#171A21] focus-visible:outline-2 focus-visible:outline-[#3157D5]"
          >
            +
          </button>

          <EmojiPicker
            isOpen={isPickerOpen}
            onSelect={(emoji) => {
              void addReaction(emoji);
            }}
            onClose={() => setIsPickerOpen(false)}
            triggerRef={pickerTriggerRef}
            className="bottom-full left-0 mb-1 origin-bottom-left"
          />
        </div>
      )}

      {error && (
        <div className="flex items-center gap-1 rounded bg-red-50 px-1.5 py-0.5 text-[11px] text-red-600">
          <span>{error}</span>
          <button
            type="button"
            onClick={clearError}
            aria-label="Dismiss error"
            className="rounded font-bold text-red-700 transition-colors hover:text-red-900 focus-visible:outline-2 focus-visible:outline-red-600"
          >
            ×
          </button>
        </div>
      )}
    </div>
  );
}
