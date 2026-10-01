'use client';

import { useEffect, useRef, useState } from 'react';

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

const COLUMNS = 6;

export interface EmojiPickerProps {
  isOpen: boolean;
  onSelect: (emoji: string) => void;
  onClose: () => void;
  className?: string;
  /** The button that opened the picker — focus returns here on close. */
  triggerRef?: React.RefObject<HTMLElement | null>;
}

export function EmojiPicker({
  isOpen,
  onSelect,
  onClose,
  className = '',
  triggerRef,
}: EmojiPickerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  // Focus the active option on open so arrows work immediately.
  useEffect(() => {
    if (!isOpen) return;
    setActiveIndex(0);
    const buttons = containerRef.current?.querySelectorAll<HTMLButtonElement>('button');
    buttons?.[0]?.focus({ preventScroll: true });
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;

    function move(delta: number) {
      const buttons = containerRef.current?.querySelectorAll<HTMLButtonElement>('button');
      if (!buttons || buttons.length === 0) return;
      const next = (activeIndex + delta + buttons.length) % buttons.length;
      setActiveIndex(next);
      buttons[next]?.focus();
    }

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onCloseRef.current();
        triggerRef?.current?.focus({ preventScroll: true });
        return;
      }
      if (!containerRef.current?.contains(e.target as Node)) return;
      if (e.key === 'ArrowRight') {
        e.preventDefault();
        move(1);
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        move(-1);
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        move(COLUMNS);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        move(-COLUMNS);
      } else if (e.key === 'Home') {
        e.preventDefault();
        setActiveIndex(0);
        containerRef.current?.querySelectorAll<HTMLButtonElement>('button')[0]?.focus();
      } else if (e.key === 'End') {
        e.preventDefault();
        const buttons = containerRef.current?.querySelectorAll<HTMLButtonElement>('button');
        if (buttons && buttons.length > 0) {
          setActiveIndex(buttons.length - 1);
          buttons[buttons.length - 1]?.focus();
        }
      }
    }

    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        onCloseRef.current();
      }
    }

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('mousedown', handleClickOutside);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen, activeIndex, triggerRef]);

  if (!isOpen) return null;

  function handleSelect(emoji: string) {
    onSelect(emoji);
    onCloseRef.current();
    triggerRef?.current?.focus({ preventScroll: true });
  }

  return (
    <div
      ref={containerRef}
      role="dialog"
      aria-label="Emoji picker"
      className={`absolute z-30 rounded-xl border border-[#e3e1ec] bg-white p-2 shadow-lg transition-[opacity,scale] duration-150 ease-out-expo starting:scale-[0.97] starting:opacity-0 ${className}`}
    >
      <div role="toolbar" aria-label="Emoji" className="grid w-52 grid-cols-6 gap-1 sm:w-60">
        {POPULAR_EMOJIS.map(({ emoji, name }, index) => (
          <button
            key={emoji}
            type="button"
            aria-label={name}
            title={name}
            tabIndex={index === activeIndex ? 0 : -1}
            onClick={() => handleSelect(emoji)}
            onMouseEnter={() => setActiveIndex(index)}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-lg transition-colors hover:bg-[#f4f2fd] focus-visible:bg-[#f4f2fd] focus-visible:outline-2 focus-visible:outline-[#1f44e4]"
          >
            {emoji}
          </button>
        ))}
      </div>
    </div>
  );
}
