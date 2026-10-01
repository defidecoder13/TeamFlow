/**
 * Workspace drafts list state (Audit 13).
 *
 * Mirrors `useMentions`: request key is the workspace id (switches reset
 * everything), monotonic attempt ids drop stale responses. Discard removes
 * the row locally after a successful DELETE.
 */

'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { getApiBaseUrl } from './config';
import {
  deleteWorkspaceDraft,
  fetchWorkspaceDrafts,
  type DraftListItem,
} from './drafts';

export type DraftsState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'ready'; drafts: DraftListItem[] }
  | { status: 'unauthenticated' }
  | { status: 'error'; message: string };

const LOAD_FAILURE_MESSAGE = 'Could not load drafts. Check your connection and try again.';

export function useDrafts(workspaceId: string | null): {
  state: DraftsState;
  discard: (draftId: string) => Promise<boolean>;
  isDiscarding: boolean;
  discardError: string | null;
  retry: () => void;
} {
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<DraftsState>({ status: 'idle' });
  const [isDiscarding, setIsDiscarding] = useState(false);
  const [discardError, setDiscardError] = useState<string | null>(null);

  const requestIdRef = useRef(0);
  const activeWorkspaceRef = useRef<string | null>(workspaceId);
  activeWorkspaceRef.current = workspaceId;

  const retry = useCallback(() => {
    setAttempt((count) => count + 1);
  }, []);

  const load = useCallback(async (workspace: string) => {
    const requestId = ++requestIdRef.current;
    let apiBase: string;
    try {
      apiBase = getApiBaseUrl();
    } catch {
      if (activeWorkspaceRef.current === workspace && requestId === requestIdRef.current) {
        setState({ status: 'error', message: LOAD_FAILURE_MESSAGE });
      }
      return;
    }

    try {
      const result = await fetchWorkspaceDrafts(apiBase, workspace);
      if (activeWorkspaceRef.current !== workspace || requestId !== requestIdRef.current) {
        return;
      }
      if (result.ok) {
        setState({ status: 'ready', drafts: result.data.drafts });
        return;
      }
      if ('unauthenticated' in result && result.unauthenticated) {
        setState({ status: 'unauthenticated' });
        return;
      }
      setState({ status: 'error', message: LOAD_FAILURE_MESSAGE });
    } catch {
      if (activeWorkspaceRef.current === workspace && requestId === requestIdRef.current) {
        setState({ status: 'error', message: LOAD_FAILURE_MESSAGE });
      }
    }
  }, []);

  useEffect(() => {
    requestIdRef.current += 1;
    setDiscardError(null);

    if (!workspaceId) {
      setState({ status: 'idle' });
      return;
    }
    const id = workspaceId;
    setState({ status: 'loading' });
    void load(id);
  }, [workspaceId, attempt, load]);

  const discard = useCallback(
    async (draftId: string): Promise<boolean> => {
      if (!workspaceId || isDiscarding) return false;
      setIsDiscarding(true);
      setDiscardError(null);
      try {
        const apiBase = getApiBaseUrl();
        const result = await deleteWorkspaceDraft(apiBase, workspaceId, draftId);
        if (!result.ok) {
          setDiscardError(result.message || 'Failed to discard draft.');
          return false;
        }
        setState((current) => {
          if (current.status !== 'ready') return current;
          return {
            status: 'ready',
            drafts: current.drafts.filter((d) => d.id !== draftId),
          };
        });
        return true;
      } catch {
        setDiscardError('Failed to discard draft.');
        return false;
      } finally {
        setIsDiscarding(false);
      }
    },
    [workspaceId, isDiscarding],
  );

  return { state, discard, isDiscarding, discardError, retry };
}
