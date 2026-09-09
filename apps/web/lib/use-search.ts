/**
 * Workspace search state (Phase 4G.4).
 *
 * The URL (parsed by the page via `parseSearchParams`) is the source of truth
 * for the query and filters; this hook fetches the current result set,
 * appends cursor pages, and guards against stale responses with a request id
 * plus AbortController — a slow response for query A never overwrites query B.
 */

'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { getApiBaseUrl } from './config';
import {
  isAbortedSearch,
  searchWorkspace,
  serializeSearchParams,
  type ChannelSearchResult,
  type MessageSearchResult,
  type SearchFilters,
  type SearchResponse,
  type UserSearchResult,
} from './search';

export type SearchState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'ready'; response: SearchResponse }
  | { status: 'unauthenticated' }
  | { status: 'error'; message: string };

const LOAD_FAILURE_MESSAGE = 'Search failed. Check your connection and try again.';
const FETCH_DEBOUNCE_MS = 250;

function dedupeById<T extends { id: string }>(existing: T[], incoming: T[]): T[] {
  const seen = new Set(existing.map((item) => item.id));
  const merged = [...existing];
  for (const item of incoming) {
    if (!seen.has(item.id)) {
      seen.add(item.id);
      merged.push(item);
    }
  }
  return merged;
}

type AnySearchResult = MessageSearchResult | UserSearchResult | ChannelSearchResult;

function appendPage(previous: SearchResponse, next: SearchResponse): SearchResponse {
  if (previous.type !== next.type) {
    return previous;
  }
  // Same pool on both sides (guarded above); the cast only re-attaches the
  // discriminant that generic merging erases.
  const results = dedupeById(
    previous.results as AnySearchResult[],
    next.results as AnySearchResult[],
  );
  return { ...next, results } as SearchResponse;
}

export function useSearch(
  workspaceId: string | null,
  filters: SearchFilters,
): {
  state: SearchState;
  loadMore: () => void;
  retry: () => void;
  isLoadingMore: boolean;
  loadMoreError: string | null;
} {
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<SearchState>({ status: 'idle' });
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [loadMoreError, setLoadMoreError] = useState<string | null>(null);

  const requestIdRef = useRef(0);
  const filtersRef = useRef(filters);
  filtersRef.current = filters;
  const stateRef = useRef(state);
  stateRef.current = state;
  /**
   * Identity of the filter set that produced the current results. `loadMore`
   * only proceeds when it still matches — otherwise a cursor minted for older
   * filters could be sent with newer ones (same-tick filter change), causing
   * a spurious 400 and a misleading load-more error.
   */
  const loadedKeyRef = useRef<string | null>(null);

  const serialized = serializeSearchParams(filters);

  const retry = useCallback(() => {
    setAttempt((count) => count + 1);
  }, []);

  useEffect(() => {
    const trimmed = filtersRef.current.q.trim();
    if (!workspaceId || !trimmed) {
      requestIdRef.current += 1;
      loadedKeyRef.current = null;
      setState({ status: 'idle' });
      setIsLoadingMore(false);
      setLoadMoreError(null);
      return;
    }
    const activeFilters = { ...filtersRef.current, q: trimmed };
    const activeWorkspaceId = workspaceId;
    const myId = ++requestIdRef.current;
    loadedKeyRef.current = null;
    setState({ status: 'loading' });
    setIsLoadingMore(false);
    setLoadMoreError(null);

    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      void (async () => {
        let apiBase: string;
        try {
          apiBase = getApiBaseUrl();
        } catch {
          if (requestIdRef.current === myId) {
            setState({ status: 'error', message: LOAD_FAILURE_MESSAGE });
          }
          return;
        }
        const result = await searchWorkspace(
          apiBase,
          activeWorkspaceId,
          activeFilters.q,
          activeFilters.type,
          {
            in: activeFilters.in,
            from: activeFilters.from,
            after: activeFilters.after,
            before: activeFilters.before,
            thread: activeFilters.thread,
            limit: 20,
            signal: controller.signal,
          },
        );
        if (requestIdRef.current !== myId) {
          return;
        }
        if (result.ok) {
          loadedKeyRef.current = `${activeWorkspaceId}?${serializeSearchParams(activeFilters)}`;
          setState({ status: 'ready', response: result.data });
          return;
        }
        if (isAbortedSearch(result)) {
          return;
        }
        if ('unauthenticated' in result && result.unauthenticated) {
          setState({ status: 'unauthenticated' });
          return;
        }
        setState({ status: 'error', message: result.message ?? LOAD_FAILURE_MESSAGE });
      })();
    }, FETCH_DEBOUNCE_MS);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
    // Serialized string is the stable identity for the filter set.
  }, [workspaceId, serialized, attempt]);

  const loadMore = useCallback(() => {
    const current = stateRef.current;
    const activeFilters = filtersRef.current;
    if (!workspaceId || current.status !== 'ready' || isLoadingMore) {
      return;
    }
    // The cursor belongs to the exact filter set that produced these results;
    // never reuse it after the filters moved on (the fresh fetch owns that).
    if (loadedKeyRef.current !== `${workspaceId}?${serializeSearchParams(activeFilters)}`) {
      return;
    }
    const cursor = current.response.pageInfo.nextCursor;
    if (!current.response.pageInfo.hasMore || !cursor) {
      return;
    }
    const myId = ++requestIdRef.current;
    setIsLoadingMore(true);
    setLoadMoreError(null);
    const controller = new AbortController();
    void (async () => {
      let apiBase: string;
      try {
        apiBase = getApiBaseUrl();
      } catch {
        if (requestIdRef.current === myId) {
          setIsLoadingMore(false);
          setLoadMoreError(LOAD_FAILURE_MESSAGE);
        }
        return;
      }
      const result = await searchWorkspace(
        apiBase,
        workspaceId,
        activeFilters.q.trim(),
        current.response.type,
        {
          in: activeFilters.in,
          from: activeFilters.from,
          after: activeFilters.after,
          before: activeFilters.before,
          thread: activeFilters.thread,
          limit: 20,
          cursor,
          signal: controller.signal,
        },
      );
      if (requestIdRef.current !== myId) {
        return;
      }
      setIsLoadingMore(false);
      if (result.ok) {
        setState((previous) =>
          previous.status === 'ready'
            ? { status: 'ready', response: appendPage(previous.response, result.data) }
            : previous,
        );
        return;
      }
      if (isAbortedSearch(result)) {
        return;
      }
      if ('unauthenticated' in result && result.unauthenticated) {
        setState({ status: 'unauthenticated' });
        return;
      }
      setLoadMoreError(result.message ?? LOAD_FAILURE_MESSAGE);
    })();
  }, [workspaceId, isLoadingMore]);

  return { state, loadMore, retry, isLoadingMore, loadMoreError };
}
