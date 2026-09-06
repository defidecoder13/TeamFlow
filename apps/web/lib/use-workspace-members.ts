/**
 * Workspace members list state (Phase 2E).
 *
 * Mirrors the `useWorkspaces` pattern: loading → ready | unauthenticated |
 * error, with an explicit retry. Enabled with a workspace ID once the
 * session is authenticated.
 */

'use client';

import { useCallback, useEffect, useState } from 'react';
import { getApiBaseUrl } from './config';
import { fetchWorkspaceMembers, type WorkspaceMember } from './members';

export type WorkspaceMembersState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'ready'; members: WorkspaceMember[] }
  | { status: 'unauthenticated' }
  | { status: 'error'; message: string };

const LOAD_FAILURE_MESSAGE =
  'Could not load workspace members. Check your connection and try again.';

export function useWorkspaceMembers(workspaceId: string | null): {
  state: WorkspaceMembersState;
  retry: () => void;
} {
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<WorkspaceMembersState>({ status: 'idle' });

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
      const result = await fetchWorkspaceMembers(apiBase, id);
      if (cancelled) {
        return;
      }
      if (result.ok) {
        setState({ status: 'ready', members: result.members });
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
