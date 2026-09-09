'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { getApiBaseUrl } from './config';
import {
  deleteMessage,
  editMessage,
  fetchThreadReplies,
  messageFromJson,
  mergeMessages,
  sendThreadReply,
  type Message,
} from './messages';
import {
  connectRealtime,
  onRealtimeMessageDeleted,
  onRealtimeMessageNew,
  onRealtimeMessageUpdated,
  onRealtimeReconnect,
} from './realtime-client';

export type ThreadMessagesState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'ready'; messages: Message[]; hasMore: boolean; nextCursor: string | null }
  | { status: 'unauthenticated' }
  | { status: 'error'; message: string }
  | { status: 'notFound' };

const LOAD_FAILURE_MESSAGE = 'Could not load replies. Check your connection and try again.';

export function useThreadMessages(rootMessageId: string | null, channelId?: string | null) {
  const [state, setState] = useState<ThreadMessagesState>(
    rootMessageId ? { status: 'loading' } : { status: 'idle' },
  );
  const [isLoadingOlder, setIsLoadingOlder] = useState(false);
  const [loadOlderError, setLoadOlderError] = useState<string | null>(null);

  const isLoadingRef = useRef(false);
  const isSendingRef = useRef(false);
  const activeRootMessageIdRef = useRef<string | null>(rootMessageId);
  activeRootMessageIdRef.current = rootMessageId;
  const activeChannelIdRef = useRef<string | null>(channelId ?? null);
  activeChannelIdRef.current = channelId ?? null;

  // The backend returns replies newest-first ((createdAt, id) DESC).
  // The UI displays replies chronologically: oldest -> newest.
  const normalizeReplies = useCallback((replies: Message[]): Message[] => {
    return [...replies].reverse();
  }, []);

  const loadReplies = useCallback(
    async (targetRootId: string) => {
      isLoadingRef.current = true;
      let apiBase: string;
      try {
        apiBase = getApiBaseUrl();
      } catch {
        if (activeRootMessageIdRef.current === targetRootId) {
          setState({ status: 'error', message: LOAD_FAILURE_MESSAGE });
          isLoadingRef.current = false;
        }
        return;
      }

      try {
        const result = await fetchThreadReplies(apiBase, targetRootId);
        if (activeRootMessageIdRef.current !== targetRootId) return;

        if (result.ok) {
          setState({
            status: 'ready',
            messages: normalizeReplies(result.data.messages),
            hasMore: result.data.pageInfo.hasMore,
            nextCursor: result.data.pageInfo.nextCursor,
          });
        } else if ('unauthenticated' in result && result.unauthenticated) {
          setState({ status: 'unauthenticated' });
        } else if ('kind' in result && result.kind === 'notFound') {
          setState({ status: 'notFound' });
        } else {
          setState({
            status: 'error',
            message: result.message ?? LOAD_FAILURE_MESSAGE,
          });
        }
      } catch {
        if (activeRootMessageIdRef.current === targetRootId) {
          setState({ status: 'error', message: LOAD_FAILURE_MESSAGE });
        }
      } finally {
        if (activeRootMessageIdRef.current === targetRootId) {
          isLoadingRef.current = false;
        }
      }
    },
    [normalizeReplies],
  );

  useEffect(() => {
    activeRootMessageIdRef.current = rootMessageId;
    activeChannelIdRef.current = channelId ?? null;

    if (!rootMessageId) {
      setState({ status: 'idle' });
      return;
    }

    setState({ status: 'loading' });
    void loadReplies(rootMessageId);
  }, [rootMessageId, loadReplies]);

  useEffect(() => {
    if (!rootMessageId) return;

    try {
      connectRealtime();
    } catch {
      return;
    }

    const targetRootId = rootMessageId;

    const unsubscribeNew = onRealtimeMessageNew((event) => {
      if (activeChannelIdRef.current && event.channelId !== activeChannelIdRef.current) return;
      const parsed = messageFromJson(event.message);
      if (!parsed) return;

      // Ignore root channel messages or replies belonging to other threads
      if (parsed.parentMessageId !== activeRootMessageIdRef.current) return;

      setState((current) => {
        if (current.status !== 'ready') return current;
        return {
          ...current,
          messages: mergeMessages(current.messages, [parsed], false),
        };
      });
    });

    const unsubscribeUpdated = onRealtimeMessageUpdated((event) => {
      if (activeChannelIdRef.current && event.channelId !== activeChannelIdRef.current) return;
      const parsed = messageFromJson(event.message);
      if (!parsed) return;

      // If this updated message is a reply belonging to our thread:
      if (parsed.parentMessageId === activeRootMessageIdRef.current) {
        setState((current) => {
          if (current.status !== 'ready') return current;
          const exists = current.messages.some((m) => m.id === parsed.id);
          if (!exists) return current;
          return {
            ...current,
            messages: current.messages.map((m) => (m.id === parsed.id ? parsed : m)),
          };
        });
      }
    });

    const unsubscribeDeleted = onRealtimeMessageDeleted((event) => {
      if (activeChannelIdRef.current && event.channelId !== activeChannelIdRef.current) return;

      setState((current) => {
        if (current.status !== 'ready') return current;
        const exists = current.messages.some((m) => m.id === event.messageId);
        if (!exists) return current;
        return {
          ...current,
          messages: current.messages.map((m) =>
            m.id === event.messageId
              ? {
                  ...m,
                  body: null,
                  deletedAt: new Date(event.deletedAt),
                }
              : m,
          ),
        };
      });
    });

    const unsubscribeReconnect = onRealtimeReconnect(async () => {
      if (activeRootMessageIdRef.current !== targetRootId) return;
      try {
        const apiBase = getApiBaseUrl();
        const res = await fetchThreadReplies(apiBase, targetRootId);
        if (activeRootMessageIdRef.current !== targetRootId || !res.ok) return;

        const normalized = normalizeReplies(res.data.messages);
        setState((current) => {
          if (current.status !== 'ready') return current;
          return {
            ...current,
            messages: mergeMessages(current.messages, normalized, false),
          };
        });
      } catch {
        // Silently preserve current state if sync fetch fails
      }
    });

    return () => {
      unsubscribeNew();
      unsubscribeUpdated();
      unsubscribeDeleted();
      unsubscribeReconnect();
    };
  }, [rootMessageId, channelId, normalizeReplies]);

  const retry = useCallback(() => {
    if (rootMessageId) {
      setState({ status: 'loading' });
      void loadReplies(rootMessageId);
    }
  }, [rootMessageId, loadReplies]);

  const loadOlder = useCallback(async () => {
    if (!rootMessageId || isLoadingRef.current) return;
    if (state.status !== 'ready' || !state.nextCursor) return;

    const targetRootId = rootMessageId;
    isLoadingRef.current = true;
    setIsLoadingOlder(true);
    setLoadOlderError(null);

    let apiBase: string;
    try {
      apiBase = getApiBaseUrl();
    } catch {
      isLoadingRef.current = false;
      setIsLoadingOlder(false);
      setLoadOlderError(LOAD_FAILURE_MESSAGE);
      return;
    }

    try {
      const result = await fetchThreadReplies(apiBase, targetRootId, {
        cursor: state.nextCursor,
      });
      if (activeRootMessageIdRef.current !== targetRootId) return;

      if (result.ok) {
        const olderNormalized = normalizeReplies(result.data.messages);
        setState((current) => {
          if (current.status !== 'ready') return current;
          return {
            status: 'ready',
            messages: mergeMessages(current.messages, olderNormalized, true),
            hasMore: result.data.pageInfo.hasMore,
            nextCursor: result.data.pageInfo.nextCursor,
          };
        });
        setLoadOlderError(null);
      } else {
        setLoadOlderError(result.message ?? LOAD_FAILURE_MESSAGE);
      }
    } catch {
      if (activeRootMessageIdRef.current === targetRootId) {
        setLoadOlderError(LOAD_FAILURE_MESSAGE);
      }
    } finally {
      isLoadingRef.current = false;
      if (activeRootMessageIdRef.current === targetRootId) {
        setIsLoadingOlder(false);
      }
    }
  }, [rootMessageId, state, normalizeReplies]);

  const send = useCallback(
    async (body: string): Promise<{ ok: boolean; error?: string }> => {
      const trimmed = body.trim();
      if (!trimmed) {
        return { ok: false, error: 'Reply cannot be empty.' };
      }
      if (!rootMessageId || isSendingRef.current) {
        return { ok: false, error: 'Cannot send reply right now.' };
      }

      const targetRootId = rootMessageId;
      isSendingRef.current = true;
      let apiBase: string;
      try {
        apiBase = getApiBaseUrl();
      } catch {
        isSendingRef.current = false;
        return { ok: false, error: 'API base URL is not configured.' };
      }

      try {
        const result = await sendThreadReply(apiBase, targetRootId, trimmed);
        if (activeRootMessageIdRef.current !== targetRootId) {
          return { ok: false, error: 'Thread was closed.' };
        }
        if (!result.ok) {
          return { ok: false, error: result.message ?? 'Failed to send reply.' };
        }

        setState((current) => {
          if (current.status !== 'ready') return current;
          return {
            ...current,
            messages: mergeMessages(current.messages, [result.data], false),
          };
        });
        return { ok: true };
      } catch {
        return { ok: false, error: 'Network error while sending reply.' };
      } finally {
        isSendingRef.current = false;
      }
    },
    [rootMessageId],
  );

  const edit = useCallback(
    async (messageId: string, newBody: string): Promise<{ ok: boolean; error?: string }> => {
      const trimmed = newBody.trim();
      if (!trimmed) {
        return { ok: false, error: 'Message cannot be empty.' };
      }

      let apiBase: string;
      try {
        apiBase = getApiBaseUrl();
      } catch {
        return { ok: false, error: 'API base URL is not configured.' };
      }

      try {
        const result = await editMessage(apiBase, messageId, trimmed);
        if (!result.ok) {
          return { ok: false, error: result.message ?? 'Failed to edit message.' };
        }

        setState((current) => {
          if (current.status !== 'ready') return current;
          return {
            ...current,
            messages: current.messages.map((m) => (m.id === messageId ? result.data : m)),
          };
        });
        return { ok: true };
      } catch {
        return { ok: false, error: 'Network error while editing reply.' };
      }
    },
    [],
  );

  const remove = useCallback(
    async (messageId: string): Promise<{ ok: boolean; error?: string }> => {
      let apiBase: string;
      try {
        apiBase = getApiBaseUrl();
      } catch {
        return { ok: false, error: 'API base URL is not configured.' };
      }

      try {
        const result = await deleteMessage(apiBase, messageId);
        if (!result.ok) {
          return { ok: false, error: result.message ?? 'Failed to delete message.' };
        }

        setState((current) => {
          if (current.status !== 'ready') return current;
          return {
            ...current,
            messages: current.messages.map((m) => (m.id === messageId ? result.data : m)),
          };
        });
        return { ok: true };
      } catch {
        return { ok: false, error: 'Network error while deleting reply.' };
      }
    },
    [],
  );

  return {
    state,
    isLoadingOlder,
    loadOlderError,
    retry,
    loadOlder,
    send,
    edit,
    remove,
  };
}
