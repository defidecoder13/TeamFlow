/**
 * Single direct message conversation state (Phase 4F.3).
 *
 * Fetches the authoritative conversation record by ID (the backend enforces
 * participant membership per request). Inaccessible or non-existent conversations
 * report as notFound — the client never distinguishes missing from forbidden.
 */

'use client';

import { useCallback, useEffect, useState } from 'react';
import { getApiBaseUrl } from './config';
import { fetchDirectConversation, type DirectConversation } from './messages';
import {
  connectRealtime,
  joinRealtimeDirectConversation,
  onRealtimeConversationUpdated,
  onRealtimeParticipantAdded,
  onRealtimeParticipantRemoved,
  onRealtimeReconnect,
} from './realtime-client';

export type DirectConversationState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'ready'; conversation: DirectConversation }
  | { status: 'unauthenticated' }
  | { status: 'notFound' }
  | { status: 'error'; message: string };

const LOAD_FAILURE_MESSAGE =
  'Could not load the conversation. Check your connection and try again.';

export function useDirectConversation(
  conversationId: string | null,
  currentUserId?: string | null,
): {
  state: DirectConversationState;
  retry: () => void;
  setConversation: (conversation: DirectConversation) => void;
} {
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<DirectConversationState>(() =>
    conversationId ? { status: 'loading' } : { status: 'idle' },
  );
  const [prevKey, setPrevKey] = useState(() => conversationId);

  if (prevKey !== conversationId) {
    setPrevKey(conversationId);
    setState(conversationId ? { status: 'loading' } : { status: 'idle' });
  }

  const retry = useCallback(() => {
    setAttempt((count) => count + 1);
  }, []);

  const setConversation = useCallback((conversation: DirectConversation) => {
    setState((current) => {
      if (current.status !== 'ready') {
        return current;
      }
      return { status: 'ready', conversation };
    });
  }, []);

  useEffect(() => {
    if (!conversationId) {
      return;
    }
    const id = conversationId;
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
      const result = await fetchDirectConversation(apiBase, id);
      if (cancelled) {
        return;
      }
      if (result.ok) {
        setState({ status: 'ready', conversation: result.data });
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
      setState({ status: 'error', message: LOAD_FAILURE_MESSAGE });
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [conversationId, attempt]);

  useEffect(() => {
    if (!conversationId || state.status !== 'ready') return;

    connectRealtime();
    void joinRealtimeDirectConversation(conversationId);

    const unsubscribeUpdated = onRealtimeConversationUpdated((event) => {
      if (event.conversationId !== conversationId) return;
      setState((current) => {
        if (current.status !== 'ready') return current;
        return {
          status: 'ready',
          conversation: {
            ...current.conversation,
            name: event.name !== undefined ? event.name : current.conversation.name,
            updatedAt: new Date(event.updatedAt),
          },
        };
      });
    });

    const unsubscribePartAdded = onRealtimeParticipantAdded((event) => {
      if (event.conversationId !== conversationId) return;
      setState((current) => {
        if (current.status !== 'ready') return current;
        const alreadyIn = current.conversation.participants.some(
          (p) => p.id === event.participant.id,
        );
        const participants = alreadyIn
          ? current.conversation.participants
          : [
              ...current.conversation.participants,
              {
                ...event.participant,
                joinedAt: new Date(event.participant.joinedAt),
              },
            ];
        return {
          status: 'ready',
          conversation: {
            ...current.conversation,
            participants,
            participantCount:
              (current.conversation.participantCount ?? current.conversation.participants.length) +
              (alreadyIn ? 0 : 1),
          },
        };
      });
    });

    const unsubscribePartRemoved = onRealtimeParticipantRemoved((event) => {
      if (event.conversationId !== conversationId) return;
      if (currentUserId && event.userId === currentUserId) {
        setState({ status: 'notFound' });
        return;
      }
      setState((current) => {
        if (current.status !== 'ready') return current;
        const participants = current.conversation.participants.filter((p) => p.id !== event.userId);
        return {
          status: 'ready',
          conversation: {
            ...current.conversation,
            participants,
            participantCount: Math.max(
              1,
              (current.conversation.participantCount ?? current.conversation.participants.length) -
                1,
            ),
          },
        };
      });
    });

    const unsubscribeReconnect = onRealtimeReconnect(async () => {
      try {
        const apiBase = getApiBaseUrl();
        const result = await fetchDirectConversation(apiBase, conversationId);
        if (result.ok) {
          setState({ status: 'ready', conversation: result.data });
        }
      } catch {
        // retain existing state
      }
    });

    return () => {
      unsubscribeUpdated();
      unsubscribePartAdded();
      unsubscribePartRemoved();
      unsubscribeReconnect();
    };
  }, [conversationId, state.status, currentUserId]);

  return { state, retry, setConversation };
}
