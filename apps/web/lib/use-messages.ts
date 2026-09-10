'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { getApiBaseUrl } from './config';
import {
  fetchMessages,
  sendMessage,
  editMessage,
  deleteMessage,
  messageFromJson,
  mergeMessages,
  type Message,
} from './messages';
import {
  connectRealtime,
  joinRealtimeChannel,
  leaveRealtimeChannel,
  onRealtimeMessageDeleted,
  onRealtimeMessageNew,
  onRealtimeMessageUpdated,
  onRealtimeReconnect,
} from './realtime-client';

export type MessagesState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'ready'; messages: Message[]; hasMore: boolean; nextCursor: string | null }
  | { status: 'unauthenticated' }
  | { status: 'error'; message: string }
  | { status: 'channelNotFound' };

const LOAD_FAILURE_MESSAGE = 'Could not load messages. Check your connection and try again.';

export function useMessages(channelId: string | null) {
  const [state, setState] = useState<MessagesState>(
    channelId ? { status: 'loading' } : { status: 'idle' },
  );
  const [isLoadingOlder, setIsLoadingOlder] = useState(false);
  const [loadOlderError, setLoadOlderError] = useState<string | null>(null);
  const isLoadingRef = useRef(false);
  const isSendingRef = useRef(false);
  const activeChannelIdRef = useRef<string | null>(channelId);
  activeChannelIdRef.current = channelId;

  const normalizeMessages = useCallback((messages: Message[]): Message[] => {
    return [...messages].reverse();
  }, []);

  const retry = useCallback(() => {
    if (
      state.status === 'error' ||
      state.status === 'unauthenticated' ||
      state.status === 'channelNotFound'
    ) {
      setState({ status: 'loading' });
      void loadMessages();
    }
  }, [state.status]);

  const loadOlder = useCallback(async () => {
    if (!channelId || isLoadingRef.current) return;
    if (state.status !== 'ready' || !state.nextCursor) return;

    const targetChannelId = channelId;
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
      const result = await fetchMessages(apiBase, channelId, { cursor: state.nextCursor });
      if (activeChannelIdRef.current !== targetChannelId) return;
      if (!result || typeof result !== 'object') {
        setLoadOlderError(LOAD_FAILURE_MESSAGE);
        return;
      }

      if (result.ok) {
        const olderNormalized = normalizeMessages(result.data.messages);
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
      if (activeChannelIdRef.current === targetChannelId) {
        setLoadOlderError(LOAD_FAILURE_MESSAGE);
      }
    } finally {
      isLoadingRef.current = false;
      if (activeChannelIdRef.current === targetChannelId) {
        setIsLoadingOlder(false);
      }
    }
  }, [channelId, state, normalizeMessages]);

  const send = useCallback(
    async (body: string): Promise<{ ok: boolean; error?: string; messageId?: string }> => {
      const trimmed = body.trim();
      if (!trimmed) {
        return { ok: false, error: 'Message cannot be empty.' };
      }

      if (!channelId) {
        return { ok: false, error: 'No channel selected.' };
      }

      if (isSendingRef.current) {
        return { ok: false, error: 'A message is currently sending.' };
      }

      isSendingRef.current = true;
      const targetChannelId = channelId;

      let apiBase: string;
      try {
        apiBase = getApiBaseUrl();
      } catch {
        isSendingRef.current = false;
        return { ok: false, error: LOAD_FAILURE_MESSAGE };
      }

      try {
        const result = await sendMessage(apiBase, channelId, trimmed);

        if (activeChannelIdRef.current !== targetChannelId) {
          return result.ok ? { ok: true } : { ok: false, error: 'Channel changed during send.' };
        }

        if (result.ok) {
          const createdId = result.data.id;
          setState((current) => {
            if (current.status !== 'ready') {
              return {
                status: 'ready',
                messages: [result.data],
                hasMore: false,
                nextCursor: null,
              };
            }
            return {
              ...current,
              messages: mergeMessages(current.messages, [result.data], false),
            };
          });
          return { ok: true, messageId: createdId };
        }
        if ('unauthenticated' in result && result.unauthenticated) {
          setState({ status: 'unauthenticated' });
          return { ok: false, error: 'Session expired.' };
        }
        if (result.kind === 'validation') {
          return { ok: false, error: result.message ?? 'Invalid message.' };
        }
        if (result.kind === 'notFound') {
          setState({ status: 'channelNotFound' });
          return { ok: false, error: 'Channel no longer available.' };
        }
        if (result.kind === 'forbidden') {
          return { ok: false, error: 'You do not have permission to send messages here.' };
        }
        return { ok: false, error: LOAD_FAILURE_MESSAGE };
      } finally {
        isSendingRef.current = false;
      }
    },
    [channelId],
  );

  const edit = useCallback(
    async (messageId: string, body: string): Promise<{ ok: boolean; error?: string }> => {
      const trimmed = body.trim();
      if (!trimmed) {
        return { ok: false, error: 'Message cannot be empty.' };
      }

      if (!channelId) {
        return { ok: false, error: 'No channel selected.' };
      }

      const targetChannelId = channelId;

      let apiBase: string;
      try {
        apiBase = getApiBaseUrl();
      } catch {
        return { ok: false, error: LOAD_FAILURE_MESSAGE };
      }

      const result = await editMessage(apiBase, messageId, trimmed);

      if (activeChannelIdRef.current !== targetChannelId) {
        return result.ok ? { ok: true } : { ok: false, error: 'Channel changed during edit.' };
      }

      if (result.ok) {
        setState((current) => {
          if (current.status !== 'ready') return current;
          return {
            ...current,
            messages: current.messages.map((m) => (m.id === messageId ? result.data : m)),
          };
        });
        return { ok: true };
      }
      if ('unauthenticated' in result && result.unauthenticated) {
        setState({ status: 'unauthenticated' });
        return { ok: false, error: 'Session expired.' };
      }
      if (result.kind === 'validation') {
        return { ok: false, error: result.message ?? 'Invalid message.' };
      }
      if (result.kind === 'conflict') {
        return { ok: false, error: result.message ?? 'Message was modified.' };
      }
      if (result.kind === 'forbidden') {
        return { ok: false, error: 'You can only edit your own messages.' };
      }
      return { ok: false, error: LOAD_FAILURE_MESSAGE };
    },
    [channelId],
  );

  const remove = useCallback(
    async (messageId: string): Promise<{ ok: boolean; error?: string }> => {
      if (!channelId) {
        return { ok: false, error: 'No channel selected.' };
      }

      const targetChannelId = channelId;

      let apiBase: string;
      try {
        apiBase = getApiBaseUrl();
      } catch {
        return { ok: false, error: LOAD_FAILURE_MESSAGE };
      }

      const result = await deleteMessage(apiBase, messageId);

      if (activeChannelIdRef.current !== targetChannelId) {
        return result.ok ? { ok: true } : { ok: false, error: 'Channel changed during delete.' };
      }

      if (result.ok) {
        setState((current) => {
          if (current.status !== 'ready') return current;
          return {
            ...current,
            messages: current.messages.map((m) => (m.id === messageId ? result.data : m)),
          };
        });
        return { ok: true };
      }
      if ('unauthenticated' in result && result.unauthenticated) {
        setState({ status: 'unauthenticated' });
        return { ok: false, error: 'Session expired.' };
      }
      if (result.kind === 'forbidden') {
        return { ok: false, error: 'You can only delete your own messages.' };
      }
      return { ok: false, error: LOAD_FAILURE_MESSAGE };
    },
    [channelId],
  );

  const loadMessages = useCallback(async () => {
    if (!channelId) {
      setState({ status: 'idle' });
      return;
    }

    const targetChannelId = channelId;
    setState({ status: 'loading' });
    setIsLoadingOlder(false);
    setLoadOlderError(null);
    isLoadingRef.current = true;

    let apiBase: string;
    try {
      apiBase = getApiBaseUrl();
    } catch {
      isLoadingRef.current = false;
      if (activeChannelIdRef.current === targetChannelId) {
        setState({ status: 'error', message: LOAD_FAILURE_MESSAGE });
      }
      return;
    }

    let result: Awaited<ReturnType<typeof fetchMessages>>;
    try {
      result = await fetchMessages(apiBase, channelId);
    } catch {
      isLoadingRef.current = false;
      if (activeChannelIdRef.current === targetChannelId) {
        setState({ status: 'error', message: LOAD_FAILURE_MESSAGE });
      }
      return;
    }
    isLoadingRef.current = false;

    if (activeChannelIdRef.current !== targetChannelId) {
      return;
    }

    if (!result || typeof result !== 'object') {
      setState({ status: 'error', message: LOAD_FAILURE_MESSAGE });
      return;
    }

    if (result.ok) {
      const normalized = normalizeMessages(result.data.messages);
      const seen = new Set<string>();
      const deduplicated: Message[] = [];
      for (const m of normalized) {
        if (!seen.has(m.id)) {
          seen.add(m.id);
          deduplicated.push(m);
        }
      }
      setState({
        status: 'ready',
        messages: deduplicated,
        hasMore: result.data.pageInfo.hasMore,
        nextCursor: result.data.pageInfo.nextCursor,
      });
      return;
    }
    if ('unauthenticated' in result && result.unauthenticated) {
      setState({ status: 'unauthenticated' });
      return;
    }

    if (result.kind === 'notFound') {
      setState({ status: 'channelNotFound' });
      return;
    }

    if (result.kind === 'validation' || result.kind === 'conflict' || result.kind === 'forbidden') {
      setState({ status: 'error', message: result.message ?? LOAD_FAILURE_MESSAGE });
      return;
    }

    setState({ status: 'error', message: LOAD_FAILURE_MESSAGE });
  }, [channelId, normalizeMessages]);

  useEffect(() => {
    activeChannelIdRef.current = channelId;
    void loadMessages();
  }, [channelId, loadMessages]);

  useEffect(() => {
    if (!channelId) return;

    const targetChannelId = channelId;
    connectRealtime();
    void joinRealtimeChannel(targetChannelId);

    const unsubscribeNew = onRealtimeMessageNew((event) => {
      if (event.channelId !== activeChannelIdRef.current) return;
      const parsed = messageFromJson(event.message);
      if (!parsed) return;
      if (parsed.parentMessageId !== null && parsed.parentMessageId !== undefined) {
        return;
      }

      setState((current) => {
        if (current.status !== 'ready') return current;
        return {
          ...current,
          messages: mergeMessages(current.messages, [parsed], false),
        };
      });
    });

    const unsubscribeUpdated = onRealtimeMessageUpdated((event) => {
      if (event.channelId !== activeChannelIdRef.current) return;
      const parsed = messageFromJson(event.message);
      if (!parsed) return;

      setState((current) => {
        if (current.status !== 'ready') return current;
        return {
          ...current,
          messages: current.messages.map((m) => (m.id === parsed.id ? parsed : m)),
        };
      });
    });

    const unsubscribeDeleted = onRealtimeMessageDeleted((event) => {
      if (event.channelId !== activeChannelIdRef.current) return;

      setState((current) => {
        if (current.status !== 'ready') return current;
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
      if (activeChannelIdRef.current !== targetChannelId) return;
      void joinRealtimeChannel(targetChannelId);

      try {
        const apiBase = getApiBaseUrl();
        const res = await fetchMessages(apiBase, targetChannelId);
        if (activeChannelIdRef.current !== targetChannelId || !res.ok) return;

        const normalized = normalizeMessages(res.data.messages);
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
      void leaveRealtimeChannel(targetChannelId);
      unsubscribeNew();
      unsubscribeUpdated();
      unsubscribeDeleted();
      unsubscribeReconnect();
    };
  }, [channelId, normalizeMessages]);

  return {
    state,
    retry,
    loadOlder,
    send,
    edit,
    remove,
    normalizeMessages,
    isLoadingOlder,
    loadOlderError,
  };
}
