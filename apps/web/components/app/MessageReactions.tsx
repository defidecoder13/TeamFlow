'use client';

import { useState } from 'react';
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
            className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs transition-colors focus:outline-none focus:ring-1 focus:ring-stone-400 ${
              hasReacted
                ? 'border-blue-300 bg-blue-50 font-semibold text-blue-700 hover:bg-blue-100'
                : 'border-stone-200 bg-stone-50 font-normal text-stone-700 hover:bg-stone-100'
            } ${isDeleted ? 'opacity-60 cursor-default' : 'cursor-pointer'}`}
          >
            <span className="text-[13px] leading-none select-none">{r.emoji}</span>
            <span className="text-[11px] leading-none text-stone-600">{r.count}</span>
          </button>
        );
      })}

      {!isDeleted && (reactions.length > 0 || showAddWhenEmpty) && (
        <div className="relative inline-flex items-center">
          <button
            type="button"
            onClick={() => setIsPickerOpen((prev) => !prev)}
            aria-label="Add reaction"
            aria-haspopup="dialog"
            aria-expanded={isPickerOpen}
            className="inline-flex h-5 w-6 items-center justify-center rounded-full border border-stone-200 bg-stone-50 text-[11px] text-stone-400 transition-colors hover:bg-stone-100 hover:text-stone-600 focus:outline-none focus:ring-1 focus:ring-stone-400"
          >
            +
          </button>

          <EmojiPicker
            isOpen={isPickerOpen}
            onSelect={(emoji) => {
              void addReaction(emoji);
            }}
            onClose={() => setIsPickerOpen(false)}
            className="bottom-full left-0 mb-1"
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
            className="font-bold text-red-700 hover:text-red-900"
          >
            ×
          </button>
        </div>
      )}
    </div>
  );
}
