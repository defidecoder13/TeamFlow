/**
 * Typing indicator component (Phase 4I.5).
 *
 * Displays active typing state resolved to member names:
 * - 0 users: null / empty (or reserved height if desired)
 * - 1 user: "[Name] is typing…"
 * - 2 users: "[Name] and [Name] are typing…"
 * - 3+ users: "[Name], [Name], and N others are typing…"
 *
 * Uses aria-live="polite" for accessible non-disruptive screen reader announcements.
 */

'use client';

import { useMemo } from 'react';

export interface TypingIndicatorMember {
  id: string;
  name: string;
}

export interface TypingIndicatorProps {
  typingUserIds: string[];
  members?: TypingIndicatorMember[];
  className?: string;
}

export function formatTypingNames(names: string[]): string | null {
  if (names.length === 0) {
    return null;
  }
  if (names.length === 1) {
    return `${names[0]} is typing…`;
  }
  if (names.length === 2) {
    return `${names[0]} and ${names[1]} are typing…`;
  }
  const remaining = names.length - 2;
  const othersText = remaining === 1 ? '1 other' : `${remaining} others`;
  return `${names[0]}, ${names[1]}, and ${othersText} are typing…`;
}

export function TypingIndicator({
  typingUserIds,
  members = [],
  className = '',
}: TypingIndicatorProps) {
  const memberMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const m of members) {
      map.set(m.id, m.name);
    }
    return map;
  }, [members]);

  const typingText = useMemo(() => {
    if (typingUserIds.length === 0) return null;
    const names = typingUserIds.map((id) => memberMap.get(id) || 'Someone');
    return formatTypingNames(names);
  }, [typingUserIds, memberMap]);

  if (!typingText) {
    return (
      <div
        className={`h-5 text-[11px] text-transparent select-none transition-opacity ${className}`}
        aria-hidden="true"
      >
        &nbsp;
      </div>
    );
  }

  return (
    <div
      role="status"
      aria-live="polite"
      aria-atomic="true"
      className={`flex h-5 items-center gap-1.5 text-[11px] font-medium text-stone-500 ${className}`}
      data-testid="typing-indicator"
    >
      <span className="flex items-center gap-0.5" aria-hidden="true">
        <span className="inline-block h-1 w-1 rounded-full bg-stone-400 animate-pulse" />
        <span className="inline-block h-1 w-1 rounded-full bg-stone-400 animate-pulse [animation-delay:200ms]" />
        <span className="inline-block h-1 w-1 rounded-full bg-stone-400 animate-pulse [animation-delay:400ms]" />
      </span>
      <span>{typingText}</span>
    </div>
  );
}
