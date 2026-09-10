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
import { fetchChannels, type Channel } from './channels';

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

  const addChannel = useCallback((channel: Channel) => {
    setState((current) => {
      if (current.status !== 'ready') {
        return current;
      }
      if (current.channels.some((existing) => existing.id === channel.id)) {
        return current;
      }
      return { status: 'ready', channels: [...current.channels, channel] };
    });
  }, []);

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
      window.removeEventListener('teamflow:channel:removed', onRemoved as EventListener);
      window.removeEventListener('teamflow:channel:updated', onUpdated as EventListener);
    };
  }, [workspaceId, removeChannel, updateChannelState]);

  return { state, retry, addChannel, updateChannelState, removeChannel };
}
