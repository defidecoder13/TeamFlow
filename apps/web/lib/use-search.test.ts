/**
 * Search hook tests (Phase 4G.4): fetching, stale-request protection,
 * pagination/dedup, errors, and retry. The network layer is mocked; fake
 * timers control the hook's debounce deterministically (no `waitFor`, which
 * deadlocks under fake timers — assertions follow explicit timer advances).
 */
import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useSearch } from './use-search';
import type { MessageSearchResult, SearchResponse } from './search';

const { searchMock } = vi.hoisted(() => ({ searchMock: vi.fn() }));

vi.mock('./search', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./search')>()),
  searchWorkspace: searchMock,
}));

function messageResult(id: string, body = 'hello'): MessageSearchResult {
  return {
    id,
    container: {
      kind: 'channel',
      channelId: 'ch-1',
      channelSlug: 'general',
      channelName: 'General',
    },
    author: { id: 'u-1', name: 'Ada Lovelace', image: null },
    snippet: body,
    matchOffsets: [],
    parentMessageId: null,
    replyCount: 0,
    createdAt: new Date('2026-09-06T12:00:00.000Z'),
    updatedAt: new Date('2026-09-06T12:00:00.000Z'),
    score: 0.9,
  };
}

function messageResponse(
  ids: string[],
  hasMore: boolean,
  nextCursor: string | null = null,
): SearchResponse {
  return {
    type: 'messages',
    results: ids.map((id) => messageResult(id)),
    pageInfo: { hasMore, nextCursor },
  };
}

const FILTERS = { q: 'hello', type: 'messages' as const, thread: 'include' as const };

function readyIds(result: ReturnType<typeof useSearch>['state']): string[] {
  if (result.status !== 'ready' || result.response.type !== 'messages') {
    throw new Error(`expected ready messages, got ${result.status}`);
  }
  return result.response.results.map((r) => r.id);
}

describe('useSearch', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    searchMock.mockReset();
    vi.stubEnv('NEXT_PUBLIC_API_URL', 'http://localhost:4000');
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('stays idle without a query or workspace', () => {
    const { result, rerender } = renderHook(
      ({ workspaceId, q }) => useSearch(workspaceId, { ...FILTERS, q }),
      { initialProps: { workspaceId: 'ws-1' as string | null, q: '' } },
    );
    expect(result.current.state).toEqual({ status: 'idle' });
    expect(searchMock).not.toHaveBeenCalled();

    rerender({ workspaceId: null, q: 'hello' });
    expect(result.current.state).toEqual({ status: 'idle' });
    expect(searchMock).not.toHaveBeenCalled();
  });

  it('fetches results and exposes them as ready', async () => {
    searchMock.mockResolvedValue({ ok: true, data: messageResponse(['m-1'], false) });
    const { result } = renderHook(() => useSearch('ws-1', FILTERS));
    expect(result.current.state.status).toBe('loading');

    await act(async () => {
      await vi.advanceTimersByTimeAsync(500);
    });
    expect(readyIds(result.current.state)).toEqual(['m-1']);
    expect(searchMock).toHaveBeenCalledTimes(1);
    expect(searchMock.mock.calls[0][1]).toBe('ws-1');
    expect(searchMock.mock.calls[0][2]).toBe('hello');
  });

  it('ignores stale responses when the query changes quickly', async () => {
    let resolveA!: (value: unknown) => void;
    searchMock.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveA = resolve;
        }),
    );
    searchMock.mockImplementationOnce(async () => ({
      ok: true,
      data: messageResponse(['m-b'], false),
    }));

    const { result, rerender } = renderHook(({ q }) => useSearch('ws-1', { ...FILTERS, q }), {
      initialProps: { q: 'aaa' },
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(500);
    });
    expect(searchMock).toHaveBeenCalledTimes(1);

    rerender({ q: 'bbb' });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(500);
    });
    expect(readyIds(result.current.state)).toEqual(['m-b']);

    // The stale A response arrives late and must not overwrite B.
    await act(async () => {
      resolveA({ ok: true, data: messageResponse(['m-a'], false) });
    });
    expect(readyIds(result.current.state)).toEqual(['m-b']);
  });

  it('surfaces errors and retries the same query', async () => {
    searchMock.mockResolvedValueOnce({
      ok: false,
      kind: 'error',
      message: 'Search failed. Try again.',
    });
    const { result } = renderHook(() => useSearch('ws-1', FILTERS));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(500);
    });
    expect(result.current.state).toEqual({
      status: 'error',
      message: 'Search failed. Try again.',
    });

    searchMock.mockResolvedValueOnce({ ok: true, data: messageResponse(['m-1'], false) });
    act(() => {
      result.current.retry();
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(500);
    });
    expect(readyIds(result.current.state)).toEqual(['m-1']);
    expect(searchMock).toHaveBeenCalledTimes(2);
  });

  it('maps unauthenticated responses', async () => {
    searchMock.mockResolvedValue({ ok: false, unauthenticated: true });
    const { result } = renderHook(() => useSearch('ws-1', FILTERS));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(500);
    });
    expect(result.current.state).toEqual({ status: 'unauthenticated' });
  });

  it('appends cursor pages without duplicates and stops at the end', async () => {
    searchMock.mockResolvedValueOnce({
      ok: true,
      data: messageResponse(['m-1', 'm-2'], true, 'cursor-1'),
    });
    const { result } = renderHook(() => useSearch('ws-1', FILTERS));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(500);
    });
    expect(readyIds(result.current.state)).toEqual(['m-1', 'm-2']);

    searchMock.mockResolvedValueOnce({
      ok: true,
      data: messageResponse(['m-2', 'm-3'], false, null),
    });
    await act(async () => {
      result.current.loadMore();
    });
    expect(readyIds(result.current.state)).toEqual(['m-1', 'm-2', 'm-3']);
    const lastCall = searchMock.mock.calls[searchMock.mock.calls.length - 1];
    expect((lastCall[4] as { cursor?: string }).cursor).toBe('cursor-1');

    // hasMore=false: further loadMore calls are no-ops.
    const calls = searchMock.mock.calls.length;
    act(() => {
      result.current.loadMore();
    });
    expect(searchMock.mock.calls.length).toBe(calls);
  });

  it('keeps results visible when loading more fails, with retry', async () => {
    searchMock.mockResolvedValueOnce({
      ok: true,
      data: messageResponse(['m-1'], true, 'cursor-1'),
    });
    const { result } = renderHook(() => useSearch('ws-1', FILTERS));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(500);
    });
    expect(readyIds(result.current.state)).toEqual(['m-1']);

    searchMock.mockResolvedValueOnce({ ok: false, kind: 'error', message: 'Oops' });
    await act(async () => {
      result.current.loadMore();
    });
    expect(result.current.loadMoreError).toBe('Oops');
    expect(readyIds(result.current.state)).toEqual(['m-1']);
  });

  it('never lets an in-flight loadMore overwrite a newer search', async () => {
    searchMock.mockResolvedValueOnce({
      ok: true,
      data: messageResponse(['m-a1'], true, 'cursor-a'),
    });
    const { result, rerender } = renderHook(({ q }) => useSearch('ws-1', { ...FILTERS, q }), {
      initialProps: { q: 'aaa' },
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(500);
    });
    expect(readyIds(result.current.state)).toEqual(['m-a1']);

    // Start loading more for A but keep it pending.
    let resolveMore!: (value: unknown) => void;
    searchMock.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveMore = resolve;
        }),
    );
    await act(async () => {
      result.current.loadMore();
    });

    // Search B to completion while A's page is still in flight.
    searchMock.mockImplementationOnce(async () => ({
      ok: true,
      data: messageResponse(['m-b1'], false),
    }));
    rerender({ q: 'bbb' });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(500);
    });
    expect(readyIds(result.current.state)).toEqual(['m-b1']);

    // A's late page must not overwrite B.
    await act(async () => {
      resolveMore({ ok: true, data: messageResponse(['m-a2'], false, null) });
    });
    expect(readyIds(result.current.state)).toEqual(['m-b1']);
  });

  it('never reuses a previous query cursor after the filters change', async () => {
    searchMock.mockResolvedValueOnce({
      ok: true,
      data: messageResponse(['m-a1'], true, 'cursor-a'),
    });
    const { result, rerender } = renderHook(({ q }) => useSearch('ws-1', { ...FILTERS, q }), {
      initialProps: { q: 'aaa' },
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(500);
    });

    searchMock.mockResolvedValueOnce({
      ok: true,
      data: messageResponse(['m-b1'], true, 'cursor-b'),
    });
    rerender({ q: 'bbb' });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(500);
    });
    expect(readyIds(result.current.state)).toEqual(['m-b1']);

    searchMock.mockResolvedValueOnce({ ok: true, data: messageResponse(['m-b2'], false, null) });
    await act(async () => {
      result.current.loadMore();
    });
    expect(readyIds(result.current.state)).toEqual(['m-b1', 'm-b2']);
    const lastCall = searchMock.mock.calls[searchMock.mock.calls.length - 1];
    expect((lastCall[4] as { cursor?: string }).cursor).toBe('cursor-b');
  });
});
