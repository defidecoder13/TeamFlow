/**
 * Direct messages conversation messages state (Phase 4F.4).
 *
 * Provides message history, keyset pagination (loadOlder), sending, editing,
 * deleting, and Socket.IO realtime event synchronization for a single 1-to-1
 * direct conversation.
 */

'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { getApiBaseUrl } from './config';
import {
  fetchDirectMessages,
  sendDirectMessage,
  editMessage,
  deleteMessage,
  markDirectConversationRead,
  messageFromJson,
  mergeMessages,
  type Message,
} from './messages';
import {
  connectRealtime,
  joinRealtimeDirectConversation,
  leaveRealtimeDirectConversation,
  onRealtimeMessageDeleted,
  onRealtimeMessageNew,
  onRealtimeMessageUpdated,
  onRealtimeReconnect,
} from './realtime-client';

export type DirectMessagesState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'ready'; messages: Message[]; hasMore: boolean; nextCursor: string | null }
  | { status: 'unauthenticated' }
  | { status: 'error'; message: string }
  | { status: 'notFound' };

const LOAD_FAILURE_MESSAGE = 'Could not load direct messages. Check your connection and try again.';

export function useDirectMessages(conversationId: string | null) {
  const [state, setState] = useState<DirectMessagesState>(
    conversationId ? { status: 'loading' } : { status: 'idle' },
  );
  const [isLoadingOlder, setIsLoadingOlder] = useState(false);
  const [loadOlderError, setLoadOlderError] = useState<string | null>(null);
  const isLoadingRef = useRef(false);
  const isSendingRef = useRef(false);
  const activeConversationIdRef = useRef<string | null>(conversationId);
  activeConversationIdRef.current = conversationId;

  const normalizeMessages = useCallback((messages: Message[]): Message[] => {
    return [...messages].reverse();
  }, []);

  const loadMessages = useCallback(async () => {
    if (!conversationId) {
      setState({ status: 'idle' });
      return;
    }

    const targetConversationId = conversationId;
    setState({ status: 'loading' });
    setIsLoadingOlder(false);
    setLoadOlderError(null);
    isLoadingRef.current = true;

    let apiBase: string;
    try {
      apiBase = getApiBaseUrl();
    } catch {
      isLoadingRef.current = false;
      if (activeConversationIdRef.current === targetConversationId) {
        setState({ status: 'error', message: LOAD_FAILURE_MESSAGE });
      }
      return;
    }

    let result: Awaited<ReturnType<typeof fetchDirectMessages>>;
    try {
      result = await fetchDirectMessages(apiBase, conversationId);
    } catch {
      isLoadingRef.current = false;
      if (activeConversationIdRef.current === targetConversationId) {
        setState({ status: 'error', message: LOAD_FAILURE_MESSAGE });
      }
      return;
    }
    isLoadingRef.current = false;

    if (activeConversationIdRef.current !== targetConversationId) {
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
      setState({ status: 'notFound' });
      return;
    }

    if (result.kind === 'validation' || result.kind === 'conflict' || result.kind === 'forbidden') {
      setState({ status: 'error', message: result.message ?? LOAD_FAILURE_MESSAGE });
      return;
    }

    setState({ status: 'error', message: LOAD_FAILURE_MESSAGE });
  }, [conversationId, normalizeMessages]);

  const retry = useCallback(() => {
    if (
      state.status === 'error' ||
      state.status === 'unauthenticated' ||
      state.status === 'notFound'
    ) {
      setState({ status: 'loading' });
      void loadMessages();
    }
  }, [state.status, loadMessages]);

  const loadOlder = useCallback(async () => {
    if (!conversationId || isLoadingRef.current) return;
    if (state.status !== 'ready' || !state.nextCursor) return;

    const targetConversationId = conversationId;
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
      const result = await fetchDirectMessages(apiBase, conversationId, {
        cursor: state.nextCursor,
      });
      if (activeConversationIdRef.current !== targetConversationId) return;
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
      if (activeConversationIdRef.current === targetConversationId) {
        setLoadOlderError(LOAD_FAILURE_MESSAGE);
      }
    } finally {
      isLoadingRef.current = false;
      if (activeConversationIdRef.current === targetConversationId) {
        setIsLoadingOlder(false);
      }
    }
  }, [conversationId, state, normalizeMessages]);

  const send = useCallback(
    async (body: string): Promise<{ ok: boolean; error?: string; messageId?: string }> => {
      const trimmed = body.trim();
      if (!trimmed) {
        return { ok: false, error: 'Message cannot be empty.' };
      }

      if (!conversationId) {
        return { ok: false, error: 'No conversation selected.' };
      }

      if (isSendingRef.current) {
        return { ok: false, error: 'A message is currently sending.' };
      }

      isSendingRef.current = true;
      const targetConversationId = conversationId;

      let apiBase: string;
      try {
        apiBase = getApiBaseUrl();
      } catch {
        isSendingRef.current = false;
        return { ok: false, error: LOAD_FAILURE_MESSAGE };
      }

      try {
        const result = await sendDirectMessage(apiBase, conversationId, trimmed);

        if (activeConversationIdRef.current !== targetConversationId) {
          return result.ok
            ? { ok: true }
            : { ok: false, error: 'Conversation changed during send.' };
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
          setState({ status: 'notFound' });
          return { ok: false, error: 'Conversation no longer available.' };
        }
        if (result.kind === 'forbidden') {
          return { ok: false, error: 'You do not have permission to send messages here.' };
        }
        return { ok: false, error: LOAD_FAILURE_MESSAGE };
      } finally {
        isSendingRef.current = false;
      }
    },
    [conversationId],
  );

  const edit = useCallback(
    async (messageId: string, body: string): Promise<{ ok: boolean; error?: string }> => {
      const trimmed = body.trim();
      if (!trimmed) {
        return { ok: false, error: 'Message cannot be empty.' };
      }

      if (!conversationId) {
        return { ok: false, error: 'No conversation selected.' };
      }

      const targetConversationId = conversationId;

      let apiBase: string;
      try {
        apiBase = getApiBaseUrl();
      } catch {
        return { ok: false, error: LOAD_FAILURE_MESSAGE };
      }

      const result = await editMessage(apiBase, messageId, trimmed);

      if (activeConversationIdRef.current !== targetConversationId) {
        return result.ok ? { ok: true } : { ok: false, error: 'Conversation changed during edit.' };
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
    [conversationId],
  );

  const remove = useCallback(
    async (messageId: string): Promise<{ ok: boolean; error?: string }> => {
      if (!conversationId) {
        return { ok: false, error: 'No conversation selected.' };
      }

      const targetConversationId = conversationId;

      let apiBase: string;
      try {
        apiBase = getApiBaseUrl();
      } catch {
        return { ok: false, error: LOAD_FAILURE_MESSAGE };
      }

      const result = await deleteMessage(apiBase, messageId);

      if (activeConversationIdRef.current !== targetConversationId) {
        return result.ok
          ? { ok: true }
          : { ok: false, error: 'Conversation changed during delete.' };
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
    [conversationId],
  );

  const lastMarkedMessageIdRef = useRef<string | null>(null);

  const markRead = useCallback(
    async (messageId?: string): Promise<boolean> => {
      if (!conversationId) return false;
      if (messageId && lastMarkedMessageIdRef.current === messageId) {
        return true;
      }
      try {
        const apiBase = getApiBaseUrl();
        const res = await markDirectConversationRead(
          apiBase,
          conversationId,
          messageId ? { messageId } : undefined,
        );
        if (res.ok) {
          if (messageId) {
            lastMarkedMessageIdRef.current = messageId;
          }
          return true;
        }
        return false;
      } catch {
        return false;
      }
    },
    [conversationId],
  );

  useEffect(() => {
    activeConversationIdRef.current = conversationId;
    lastMarkedMessageIdRef.current = null;
    void loadMessages();
  }, [conversationId, loadMessages]);

  useEffect(() => {
    if (!conversationId) return;

    const targetConversationId = conversationId;
    connectRealtime();
    void joinRealtimeDirectConversation(targetConversationId);

    const unsubscribeNew = onRealtimeMessageNew((event) => {
      const isTargetConversation =
        event.conversationId === activeConversationIdRef.current ||
        (typeof event.message === 'object' &&
          event.message !== null &&
          'directMessageConversationId' in event.message &&
          (event.message as { directMessageConversationId?: unknown })
            .directMessageConversationId === activeConversationIdRef.current);

      if (!isTargetConversation) return;
      if (event.channelId) return;

      const parsed = messageFromJson(event.message);
      if (!parsed) return;
      if (parsed.parentMessageId !== null && parsed.parentMessageId !== undefined) {
        return;
      }
      if (
        parsed.directMessageConversationId &&
        parsed.directMessageConversationId !== activeConversationIdRef.current
      ) {
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
      if (event.channelId) return;
      if (event.conversationId && event.conversationId !== activeConversationIdRef.current) return;

      const parsed = messageFromJson(event.message);
      if (!parsed) return;
      if (
        parsed.directMessageConversationId &&
        parsed.directMessageConversationId !== activeConversationIdRef.current
      ) {
        return;
      }

      setState((current) => {
        if (current.status !== 'ready') return current;
        const exists = current.messages.some((m) => m.id === parsed.id);
        if (!exists) return current;
        return {
          ...current,
          messages: current.messages.map((m) => (m.id === parsed.id ? parsed : m)),
        };
      });
    });

    const unsubscribeDeleted = onRealtimeMessageDeleted((event) => {
      if (event.channelId) return;
      if (event.conversationId && event.conversationId !== activeConversationIdRef.current) return;

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
      if (activeConversationIdRef.current !== targetConversationId) return;
      void joinRealtimeDirectConversation(targetConversationId);

      try {
        const apiBase = getApiBaseUrl();
        const res = await fetchDirectMessages(apiBase, targetConversationId);
        if (activeConversationIdRef.current !== targetConversationId || !res.ok) return;

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
      void leaveRealtimeDirectConversation(targetConversationId);
      unsubscribeNew();
      unsubscribeUpdated();
      unsubscribeDeleted();
      unsubscribeReconnect();
    };
  }, [conversationId, normalizeMessages]);

  return {
    state,
    retry,
    loadOlder,
    send,
    edit,
    remove,
    markRead,
    normalizeMessages,
    isLoadingOlder,
    loadOlderError,
  };
}
