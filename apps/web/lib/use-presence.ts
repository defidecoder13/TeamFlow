/**
 * Workspace presence state hook (Phase 4I.3).
 *
 * Scoped to the active workspace. Manages:
 * - Initial REST snapshot synchronization (GET /api/workspaces/:workspaceId/presence)
 * - Realtime presence:changed events merged per user
 * - Stale request / workspace-switch isolation using monotonic request IDs and AbortController
 * - Reconnect resynchronization
 * - Safe fallback defaults for unobserved / offline users
 */

'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { getApiBaseUrl } from './config';
import { fetchWorkspacePresence, type PresenceStatus, type UserPresence } from './presence';
import {
  connectRealtime,
  onRealtimePresenceChanged,
  onRealtimeReconnect,
  type RealtimePresenceChangedEvent,
} from './realtime-client';

export type PresenceState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'ready'; presenceMap: Record<string, UserPresence> }
  | { status: 'unauthenticated' }
  | { status: 'error'; message: string };

const LOAD_FAILURE_MESSAGE = 'Could not load presence. Check your connection and try again.';

export const DEFAULT_OFFLINE_PRESENCE: UserPresence = {
  userId: '',
  status: 'OFFLINE',
  lastSeenAt: null,
};

export function usePresence(workspaceId: string | null): {
  state: PresenceState;
  getPresence: (userId: string) => UserPresence;
  retry: () => void;
} {
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<PresenceState>({ status: 'idle' });

  const requestIdRef = useRef(0);
  const stateRef = useRef(state);
  stateRef.current = state;
  const workspaceRef = useRef(workspaceId);
  workspaceRef.current = workspaceId;

  const retry = useCallback(() => {
    setAttempt((count) => count + 1);
  }, []);

  // Initial load + workspace switching + retry
  useEffect(() => {
    if (!workspaceId) {
      requestIdRef.current += 1;
      setState({ status: 'idle' });
      return;
    }
    const activeWorkspaceId = workspaceId;
    const myId = ++requestIdRef.current;
    setState({ status: 'loading' });

    const controller = new AbortController();
    void (async () => {
      let apiBase: string;
      try {
        apiBase = getApiBaseUrl();
      } catch {
        if (requestIdRef.current === myId) {
          setState({ status: 'error', message: LOAD_FAILURE_MESSAGE });
        }
        return;
      }
      const result = await fetchWorkspacePresence(apiBase, activeWorkspaceId, {
        signal: controller.signal,
      });
      if (requestIdRef.current !== myId) {
        return;
      }
      if (!result) {
        setState({ status: 'error', message: LOAD_FAILURE_MESSAGE });
        return;
      }
      if (result.ok) {
        const nextMap: Record<string, UserPresence> = {};
        for (const item of result.presence) {
          nextMap[item.userId] = item;
        }
        // Preserve any newer realtime updates that arrived while REST was in flight
        setState((previous) => {
          if (previous.status === 'ready') {
            for (const [uid, p] of Object.entries(previous.presenceMap)) {
              if (nextMap[uid]) {
                nextMap[uid] = p;
              }
            }
          }
          return {
            status: 'ready',
            presenceMap: nextMap,
          };
        });
        return;
      }
      if ('unauthenticated' in result && result.unauthenticated) {
        setState({ status: 'unauthenticated' });
        return;
      }
      if (result.kind === 'aborted') {
        return;
      }
      setState({ status: 'error', message: result.message ?? LOAD_FAILURE_MESSAGE });
    })();

    return () => {
      controller.abort();
    };
  }, [workspaceId, attempt]);

  // Realtime subscription and reconnect handling
  useEffect(() => {
    if (!workspaceId) {
      return;
    }
    const activeWorkspaceId = workspaceId;
    connectRealtime();

    const handlePresenceChanged = (event: RealtimePresenceChangedEvent) => {
      // Update only if this workspace is still active
      if (workspaceRef.current !== activeWorkspaceId) {
        return;
      }
      setState((current) => {
        if (current.status !== 'ready') {
          // If not ready yet, initialize presenceMap with this event so it survives REST resolution
          return {
            status: 'ready',
            presenceMap: {
              [event.userId]: {
                userId: event.userId,
                status: event.status as PresenceStatus,
                lastSeenAt: event.lastSeenAt,
              },
            },
          };
        }
        return {
          ...current,
          presenceMap: {
            ...current.presenceMap,
            [event.userId]: {
              userId: event.userId,
              status: event.status as PresenceStatus,
              lastSeenAt: event.lastSeenAt,
            },
          },
        };
      });
    };

    const handleReconnect = () => {
      // Reconnect resynchronization
      const myId = ++requestIdRef.current;
      const controller = new AbortController();
      void (async () => {
        let apiBase: string;
        try {
          apiBase = getApiBaseUrl();
        } catch {
          return;
        }
        const result = await fetchWorkspacePresence(apiBase, activeWorkspaceId, {
          signal: controller.signal,
        });
        if (requestIdRef.current !== myId || !result.ok || !('presence' in result)) {
          return;
        }
        const refreshedMap: Record<string, UserPresence> = {};
        for (const item of result.presence) {
          refreshedMap[item.userId] = item;
        }
        setState({
          status: 'ready',
          presenceMap: refreshedMap,
        });
      })();
    };

    const offPresence = onRealtimePresenceChanged(handlePresenceChanged);
    const offReconnect = onRealtimeReconnect(handleReconnect);

    return () => {
      offPresence();
      offReconnect();
    };
  }, [workspaceId]);

  const getPresence = useCallback(
    (userId: string): UserPresence => {
      if (state.status === 'ready' && state.presenceMap[userId]) {
        return state.presenceMap[userId]!;
      }
      return {
        userId,
        status: 'OFFLINE',
        lastSeenAt: null,
      };
    },
    [state],
  );

  return {
    state,
    getPresence,
    retry,
  };
}
