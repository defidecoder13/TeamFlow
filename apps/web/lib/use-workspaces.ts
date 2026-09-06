/**
 * Client-side workspace list state (Phase 2B).
 *
 * Mirrors the `useSessionUser` pattern: loading → ready | unauthenticated |
 * error, with an explicit retry that refetches. Enabled only once the
 * session is authenticated so unauthenticated visitors never fire the call.
 */

'use client';

import { useCallback, useEffect, useState } from 'react';
import { getApiBaseUrl } from './config';
import { fetchWorkspaces, selectInitialWorkspace, type WorkspaceSummary } from './workspaces';

export type WorkspacesState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'ready'; workspaces: WorkspaceSummary[]; current: WorkspaceSummary | null }
  | { status: 'unauthenticated' }
  | { status: 'error'; message: string };

const LOAD_FAILURE_MESSAGE = 'Could not load your workspaces. Check your connection and try again.';

export function useWorkspaces(enabled: boolean): {
  state: WorkspacesState;
  retry: () => void;
  addWorkspace: (workspace: WorkspaceSummary) => void;
} {
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<WorkspacesState>({ status: 'idle' });

  const retry = useCallback(() => {
    setAttempt((count) => count + 1);
  }, []);

  /**
   * Merge a freshly created workspace (from the POST response — never
   * fabricated) and make it current, without refetching or reloading.
   */
  const addWorkspace = useCallback((workspace: WorkspaceSummary) => {
    setState((current) => {
      if (current.status !== 'ready') {
        return current;
      }
      return {
        status: 'ready',
        workspaces: [...current.workspaces, workspace],
        current: workspace,
      };
    });
  }, []);

  useEffect(() => {
    if (!enabled) {
      return;
    }
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
      const result = await fetchWorkspaces(apiBase);
      if (cancelled) {
        return;
      }
      if (result.ok) {
        setState({
          status: 'ready',
          workspaces: result.workspaces,
          current: selectInitialWorkspace(result.workspaces),
        });
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
  }, [enabled, attempt]);

  return { state, retry, addWorkspace };
}
