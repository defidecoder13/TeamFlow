/**
 * Frontend typing state hook (Phase 4I.5).
 *
 * Provides ephemeral typing state tracking for a specific container (channel or direct conversation).
 *
 * Responsibilities:
 * - Subscribes to realtime typing:started / typing:stopped events
 * - Isolates typing users strictly to the targeted container (channelId or conversationId)
 * - Excludes the current user from the typing set defensively
 * - Emits typing:start / typing:stop on behalf of the local composer with throttling & TTL refresh
 * - Cleans up active subscriptions and emits typing:stop on unmount or container change
 */

'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  emitTypingStart,
  emitTypingStop,
  onRealtimeTypingStarted,
  onRealtimeTypingStopped,
  type RealtimeTypingStartedEvent,
  type RealtimeTypingStoppedEvent,
} from './realtime-client';

export interface TypingContainer {
  channelId?: string;
  conversationId?: string;
}

export interface UseTypingOptions {
  currentUserId?: string | null;
  /** Refresh interval in ms while actively typing (default 1500ms, well before 3000ms TTL) */
  refreshIntervalMs?: number;
}

export interface UseTypingReturn {
  /** Array of user IDs currently typing in the container */
  typingUserIds: string[];
  /** Check if a specific user is currently typing */
  isUserTyping: (userId: string) => boolean;
  /** Call when the local composer input changes with current text */
  handleInputChange: (text: string) => void;
  /** Call when the local composer message is sent or explicitly cleared */
  handleStopTyping: () => void;
}

const DEFAULT_REFRESH_INTERVAL_MS = 1500;

export function useTyping(
  container: TypingContainer | null | undefined,
  options?: UseTypingOptions,
): UseTypingReturn {
  const currentUserId = options?.currentUserId;
  const refreshIntervalMs = options?.refreshIntervalMs ?? DEFAULT_REFRESH_INTERVAL_MS;

  const channelId = container?.channelId;
  const conversationId = container?.conversationId;

  // Track user IDs currently typing in this container
  const [typingUserIds, setTypingUserIds] = useState<string[]>([]);

  // Ref tracking whether we locally emitted typing:start
  const isLocallyTypingRef = useRef(false);
  const refreshTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const containerRef = useRef<TypingContainer | null>(null);
  containerRef.current = channelId || conversationId ? { channelId, conversationId } : null;

  const stopLocalTyping = useCallback(() => {
    if (refreshTimerRef.current) {
      clearInterval(refreshTimerRef.current);
      refreshTimerRef.current = null;
    }
    if (isLocallyTypingRef.current && containerRef.current) {
      isLocallyTypingRef.current = false;
      void emitTypingStop(containerRef.current).catch(() => {
        // Non-critical, ignore transport errors
      });
    } else {
      isLocallyTypingRef.current = false;
    }
  }, []);

  const startLocalTyping = useCallback(() => {
    if (!containerRef.current) return;
    const target = containerRef.current;

    if (!isLocallyTypingRef.current) {
      isLocallyTypingRef.current = true;
      void emitTypingStart(target).catch(() => {
        // Non-critical
      });
    }

    // Refresh typing state periodically while user remains active
    if (!refreshTimerRef.current) {
      refreshTimerRef.current = setInterval(() => {
        if (isLocallyTypingRef.current && containerRef.current) {
          void emitTypingStart(containerRef.current).catch(() => {
            // Non-critical
          });
        }
      }, refreshIntervalMs);
    }
  }, [refreshIntervalMs]);

  const handleInputChange = useCallback(
    (text: string) => {
      const hasContent = Boolean(text && text.trim().length > 0);
      if (hasContent) {
        startLocalTyping();
      } else {
        stopLocalTyping();
      }
    },
    [startLocalTyping, stopLocalTyping],
  );

  const handleStopTyping = useCallback(() => {
    stopLocalTyping();
  }, [stopLocalTyping]);

  // Handle container changes & cleanup on unmount
  useEffect(() => {
    // Reset remote typing state on container switch
    setTypingUserIds([]);

    if (!channelId && !conversationId) {
      stopLocalTyping();
      return;
    }

    const unsubStarted = onRealtimeTypingStarted((event: RealtimeTypingStartedEvent) => {
      // Validate container match
      if (channelId && event.channelId !== channelId) return;
      if (conversationId && event.conversationId !== conversationId) return;

      // Ignore current user defensively
      if (currentUserId && event.userId === currentUserId) return;

      setTypingUserIds((prev) => {
        if (prev.includes(event.userId)) return prev;
        return [...prev, event.userId];
      });
    });

    const unsubStopped = onRealtimeTypingStopped((event: RealtimeTypingStoppedEvent) => {
      // Validate container match
      if (channelId && event.channelId !== channelId) return;
      if (conversationId && event.conversationId !== conversationId) return;

      setTypingUserIds((prev) => {
        if (!prev.includes(event.userId)) return prev;
        return prev.filter((id) => id !== event.userId);
      });
    });

    return () => {
      unsubStarted();
      unsubStopped();
      stopLocalTyping();
    };
  }, [channelId, conversationId, currentUserId, stopLocalTyping]);

  const isUserTyping = useCallback(
    (userId: string) => typingUserIds.includes(userId),
    [typingUserIds],
  );

  return {
    typingUserIds,
    isUserTyping,
    handleInputChange,
    handleStopTyping,
  };
}
