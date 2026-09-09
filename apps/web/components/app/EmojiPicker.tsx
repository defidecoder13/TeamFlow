'use client';

import { useEffect, useRef } from 'react';

export interface EmojiOption {
  emoji: string;
  name: string;
}

export const POPULAR_EMOJIS: EmojiOption[] = [
  { emoji: '👍', name: 'Thumbs up' },
  { emoji: '❤️', name: 'Heart' },
  { emoji: '😂', name: 'Joy' },
  { emoji: '🎉', name: 'Party' },
  { emoji: '🔥', name: 'Fire' },
  { emoji: '🚀', name: 'Rocket' },
  { emoji: '👀', name: 'Eyes' },
  { emoji: '👏', name: 'Clap' },
  { emoji: '🙏', name: 'Pray' },
  { emoji: '😮', name: 'Surprised' },
  { emoji: '😢', name: 'Sad' },
  { emoji: '💯', name: '100' },
  { emoji: '✅', name: 'Check' },
  { emoji: '❌', name: 'Cross' },
  { emoji: '✨', name: 'Sparkles' },
  { emoji: '🤔', name: 'Thinking' },
  { emoji: '🤝', name: 'Handshake' },
  { emoji: '👎', name: 'Thumbs down' },
];

export interface EmojiPickerProps {
  isOpen: boolean;
  onSelect: (emoji: string) => void;
  onClose: () => void;
  className?: string;
}

export function EmojiPicker({ isOpen, onSelect, onClose, className = '' }: EmojiPickerProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) return;

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
        return;
      }

      if (['ArrowRight', 'ArrowLeft', 'ArrowDown', 'ArrowUp'].includes(e.key)) {
        if (!containerRef.current) return;
        const buttons = Array.from(
          containerRef.current.querySelectorAll<HTMLButtonElement>('button'),
        );
        if (buttons.length === 0) return;
        const currentIndex = buttons.indexOf(document.activeElement as HTMLButtonElement);
        let nextIndex = 0;
        if (currentIndex === -1) {
          nextIndex = 0;
        } else if (e.key === 'ArrowRight') {
          nextIndex = (currentIndex + 1) % buttons.length;
        } else if (e.key === 'ArrowLeft') {
          nextIndex = (currentIndex - 1 + buttons.length) % buttons.length;
        } else if (e.key === 'ArrowDown') {
          nextIndex = (currentIndex + 6) % buttons.length;
        } else if (e.key === 'ArrowUp') {
          nextIndex = (currentIndex - 6 + buttons.length) % buttons.length;
        }
        e.preventDefault();
        buttons[nextIndex]?.focus();
      }
    }

    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        onClose();
      }
    }

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('mousedown', handleClickOutside);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div
      ref={containerRef}
      role="dialog"
      aria-label="Emoji picker"
      className={`absolute z-30 rounded-xl border border-stone-200 bg-white p-2 shadow-lg ${className}`}
    >
      <div className="grid grid-cols-6 gap-1 w-52 sm:w-60">
        {POPULAR_EMOJIS.map(({ emoji, name }) => (
          <button
            key={emoji}
            type="button"
            onClick={() => {
              onSelect(emoji);
              onClose();
            }}
            aria-label={name}
            title={name}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-lg transition-transform hover:scale-125 hover:bg-stone-100 focus:scale-125 focus:bg-stone-100 focus:outline-none focus:ring-1 focus:ring-stone-400"
          >
            {emoji}
          </button>
        ))}
      </div>
    </div>
  );
}
