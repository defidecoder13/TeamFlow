/**
 * Private channel members hook (Phase 4K.2).
 *
 * Fetches members for a private channel, with loading/ready/error states and
 * mutation helpers that keep the list consistent via refetch on success.
 * No global state, no external library.
 */

'use client';

import { useCallback, useEffect, useState } from 'react';
import { getApiBaseUrl } from './config';
import {
  addChannelMember,
  fetchChannelMembers,
  removeChannelMember,
  type ChannelMember,
} from './channels';

export type ChannelMembersState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'ready'; members: ChannelMember[] }
  | { status: 'unauthenticated' }
  | { status: 'notFound' }
  | { status: 'error'; message: string };

const LOAD_FAILURE_MESSAGE = 'Could not load channel members.';

export function useChannelMembers(
  workspaceId: string | null,
  channelSlug: string | null,
  enabled: boolean,
): {
  state: ChannelMembersState;
  retry: () => void;
  addMember: (userId: string) => Promise<{ ok: boolean; error?: string }>;
  removeMember: (userId: string) => Promise<{ ok: boolean; error?: string }>;
} {
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<ChannelMembersState>({ status: 'idle' });

  const retry = useCallback(() => setAttempt((c) => c + 1), []);

  useEffect(() => {
    if (!enabled || !workspaceId || !channelSlug) {
      setState({ status: 'idle' });
      return;
    }
    let cancelled = false;
    setState({ status: 'loading' });

    async function load() {
      let apiBase: string;
      try {
        apiBase = getApiBaseUrl();
      } catch {
        if (!cancelled) setState({ status: 'error', message: LOAD_FAILURE_MESSAGE });
        return;
      }
      const result = await fetchChannelMembers(apiBase, workspaceId!, channelSlug!);
      if (cancelled) return;
      if (result.ok) {
        setState({ status: 'ready', members: result.members });
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
  }, [workspaceId, channelSlug, enabled, attempt]);

  const addMember = useCallback(
    async (userId: string) => {
      if (!workspaceId || !channelSlug) return { ok: false, error: 'Missing context.' };
      let apiBase: string;
      try {
        apiBase = getApiBaseUrl();
      } catch {
        return { ok: false, error: LOAD_FAILURE_MESSAGE };
      }
      const result = await addChannelMember(apiBase, workspaceId, channelSlug, userId);
      if (result.ok) {
        setState((prev) => {
          if (prev.status !== 'ready') return prev;
          // Avoid duplicate if race
          if (prev.members.some((m) => m.userId === userId)) return prev;
          return { status: 'ready', members: [...prev.members, result.member] };
        });
        return { ok: true };
      }
      if (result.kind === 'unauthenticated') {
        setState({ status: 'unauthenticated' });
        return { ok: false, error: 'Session expired.' };
      }
      return { ok: false, error: result.message ?? 'Could not add member.' };
    },
    [workspaceId, channelSlug],
  );

  const removeMember = useCallback(
    async (userId: string) => {
      if (!workspaceId || !channelSlug) return { ok: false, error: 'Missing context.' };
      let apiBase: string;
      try {
        apiBase = getApiBaseUrl();
      } catch {
        return { ok: false, error: LOAD_FAILURE_MESSAGE };
      }
      const result = await removeChannelMember(apiBase, workspaceId, channelSlug, userId);
      if (result.ok) {
        setState((prev) => {
          if (prev.status !== 'ready') return prev;
          return {
            status: 'ready',
            members: prev.members.filter((m) => m.userId !== userId),
          };
        });
        return { ok: true };
      }
      if (result.kind === 'unauthenticated') {
        setState({ status: 'unauthenticated' });
        return { ok: false, error: 'Session expired.' };
      }
      return { ok: false, error: result.message ?? 'Could not remove member.' };
    },
    [workspaceId, channelSlug],
  );

  return { state, retry, addMember, removeMember };
}
