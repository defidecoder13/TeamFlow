/**
 * Single workspace channel state (Phase 3B).
 *
 * Fetches the authoritative channel record by slug (the backend enforces
 * private-channel access per request). Inaccessible channels report as
 * not found — the client never distinguishes missing from forbidden.
 */

'use client';

import { useCallback, useEffect, useState } from 'react';
import { getApiBaseUrl } from './config';
import { fetchChannel, type Channel } from './channels';
import { onRealtimeChannelDeleted, onRealtimeChannelMembershipRemoved } from './realtime-client';

export type WorkspaceChannelState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'ready'; channel: Channel }
  | { status: 'unauthenticated' }
  | { status: 'notFound' }
  | { status: 'error'; message: string };

const LOAD_FAILURE_MESSAGE = 'Could not load the channel. Check your connection and try again.';

export function useWorkspaceChannel(
  workspaceId: string | null,
  slug: string,
): { state: WorkspaceChannelState; retry: () => void; setChannel: (channel: Channel) => void } {
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<WorkspaceChannelState>(() =>
    workspaceId ? { status: 'loading' } : { status: 'idle' },
  );
  const [prevKey, setPrevKey] = useState(() => `${workspaceId}:${slug}`);

  const currentKey = `${workspaceId}:${slug}`;
  if (prevKey !== currentKey) {
    setPrevKey(currentKey);
    setState(workspaceId ? { status: 'loading' } : { status: 'idle' });
  }

  const retry = useCallback(() => {
    setAttempt((count) => count + 1);
  }, []);

  /**
   * Replace state with an updated record (e.g. after PATCH) without
   * refetching. Only applies while a channel is loaded.
   */
  const setChannel = useCallback((channel: Channel) => {
    setState((current) => {
      if (current.status !== 'ready') {
        return current;
      }
      return { status: 'ready', channel };
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
      const result = await fetchChannel(apiBase, id, slug);
      if (cancelled) {
        return;
      }
      if (result.ok) {
        setState({ status: 'ready', channel: result.channel });
        return;
      }
      if (result.kind === 'unauthenticated') {
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
  }, [workspaceId, slug, attempt]);

  useEffect(() => {
    // Server-pushed removal while viewing: the open view becomes
    // inaccessible immediately (same generic notFound as a 404 fetch).
    const unsubscribeRemoved = onRealtimeChannelMembershipRemoved((event) => {
      if (event.workspaceId !== workspaceId) return;
      setState((current) => {
        if (current.status !== 'ready' || current.channel.id !== event.channelId) {
          return current;
        }
        return { status: 'notFound' };
      });
    });
    // Server-pushed deletion elsewhere: same treatment for the open view.
    const unsubscribeDeleted = onRealtimeChannelDeleted((event) => {
      if (event.workspaceId !== workspaceId) return;
      setState((current) => {
        if (current.status !== 'ready' || current.channel.id !== event.channelId) {
          return current;
        }
        return { status: 'notFound' };
      });
    });
    return () => {
      unsubscribeRemoved();
      unsubscribeDeleted();
    };
  }, [workspaceId]);

  return { state, retry, setChannel };
}
