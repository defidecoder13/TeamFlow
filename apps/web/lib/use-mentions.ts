/**
 * Workspace mentions list state (Audit 12).
 *
 * Mirrors `useThreads`: request key is the workspace id (switches reset
 * everything), monotonic attempt ids drop stale responses, and load-more
 * appends keyset pages without reordering.
 */

'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { getApiBaseUrl } from './config';
import { fetchWorkspaceMentions, type MentionListItem } from './workspace-mentions';

export type MentionsState =
  | { status: 'idle' }
  | { status: 'loading' }
  | {
      status: 'ready';
      mentions: MentionListItem[];
      hasMore: boolean;
      nextCursor: string | null;
    }
  | { status: 'unauthenticated' }
  | { status: 'error'; message: string };

const LOAD_FAILURE_MESSAGE = 'Could not load mentions. Check your connection and try again.';
const PAGE_LIMIT = 30;

function appendUnique(
  existing: MentionListItem[],
  incoming: MentionListItem[],
): MentionListItem[] {
  if (incoming.length === 0) return existing;
  const seen = new Set(existing.map((m) => m.id));
  const merged = [...existing];
  for (const mention of incoming) {
    if (seen.has(mention.id)) continue;
    seen.add(mention.id);
    merged.push(mention);
  }
  return merged;
}

export function useMentions(workspaceId: string | null): {
  state: MentionsState;
  isLoadingMore: boolean;
  loadMoreError: string | null;
  loadMore: () => void;
  retry: () => void;
} {
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<MentionsState>({ status: 'idle' });
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [loadMoreError, setLoadMoreError] = useState<string | null>(null);
  const isLoadingMoreRef = useRef(false);

  const requestIdRef = useRef(0);
  const activeWorkspaceRef = useRef<string | null>(workspaceId);
  activeWorkspaceRef.current = workspaceId;

  const retry = useCallback(() => {
    setAttempt((count) => count + 1);
  }, []);

  const load = useCallback(async (workspace: string, cursor?: string) => {
    const requestId = ++requestIdRef.current;
    let apiBase: string;
    try {
      apiBase = getApiBaseUrl();
    } catch {
      if (activeWorkspaceRef.current === workspace && requestId === requestIdRef.current) {
        setState({ status: 'error', message: LOAD_FAILURE_MESSAGE });
        setIsLoadingMore(false);
        isLoadingMoreRef.current = false;
      }
      return;
    }

    try {
      const result = await fetchWorkspaceMentions(apiBase, workspace, {
        limit: PAGE_LIMIT,
        cursor,
      });
      if (activeWorkspaceRef.current !== workspace || requestId !== requestIdRef.current) {
        return;
      }
      if (result.ok) {
        setState((current) => {
          if (cursor && current.status === 'ready') {
            return {
              status: 'ready',
              mentions: appendUnique(current.mentions, result.data.mentions),
              hasMore: result.data.pageInfo.hasMore,
              nextCursor: result.data.pageInfo.nextCursor,
            };
          }
          return {
            status: 'ready',
            mentions: result.data.mentions,
            hasMore: result.data.pageInfo.hasMore,
            nextCursor: result.data.pageInfo.nextCursor,
          };
        });
        setLoadMoreError(null);
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
    } finally {
      if (activeWorkspaceRef.current === workspace && requestId === requestIdRef.current) {
        setIsLoadingMore(false);
        isLoadingMoreRef.current = false;
      }
    }
  }, []);

  // Initial / retry load keyed by workspace.
  useEffect(() => {
    // Drop any in-flight load-more when the workspace changes.
    requestIdRef.current += 1;
    isLoadingMoreRef.current = false;
    setIsLoadingMore(false);
    setLoadMoreError(null);

    if (!workspaceId) {
      setState({ status: 'idle' });
      return;
    }
    const id = workspaceId;
    setState({ status: 'loading' });
    void load(id);
  }, [workspaceId, attempt, load]);

  const loadMore = useCallback(() => {
    if (!workspaceId) return;
    if (state.status !== 'ready' || !state.hasMore || !state.nextCursor) return;
    if (isLoadingMoreRef.current) return;
    isLoadingMoreRef.current = true;
    setIsLoadingMore(true);
    setLoadMoreError(null);
    void load(workspaceId, state.nextCursor);
  }, [workspaceId, state, load]);

  return { state, isLoadingMore, loadMoreError, loadMore, retry };
}
