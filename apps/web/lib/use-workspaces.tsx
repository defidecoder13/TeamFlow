/**
 * Client-side workspace list state (Phase 2B, shared since Phase A).
 *
 * Single authoritative source: `WorkspacesProvider` (mounted once in the
 * `/app` layout) owns exactly one fetch loop and one workspace list, and
 * every consumer (`WorkspaceRail`, pages, `AppShell` props) reads the same
 * state via `useWorkspaces()`. This replaces the previous per-component
 * `useWorkspaces(enabled)` instances, which diverged: a rail switch updated
 * only rail state while `AppShell`/sidebar props stayed stale.
 *
 * Mirrors the `useSessionUser` pattern: loading → ready | unauthenticated |
 * error, with an explicit retry that refetches. Enabled only once the
 * session is authenticated so unauthenticated visitors never fire the call.
 */

'use client';

import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { getApiBaseUrl } from './config';
import { useSessionUser } from './use-session-user';
import {
  onRealtimeReconnect,
  onRealtimeWorkspaceDeleted,
  onRealtimeWorkspaceMembershipRemoved,
} from './realtime-client';
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

export interface WorkspacesStore {
  state: WorkspacesState;
  retry: () => void;
  addWorkspace: (workspace: WorkspaceSummary) => void;
  setCurrentWorkspace: (workspaceId: string) => void;
  updateWorkspace: (workspace: WorkspaceSummary) => void;
  removeWorkspace: (workspaceId: string) => void;
  resyncWorkspaces: () => void;
}

const WorkspacesContext = createContext<WorkspacesStore | null>(null);

/**
 * The single stateful workspace store. Kept separate from the context
 * consumer so the fetch/merge logic stays testable in isolation.
 */
export function useWorkspacesStore(enabled: boolean): WorkspacesStore {
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<WorkspacesState>({ status: 'idle' });

  const retry = useCallback(() => {
    setAttempt((count) => count + 1);
  }, []);

  // Tracks readiness for callbacks that must behave differently when the
  // list has never loaded (e.g. creating from the rail while in error state).
  // Synced in an effect so it always reflects committed state.
  const statusRef = useRef<WorkspacesState['status']>('idle');
  useEffect(() => {
    statusRef.current = state.status;
  }, [state.status]);

  /**
   * Merge a freshly created workspace (from the POST response — never
   * fabricated) and make it current, without refetching or reloading. When
   * the list itself never loaded (loading/error), the merge target does not
   * exist, so refetch instead: the persisted id selects the new workspace
   * once the server truth arrives.
   */
  const addWorkspace = useCallback(
    (workspace: WorkspaceSummary) => {
      setStoredWorkspaceId(workspace.id);
      if (statusRef.current !== 'ready') {
        setAttempt((count) => count + 1);
        return;
      }
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
    },
    [setAttempt],
  );

  const setCurrentWorkspace = useCallback((workspaceId: string) => {
    setState((current) => {
      if (current.status !== 'ready') return current;
      const found = current.workspaces.find((w) => w.id === workspaceId);
      if (!found || current.current?.id === workspaceId) return current;
      // Persist only for workspaces actually in the list: a stored id for a
      // workspace the user cannot see would otherwise survive reloads until
      // the next list fetch clears it.
      setStoredWorkspaceId(workspaceId);
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

  // Ids of workspaces known deleted (own delete or workspace:deleted
  // push). Load responses are filtered against this set so a stale
  // in-flight fetch can never resurrect a deleted workspace. Ids are
  // randomUUIDs and never reused, so the set needs no eviction.
  const deletedIdsRef = useRef<Set<string>>(new Set());

  /**
   * Silent resync after reconnect (mirrors the DM/channel hooks): refetch
   * membership truth without flashing loading states. A deletion missed
   * while offline disappears here; failures keep existing state.
   */
  const resyncWorkspaces = useCallback(() => {
    void (async () => {
      let apiBase: string;
      try {
        apiBase = getApiBaseUrl();
      } catch {
        return;
      }
      const result = await fetchWorkspaces(apiBase);
      if (!result.ok) return;
      const workspaces = result.workspaces.filter((w) => !deletedIdsRef.current.has(w.id));
      setState({
        status: 'ready',
        workspaces,
        current: selectStoredWorkspace(workspaces),
      });
    })();
  }, []);

  const removeWorkspace = useCallback((workspaceId: string) => {
    const stored = getStoredWorkspaceId();
    if (stored === workspaceId) setStoredWorkspaceId(null);
    deletedIdsRef.current.add(workspaceId);
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
        const workspaces = result.workspaces.filter((w) => !deletedIdsRef.current.has(w.id));
        setState({
          status: 'ready',
          workspaces,
          current: selectStoredWorkspace(workspaces),
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

  return {
    state,
    retry,
    addWorkspace,
    setCurrentWorkspace,
    updateWorkspace,
    removeWorkspace,
    resyncWorkspaces,
  };
}

/**
 * Authoritative workspace provider. Mount once (in the `/app` layout) so
 * exactly one `GET /api/workspaces` loop exists no matter how many pages
 * or chrome components consume the list. Loading is gated on the shared
 * session: visitors without an authenticated session never fire the call,
 * matching the previous per-page `enabled` gating.
 */
export function WorkspacesProvider({ children }: { children: ReactNode }) {
  const session = useSessionUser();
  const store = useWorkspacesStore(session.status === 'authenticated');
  const { retry, removeWorkspace, resyncWorkspaces } = store;
  const router = useRouter();
  const stateRef = useRef(store.state);
  stateRef.current = store.state;
  useEffect(() => {
    // Server-pushed workspace removal (this user was removed elsewhere):
    // refetch membership truth so no stale workspace lingers in the rail,
    // selection, or downstream keyed hooks. Scoped by the server to this
    // user's private room, so only the victim ever receives it.
    const unsubscribeRemoved = onRealtimeWorkspaceMembershipRemoved(() => {
      retry();
    });
    // Server-pushed workspace deletion (deleted by its owner elsewhere):
    // drop it from navigation immediately. If it was selected, clear the
    // selection and leave workspace-scoped routes for /app, mirroring the
    // self-delete flow. Scoped by the server to pre-deletion members only.
    const unsubscribeDeleted = onRealtimeWorkspaceDeleted((event) => {
      const current = stateRef.current;
      const wasSelected = current.status === 'ready' && current.current?.id === event.workspaceId;
      removeWorkspace(event.workspaceId);
      if (wasSelected) {
        router.push('/app');
      }
    });
    // Reconnect drops server-side room membership; silently resync for
    // truth so a deletion missed while offline cannot linger.
    const unsubscribeReconnect = onRealtimeReconnect(() => {
      resyncWorkspaces();
    });
    return () => {
      unsubscribeRemoved();
      unsubscribeDeleted();
      unsubscribeReconnect();
    };
  }, [retry, removeWorkspace, resyncWorkspaces, router]);
  return <WorkspacesContext.Provider value={store}>{children}</WorkspacesContext.Provider>;
}

/**
 * Read the shared workspace store. Every consumer (rail, pages, shells)
 * sees the same list and current workspace, so a switch, creation, rename,
 * or deletion propagates immediately to all of them.
 */
export function useOptionalWorkspaces(): WorkspacesStore | null {
  return useContext(WorkspacesContext);
}

export function useWorkspaces(): WorkspacesStore {
  const store = useContext(WorkspacesContext);
  if (!store) {
    throw new Error('useWorkspaces must be used within a WorkspacesProvider.');
  }
  return store;
}
