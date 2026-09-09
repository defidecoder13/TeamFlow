/**
 * Search deep-link support (Phase 4G.4, reliability hardening 4G.5).
 *
 * Search results link to `/app/channels/[slug]?message=<id>` for root
 * messages, adding `&reply=<replyId>` for thread replies (same params under
 * `/app/dms/[conversationId]`). This module reads them client-side from
 * `window.location` (no Suspense boundary needed) and offers:
 * - `useSeekMessage`: drives the existing keyset `loadOlder` paging until the
 *   target enters the loaded window (or history/failure proves it missing).
 *   No backend change: bounded page-back over the same cursors the list uses.
 * - `scrollToMessage`: scroll a `[data-message-id]` anchor into view.
 * - `consumeDeepLinkParams`: drop handled params via replaceState (no history
 *   entries, no re-trigger loops).
 */

'use client';

import { useEffect, useRef, useState } from 'react';

export interface DeepLink {
  messageId: string | null;
  replyId: string | null;
}

const EMPTY: DeepLink = { messageId: null, replyId: null };

export function useDeepLink(): DeepLink {
  const [link, setLink] = useState<DeepLink>(EMPTY);
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const messageId = params.get('message')?.trim() || null;
    const replyId = params.get('reply')?.trim() || null;
    if (messageId || replyId) {
      setLink({ messageId, replyId });
    }
  }, []);
  return link;
}

/** Remove consumed deep-link params without adding history entries. */
export function consumeDeepLinkParams(): void {
  const url = new URL(window.location.href);
  if (url.searchParams.has('message') || url.searchParams.has('reply')) {
    url.searchParams.delete('message');
    url.searchParams.delete('reply');
    window.history.replaceState(null, '', url.toString());
  }
}

export type SeekStatus = 'idle' | 'seeking' | 'found' | 'missing';

/**
 * Maximum history pages paged back while seeking a deep-linked message
 * (~500 messages at the default page size). Bounds request count on huge
 * histories; beyond it the target counts as missing and the conversation
 * simply opens normally.
 */
export const MAX_SEEK_PAGES = 10;

export interface SeekInput {
  /** False once the link is consumed/handled — stops all seeking. */
  active: boolean;
  targetId: string | null;
  messages: Array<{ id: string }>;
  hasMore: boolean;
  isLoadingOlder: boolean;
  loadOlderError: string | null;
  loadOlder: () => void;
}

/**
 * Drive existing keyset pagination until `targetId` is loaded. Purely
 * derived status plus one guarded effect: each completed page either finds
 * the target, proves it missing (history exhausted, load error, page cap),
 * or triggers exactly one more `loadOlder` (the hooks' own `isLoadingRef`
 * makes concurrent triggers safe, including StrictMode double-effects).
 */
export function useSeekMessage(input: SeekInput): SeekStatus {
  const { active, targetId, messages, hasMore, isLoadingOlder, loadOlderError, loadOlder } = input;
  const pagesRequestedRef = useRef(0);
  const prevTargetRef = useRef<string | null>(null);
  if (prevTargetRef.current !== targetId) {
    prevTargetRef.current = targetId;
    pagesRequestedRef.current = 0;
  }

  let status: SeekStatus = 'idle';
  if (active && targetId) {
    if (messages.some((message) => message.id === targetId)) {
      status = 'found';
    } else if (loadOlderError || !hasMore || pagesRequestedRef.current >= MAX_SEEK_PAGES) {
      status = 'missing';
    } else {
      status = 'seeking';
    }
  }

  useEffect(() => {
    if (status === 'seeking' && !isLoadingOlder) {
      pagesRequestedRef.current += 1;
      loadOlder();
    }
  }, [status, isLoadingOlder, loadOlder]);

  return status;
}

function escapeSelectorId(id: string): string {
  if (typeof CSS !== 'undefined' && typeof CSS.escape === 'function') {
    return CSS.escape(id);
  }
  return id;
}

/**
 * Scroll the `[data-message-id]` element into view. Returns whether the
 * element exists in the DOM (false when the message is outside the loaded
 * window). Safe in jsdom (no `scrollIntoView` there).
 */
export function scrollToMessage(messageId: string): boolean {
  if (typeof document === 'undefined') {
    return false;
  }
  let element: Element | null = null;
  try {
    element = document.querySelector(`[data-message-id="${escapeSelectorId(messageId)}"]`);
  } catch {
    return false;
  }
  if (!element) {
    return false;
  }
  if (typeof element.scrollIntoView === 'function') {
    try {
      element.scrollIntoView({ block: 'center' });
    } catch {
      // Non-fatal: highlight still identifies the message.
    }
  }
  return true;
}
