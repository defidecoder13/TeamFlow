'use client';

import { useCallback, useEffect, useMemo, useSyncExternalStore } from 'react';
import {
  addMessageReaction,
  fetchMessageReactions,
  removeMessageReaction,
  type MessageReactionSummary,
} from './messages';
import {
  onRealtimeReactionAdded,
  onRealtimeReactionRemoved,
  onRealtimeReconnect,
} from './realtime-client';

export interface UseMessageReactionsOptions {
  messageId: string;
  currentUserId?: string | null;
  apiBase?: string;
  initialReactions?: MessageReactionSummary[];
}

export interface UseMessageReactionsResult {
  reactions: MessageReactionSummary[];
  isLoading: boolean;
  loading: boolean;
  error: string | null;
  toggleReaction: (emoji: string) => Promise<boolean>;
  addReaction: (emoji: string) => Promise<boolean>;
  removeReaction: (emoji: string) => Promise<boolean>;
  clearError: () => void;
  refetch: () => Promise<void>;
}

type PendingOp = { type: 'add' | 'remove'; version: number };

export interface ReactionState {
  serverReactions: MessageReactionSummary[];
  pendingOps: Record<string, PendingOp>;
  isLoading: boolean;
  error: string | null;
}

const DEFAULT_STATE: ReactionState = {
  serverReactions: [],
  pendingOps: {},
  isLoading: true,
  error: null,
};

const storeStates = new Map<string, ReactionState>();
const storeListeners = new Map<string, Set<() => void>>();
const queues = new Map<string, Record<string, Promise<void>>>();
const opVersions = new Map<string, Record<string, number>>();

let isSocketInitialized = false;
let globalApiBase = '';
let globalCurrentUserId: string | null = null;

function getStoreState(messageId: string): ReactionState {
  return storeStates.get(messageId) ?? DEFAULT_STATE;
}

function notify(messageId: string) {
  const listeners = storeListeners.get(messageId);
  if (listeners) {
    listeners.forEach((listener) => listener());
  }
}

function updateStoreState(messageId: string, updater: (prev: ReactionState) => ReactionState) {
  const prev = getStoreState(messageId);
  const next = updater(prev);
  if (prev !== next) {
    storeStates.set(messageId, next);
    notify(messageId);
  }
}

function subscribeStore(messageId: string, listener: () => void) {
  let listeners = storeListeners.get(messageId);
  if (!listeners) {
    listeners = new Set();
    storeListeners.set(messageId, listeners);
  }
  listeners.add(listener);
  return () => {
    listeners?.delete(listener);
    if (listeners?.size === 0) {
      storeListeners.delete(messageId);
    }
  };
}

async function loadReactions(messageId: string) {
  updateStoreState(messageId, (s) => ({ ...s, isLoading: true }));
  const result = await fetchMessageReactions(globalApiBase, messageId);
  if (result.ok) {
    updateStoreState(messageId, (s) => ({
      ...s,
      serverReactions: result.data,
      isLoading: false,
      error: null,
    }));
  } else {
    updateStoreState(messageId, (s) => ({ ...s, isLoading: false }));
  }
}

function initSocket() {
  if (isSocketInitialized) return;
  isSocketInitialized = true;

  onRealtimeReactionAdded((event) => {
    if (!storeStates.has(event.messageId)) return;
    updateStoreState(event.messageId, (prev) => {
      const existing = prev.serverReactions.find((r) => r.emoji === event.emoji);
      const isSelf = globalCurrentUserId ? event.userId === globalCurrentUserId : false;

      if (existing) {
        if (existing.userIds?.includes(event.userId)) return prev;
        return {
          ...prev,
          serverReactions: prev.serverReactions.map((r) =>
            r.emoji === event.emoji
              ? {
                  ...r,
                  count: r.count + 1,
                  userIds: [...(r.userIds || []), event.userId],
                  reacted: isSelf ? true : r.reacted,
                }
              : r,
          ),
        };
      }
      return {
        ...prev,
        serverReactions: [
          ...prev.serverReactions,
          {
            emoji: event.emoji,
            count: 1,
            reacted: isSelf,
            userIds: [event.userId],
          },
        ],
      };
    });
  });

  onRealtimeReactionRemoved((event) => {
    if (!storeStates.has(event.messageId)) return;
    updateStoreState(event.messageId, (prev) => {
      const existing = prev.serverReactions.find((r) => r.emoji === event.emoji);
      if (!existing || !existing.userIds?.includes(event.userId)) return prev;

      const isSelf = globalCurrentUserId ? event.userId === globalCurrentUserId : false;
      const newCount = existing.count - 1;

      if (newCount <= 0) {
        return {
          ...prev,
          serverReactions: prev.serverReactions.filter((r) => r.emoji !== event.emoji),
        };
      }

      return {
        ...prev,
        serverReactions: prev.serverReactions.map((r) =>
          r.emoji === event.emoji
            ? {
                ...r,
                count: newCount,
                userIds: (r.userIds || []).filter((id) => id !== event.userId),
                reacted: isSelf ? false : r.reacted,
              }
            : r,
        ),
      };
    });
  });

  onRealtimeReconnect(() => {
    // Refetch all actively tracked messages
    for (const messageId of storeListeners.keys()) {
      void loadReactions(messageId);
    }
  });
}

async function executeOp(
  messageId: string,
  emoji: string,
  type: 'add' | 'remove',
): Promise<boolean> {
  updateStoreState(messageId, (s) => ({ ...s, error: null }));

  const msgVersions = opVersions.get(messageId) ?? {};
  const version = (msgVersions[emoji] ?? 0) + 1;
  msgVersions[emoji] = version;
  opVersions.set(messageId, msgVersions);

  updateStoreState(messageId, (s) => ({
    ...s,
    pendingOps: { ...s.pendingOps, [emoji]: { type, version } },
  }));

  const isAdd = type === 'add';
  const apiCall = isAdd ? addMessageReaction : removeMessageReaction;
  let isSuccess = false;

  const task = async () => {
    const result = await apiCall(globalApiBase, messageId, emoji);

    const currentVersions = opVersions.get(messageId) ?? {};
    if (currentVersions[emoji] !== version) return;

    if (!result.ok) {
      updateStoreState(messageId, (s) => {
        const nextOps = { ...s.pendingOps };
        if (nextOps[emoji]?.version === version) {
          delete nextOps[emoji];
        }
        return {
          ...s,
          error: result.message ?? `Couldn't ${type} reaction. Try again.`,
          pendingOps: nextOps,
        };
      });
      return;
    }

    isSuccess = true;
    await loadReactions(messageId);

    const finalVersions = opVersions.get(messageId) ?? {};
    if (finalVersions[emoji] === version) {
      updateStoreState(messageId, (s) => {
        const nextOps = { ...s.pendingOps };
        delete nextOps[emoji];
        return { ...s, pendingOps: nextOps };
      });
    }
  };

  const msgQueues = queues.get(messageId) ?? {};
  const currentQueue = msgQueues[emoji] || Promise.resolve();
  const nextQueue = currentQueue.then(task).catch(() => {});
  msgQueues[emoji] = nextQueue;
  queues.set(messageId, msgQueues);

  await nextQueue;
  return isSuccess;
}

export function useMessageReactions({
  messageId,
  currentUserId,
  apiBase = process.env.NEXT_PUBLIC_API_URL ?? '',
  initialReactions,
}: UseMessageReactionsOptions): UseMessageReactionsResult {
  // Update globals for event handlers
  if (currentUserId) globalCurrentUserId = currentUserId;
  if (apiBase) globalApiBase = apiBase;

  initSocket();

  // Initialize state if not present
  useEffect(() => {
    if (!storeStates.has(messageId)) {
      if (initialReactions) {
        updateStoreState(messageId, (s) => ({
          ...s,
          serverReactions: initialReactions,
          isLoading: false,
        }));
      }
      void loadReactions(messageId);
    }
  }, [messageId, initialReactions]);

  const state = useSyncExternalStore(
    useCallback((listener) => subscribeStore(messageId, listener), [messageId]),
    () => getStoreState(messageId),
    () => getStoreState(messageId),
  );

  const derivedReactions = useMemo(() => {
    const result = [...state.serverReactions];

    for (const [emoji, op] of Object.entries(state.pendingOps)) {
      const existingIndex = result.findIndex((r) => r.emoji === emoji);
      const existing = existingIndex >= 0 ? result[existingIndex] : null;

      if (op.type === 'add') {
        if (existing) {
          if (!existing.reacted) {
            result[existingIndex] = { ...existing, count: existing.count + 1, reacted: true };
          }
        } else {
          result.push({ emoji, count: 1, reacted: true, userIds: [] });
        }
      } else if (op.type === 'remove') {
        if (existing && existing.reacted) {
          const newCount = existing.count - 1;
          if (newCount <= 0) {
            result.splice(existingIndex, 1);
          } else {
            result[existingIndex] = { ...existing, count: newCount, reacted: false };
          }
        }
      }
    }

    return result;
  }, [state.serverReactions, state.pendingOps]);

  const add = useCallback((emoji: string) => executeOp(messageId, emoji, 'add'), [messageId]);
  const remove = useCallback((emoji: string) => executeOp(messageId, emoji, 'remove'), [messageId]);

  const toggle = useCallback(
    async (emoji: string): Promise<boolean> => {
      const existing = derivedReactions.find((r) => r.emoji === emoji);
      if (existing?.reacted) {
        return remove(emoji);
      } else {
        return add(emoji);
      }
    },
    [derivedReactions, add, remove],
  );

  const clearError = useCallback(() => {
    updateStoreState(messageId, (s) => ({ ...s, error: null }));
  }, [messageId]);

  const refetch = useCallback(() => loadReactions(messageId), [messageId]);

  return {
    reactions: derivedReactions,
    isLoading: state.isLoading,
    loading: state.isLoading,
    error: state.error,
    toggleReaction: toggle,
    addReaction: add,
    removeReaction: remove,
    clearError,
    refetch,
  };
}

export function __resetStoreForTesting() {
  storeStates.clear();
  storeListeners.clear();
  queues.clear();
  opVersions.clear();
  isSocketInitialized = false;
  globalApiBase = '';
  globalCurrentUserId = null;
}
