/**
 * Workspace direct message conversations list state (Phase 4F.3).
 *
 * Mirrors the useWorkspaceChannels pattern: loading → ready | unauthenticated |
 * error, with retry, plus local addConversation to prepend newly created/opened
 * conversations instantly without a full refetch.
 */

'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { getApiBaseUrl } from './config';
import {
  directConversationFromJson,
  fetchDirectConversations,
  type DirectConversation,
} from './messages';
import {
  connectRealtime,
  joinRealtimeDirectConversation,
  leaveRealtimeDirectConversation,
  onRealtimeConversationCreated,
  onRealtimeConversationRead,
  onRealtimeConversationUpdated,
  onRealtimeMessageNew,
  onRealtimeParticipantAdded,
  onRealtimeParticipantRemoved,
  onRealtimeReconnect,
} from './realtime-client';

export type DirectConversationsState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'ready'; conversations: DirectConversation[] }
  | { status: 'unauthenticated' }
  | { status: 'error'; message: string };

const LOAD_FAILURE_MESSAGE = 'Could not load direct messages. Check your connection and try again.';

export function useDirectConversations(
  workspaceId: string | null,
  currentUserId?: string | null,
): {
  state: DirectConversationsState;
  retry: () => void;
  addConversation: (conversation: DirectConversation) => void;
  markConversationLocallyRead: (conversationId: string, lastReadMessageId?: string | null) => void;
} {
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<DirectConversationsState>({ status: 'idle' });

  const retry = useCallback(() => {
    setAttempt((count) => count + 1);
  }, []);

  const joinedConversationIdsRef = useRef<Set<string>>(new Set());

  const addConversation = useCallback((conversation: DirectConversation) => {
    joinedConversationIdsRef.current.add(conversation.id);
    void joinRealtimeDirectConversation(conversation.id);
    setState((current) => {
      if (current.status !== 'ready') {
        return { status: 'ready', conversations: [conversation] };
      }
      const filtered = current.conversations.filter((c) => c.id !== conversation.id);
      return { status: 'ready', conversations: [conversation, ...filtered] };
    });
  }, []);

  const markConversationLocallyRead = useCallback(
    (conversationId: string, lastReadMessageId?: string | null) => {
      setState((current) => {
        if (current.status !== 'ready') return current;
        return {
          status: 'ready',
          conversations: current.conversations.map((c) => {
            if (c.id !== conversationId) return c;
            return {
              ...c,
              unreadCount: 0,
              hasUnread: false,
              lastReadMessageId:
                lastReadMessageId !== undefined ? lastReadMessageId : c.lastReadMessageId,
            };
          }),
        };
      });
    },
    [],
  );

  useEffect(() => {
    if (!workspaceId) {
      return;
    }
    const id = workspaceId;
    let cancelled = false;
    setState({ status: 'loading' });

    async function load() {
      let apiBase: string;
      try {
        apiBase = getApiBaseUrl();
      } catch {
        if (!cancelled) {
          setState({ status: 'error', message: LOAD_FAILURE_MESSAGE });
        }
        return;
      }
      const result = await fetchDirectConversations(apiBase, id);
      if (cancelled) {
        return;
      }
      if (result.ok) {
        setState({ status: 'ready', conversations: result.data.conversations });
        return;
      }
      if ('unauthenticated' in result && result.unauthenticated) {
        setState({ status: 'unauthenticated' });
        return;
      }
      setState({ status: 'error', message: LOAD_FAILURE_MESSAGE });
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [workspaceId, attempt]);

  // Join realtime rooms for all loaded conversations.
  //
  // The effect is keyed on the conversation membership set (sorted IDs), not on
  // the full state object: unread-count updates, renames, and other per-row
  // changes must not re-emit join events for every room. A ref tracks the rooms
  // this hook has already joined so only membership diffs produce socket calls
  // (join new rooms, leave removed ones — e.g. workspace switch or self-removal).
  // Reconnect rejoin is handled explicitly in the reconnect listener below,
  // because a fresh socket connection loses all server-side room membership.
  const conversationIdsKey =
    state.status === 'ready'
      ? state.conversations
          .map((c) => c.id)
          .sort()
          .join(',')
      : null;
  useEffect(() => {
    if (conversationIdsKey === null) return;
    connectRealtime();
    const currentIds = new Set(conversationIdsKey === '' ? [] : conversationIdsKey.split(','));
    for (const id of currentIds) {
      if (!joinedConversationIdsRef.current.has(id)) {
        joinedConversationIdsRef.current.add(id);
        void joinRealtimeDirectConversation(id);
      }
    }
    for (const id of Array.from(joinedConversationIdsRef.current)) {
      if (!currentIds.has(id)) {
        joinedConversationIdsRef.current.delete(id);
        void leaveRealtimeDirectConversation(id);
      }
    }
  }, [conversationIdsKey]);

  // Realtime listeners for message:new, conversation:read, and reconnect
  useEffect(() => {
    if (!workspaceId) return;

    connectRealtime();

    // Server-pushed creation (another session created a conversation this
    // user participates in): merge via addConversation, which dedupes by id,
    // prepends, and joins the realtime room. The server only emits to
    // participant rooms, so nothing unauthorized can arrive here.
    const unsubscribeCreated = onRealtimeConversationCreated((event) => {
      if (event.workspaceId !== workspaceId) return;
      const conversation = directConversationFromJson(event.conversation);
      if (!conversation) return;
      addConversation(conversation);
    });

    const unsubscribeNew = onRealtimeMessageNew((event) => {
      if (event.channelId) return;
      if (!event.conversationId) return;

      const rawMsg = event.message as Record<string, unknown> | null;
      if (!rawMsg) return;

      // Ignore thread replies for conversation unread count
      if (rawMsg.parentMessageId !== null && rawMsg.parentMessageId !== undefined) {
        return;
      }

      // Ignore messages authored by the current user
      const authorId =
        (rawMsg.authorId as string | undefined) ??
        (rawMsg.author && typeof rawMsg.author === 'object'
          ? ((rawMsg.author as Record<string, unknown>).id as string | undefined)
          : undefined);
      if (currentUserId && authorId === currentUserId) {
        return;
      }

      setState((current) => {
        if (current.status !== 'ready') return current;
        const exists = current.conversations.some((c) => c.id === event.conversationId);
        if (!exists) return current;

        return {
          status: 'ready',
          conversations: current.conversations.map((c) => {
            if (c.id !== event.conversationId) return c;
            const newCount = (c.unreadCount ?? 0) + 1;
            return {
              ...c,
              unreadCount: newCount,
              hasUnread: true,
            };
          }),
        };
      });
    });

    const unsubscribeRead = onRealtimeConversationRead((event) => {
      if (currentUserId && event.userId !== currentUserId) {
        return;
      }

      setState((current) => {
        if (current.status !== 'ready') return current;
        const exists = current.conversations.some((c) => c.id === event.conversationId);
        if (!exists) return current;

        return {
          status: 'ready',
          conversations: current.conversations.map((c) => {
            if (c.id !== event.conversationId) return c;
            return {
              ...c,
              unreadCount: 0,
              hasUnread: false,
              lastReadMessageId: event.lastReadMessageId,
            };
          }),
        };
      });
    });

    const unsubscribeUpdated = onRealtimeConversationUpdated((event) => {
      setState((current) => {
        if (current.status !== 'ready') return current;
        return {
          status: 'ready',
          conversations: current.conversations.map((c) => {
            if (c.id !== event.conversationId) return c;
            return {
              ...c,
              name: event.name !== undefined ? event.name : c.name,
              updatedAt: new Date(event.updatedAt),
            };
          }),
        };
      });
    });

    const unsubscribePartAdded = onRealtimeParticipantAdded((event) => {
      setState((current) => {
        if (current.status !== 'ready') return current;
        return {
          status: 'ready',
          conversations: current.conversations.map((c) => {
            if (c.id !== event.conversationId) return c;
            const alreadyIn = c.participants.some((p) => p.id === event.participant.id);
            const participants = alreadyIn
              ? c.participants
              : [
                  ...c.participants,
                  {
                    ...event.participant,
                    joinedAt: new Date(event.participant.joinedAt),
                  },
                ];
            return {
              ...c,
              participants,
              participantCount: (c.participantCount ?? c.participants.length) + (alreadyIn ? 0 : 1),
            };
          }),
        };
      });
    });

    const unsubscribePartRemoved = onRealtimeParticipantRemoved((event) => {
      setState((current) => {
        if (current.status !== 'ready') return current;
        if (currentUserId && event.userId === currentUserId) {
          return {
            status: 'ready',
            conversations: current.conversations.filter((c) => c.id !== event.conversationId),
          };
        }
        return {
          status: 'ready',
          conversations: current.conversations.map((c) => {
            if (c.id !== event.conversationId) return c;
            const participants = c.participants.filter((p) => p.id !== event.userId);
            return {
              ...c,
              participants,
              participantCount: Math.max(1, (c.participantCount ?? c.participants.length) - 1),
            };
          }),
        };
      });
    });

    const unsubscribeReconnect = onRealtimeReconnect(async () => {
      try {
        const apiBase = getApiBaseUrl();
        const result = await fetchDirectConversations(apiBase, workspaceId);
        if (result.ok) {
          // The reconnected socket starts with no server-side room membership,
          // so rejoin every conversation explicitly. The ref is reset first so
          // the membership effect above does not treat them as already joined.
          joinedConversationIdsRef.current.clear();
          for (const conv of result.data.conversations) {
            joinedConversationIdsRef.current.add(conv.id);
            void joinRealtimeDirectConversation(conv.id);
          }
          setState({ status: 'ready', conversations: result.data.conversations });
        }
      } catch {
        // Retain existing state if reconnect fetch fails
      }
    });

    return () => {
      unsubscribeCreated();
      unsubscribeNew();
      unsubscribeRead();
      unsubscribeUpdated();
      unsubscribePartAdded();
      unsubscribePartRemoved();
      unsubscribeReconnect();
    };
  }, [workspaceId, currentUserId, addConversation]);

  return { state, retry, addConversation, markConversationLocallyRead };
}
