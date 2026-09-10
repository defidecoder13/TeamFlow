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

const STORAGE_KEY = 'teamflow:workspaceId';

function getStoredWorkspaceId(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    // Ignore storage errors (private mode, quota, etc.)
    return null;
  }
}

function setStoredWorkspaceId(id: string | null): void {
  if (typeof window === 'undefined') return;
  try {
    if (id) localStorage.setItem(STORAGE_KEY, id);
    else localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Ignore storage errors (private mode, quota, etc.)
  }
}

function selectStoredWorkspace(workspaces: WorkspaceSummary[]): WorkspaceSummary | null {
  if (workspaces.length === 0) return null;
  const stored = getStoredWorkspaceId();
  if (stored) {
    const found = workspaces.find((w) => w.id === stored);
    if (found) return found;
    // Stored workspace no longer accessible (removed or not member) — clear
    setStoredWorkspaceId(null);
  }
  return selectInitialWorkspace(workspaces);
}

export function useWorkspaces(enabled: boolean): {
  state: WorkspacesState;
  retry: () => void;
  addWorkspace: (workspace: WorkspaceSummary) => void;
  setCurrentWorkspace: (workspaceId: string) => void;
  updateWorkspace: (workspace: WorkspaceSummary) => void;
  removeWorkspace: (workspaceId: string) => void;
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
    setStoredWorkspaceId(workspace.id);
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

  const setCurrentWorkspace = useCallback((workspaceId: string) => {
    setStoredWorkspaceId(workspaceId);
    setState((current) => {
      if (current.status !== 'ready') return current;
      const found = current.workspaces.find((w) => w.id === workspaceId);
      if (!found) return current;
      if (current.current?.id === workspaceId) return current;
      return { ...current, current: found };
    });
  }, []);

  const updateWorkspace = useCallback((workspace: WorkspaceSummary) => {
    setState((current) => {
      if (current.status !== 'ready') return current;
      const workspaces = current.workspaces.map((w) => (w.id === workspace.id ? workspace : w));
      const currentUpdated = current.current?.id === workspace.id ? workspace : current.current;
      return { ...current, workspaces, current: currentUpdated };
    });
  }, []);

  const removeWorkspace = useCallback((workspaceId: string) => {
    const stored = getStoredWorkspaceId();
    if (stored === workspaceId) setStoredWorkspaceId(null);
    setState((current) => {
      if (current.status !== 'ready') return current;
      const workspaces = current.workspaces.filter((w) => w.id !== workspaceId);
      if (workspaces.length === 0) return { status: 'ready', workspaces, current: null };
      if (current.current?.id !== workspaceId) return { ...current, workspaces };
      // Deleted current — pick stored if still valid, else first
      const nextCurrent = selectStoredWorkspace(workspaces);
      if (nextCurrent) setStoredWorkspaceId(nextCurrent.id);
      return { status: 'ready', workspaces, current: nextCurrent };
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
          current: selectStoredWorkspace(result.workspaces),
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

  return { state, retry, addWorkspace, setCurrentWorkspace, updateWorkspace, removeWorkspace };
}
