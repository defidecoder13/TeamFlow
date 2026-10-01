/**
 * Pending-invitation list state (Phase 2F-B).
 *
 * Mirrors the `useWorkspaces` pattern: loading → ready | unauthenticated |
 * error, with retry for failures. Newly created invitations arrive through
 * refetch (`retry`), never fabricated client-side merges.
 */

'use client';

import { useCallback, useEffect, useState } from 'react';
import { getApiBaseUrl } from './config';
import { fetchPendingInvitations, type PendingInvitation } from './invitations';

export type PendingInvitationsState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'ready'; invitations: PendingInvitation[] }
  | { status: 'unauthenticated' }
  | { status: 'error'; message: string };

const LOAD_FAILURE_MESSAGE =
  'Could not load pending invitations. Check your connection and try again.';

export function usePendingInvitations(workspaceId: string | null): {
  state: PendingInvitationsState;
  retry: () => void;
} {
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<PendingInvitationsState>({ status: 'idle' });

  const retry = useCallback(() => {
    setAttempt((count) => count + 1);
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
      const result = await fetchPendingInvitations(apiBase, id);
      if (cancelled) {
        return;
      }
      if (result.ok) {
        setState({ status: 'ready', invitations: result.invitations });
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

  return { state, retry };
}
