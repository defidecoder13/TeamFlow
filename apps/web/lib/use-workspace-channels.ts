/**
 * Workspace channel list state (Phase 3B).
 *
 * Mirrors the `useWorkspaces` pattern: loading → ready | unauthenticated |
 * error, with retry, plus local add/update merges so creation and edits
 * apply instantly from real API responses — no refetch, no reload.
 */

'use client';

import { useCallback, useEffect, useState } from 'react';
import { getApiBaseUrl } from './config';
import { fetchChannels, isChannel, type Channel } from './channels';
import {
  onRealtimeChannelCreated,
  onRealtimeChannelDeleted,
  onRealtimeChannelMembershipRemoved,
  onRealtimeChannelUpdated,
  onRealtimeReconnect,
} from './realtime-client';

export type WorkspaceChannelsState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'ready'; channels: Channel[] }
  | { status: 'unauthenticated' }
  | { status: 'error'; message: string };

const LOAD_FAILURE_MESSAGE = 'Could not load channels. Check your connection and try again.';

export function useWorkspaceChannels(workspaceId: string | null): {
  state: WorkspaceChannelsState;
  retry: () => void;
  addChannel: (channel: Channel) => void;
  updateChannelState: (channel: Channel) => void;
  removeChannel: (channelId: string) => void;
} {
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<WorkspaceChannelsState>({ status: 'idle' });

  const retry = useCallback(() => {
    setAttempt((count) => count + 1);
  }, []);

  // Ordered insert matching the server's (name asc, id asc) list order,
  // shared by local creates and channel:created pushes. Dedupes by id so
  // REST/event races and double delivery never duplicate a row.
  const insertChannelOrdered = useCallback((channel: Channel) => {
    setState((current) => {
      if (current.status !== 'ready') {
        return current;
      }
      if (current.channels.some((existing) => existing.id === channel.id)) {
        return current;
      }
      const channels = [...current.channels, channel].sort((a, b) =>
        a.name === b.name ? (a.id < b.id ? -1 : 1) : a.name < b.name ? -1 : 1,
      );
      return { status: 'ready', channels };
    });
  }, []);

  const addChannel = insertChannelOrdered;

  const updateChannelState = useCallback((channel: Channel) => {
    setState((current) => {
      if (current.status !== 'ready') {
        return current;
      }
      return {
        status: 'ready',
        channels: current.channels.map((existing) =>
          existing.id === channel.id ? channel : existing,
        ),
      };
    });
  }, []);

  const removeChannel = useCallback((channelId: string) => {
    setState((current) => {
      if (current.status !== 'ready') return current;
      return { status: 'ready', channels: current.channels.filter((c) => c.id !== channelId) };
    });
  }, []);

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
      const result = await fetchChannels(apiBase, id);
      if (cancelled) {
        return;
      }
      if (result.ok) {
        setState({ status: 'ready', channels: result.channels });
        return;
      }
      if (result.unauthenticated) {
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

  useEffect(() => {
    // Server-pushed removal (this user was kicked from a private channel):
    // drop it from the list immediately instead of waiting for a refetch.
    const unsubscribeMembershipRemoved = onRealtimeChannelMembershipRemoved((event) => {
      if (event.workspaceId !== workspaceId) return;
      removeChannel(event.channelId);
    });
    // Server-pushed creation (another session created a channel): merge it
    // in. The server only emits to rooms authorized to see the channel, so
    // no private data can arrive here; validate shape defensively anyway.
    const unsubscribeCreated = onRealtimeChannelCreated((event) => {
      if (event.workspaceId !== workspaceId) return;
      if (!isChannel(event.channel)) return;
      insertChannelOrdered(event.channel);
    });
    // Server-pushed edit (rename/description): merge by id. Slug changes
    // arrive here too; open views on a stale slug fall through to the
    // existing not-found view instead of auto-navigating.
    const unsubscribeUpdated = onRealtimeChannelUpdated((event) => {
      if (event.workspaceId !== workspaceId) return;
      if (!isChannel(event.channel)) return;
      updateChannelState(event.channel);
    });
    // Server-pushed deletion: drop the row. Open views mark themselves
    // inaccessible via the single-channel hook below.
    const unsubscribeDeleted = onRealtimeChannelDeleted((event) => {
      if (event.workspaceId !== workspaceId) return;
      removeChannel(event.channelId);
    });
    // Reconnect drops server-side room membership; refetch for truth.
    const unsubscribeReconnect = onRealtimeReconnect(() => {
      retry();
    });
    function onRemoved(e: Event) {
      const detail = (e as CustomEvent<{ channelId: string; workspaceId: string }>).detail;
      if (!detail || detail.workspaceId !== workspaceId) return;
      removeChannel(detail.channelId);
    }
    function onUpdated(e: Event) {
      const detail = (e as CustomEvent<{ channel: Channel; workspaceId: string }>).detail;
      if (!detail || detail.workspaceId !== workspaceId) return;
      updateChannelState(detail.channel);
    }
    window.addEventListener('teamflow:channel:removed', onRemoved as EventListener);
    window.addEventListener('teamflow:channel:updated', onUpdated as EventListener);
    return () => {
      unsubscribeMembershipRemoved();
      unsubscribeCreated();
      unsubscribeUpdated();
      unsubscribeDeleted();
      unsubscribeReconnect();
      window.removeEventListener('teamflow:channel:removed', onRemoved as EventListener);
      window.removeEventListener('teamflow:channel:updated', onUpdated as EventListener);
    };
  }, [workspaceId, removeChannel, updateChannelState, insertChannelOrdered, retry]);

  return { state, retry, addChannel, updateChannelState, removeChannel };
}
