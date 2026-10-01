import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useThreads } from './use-threads';
import type { ThreadListItem, ThreadPage } from './threads';

const { fetchThreadsMock } = vi.hoisted(() => ({ fetchThreadsMock: vi.fn() }));

vi.mock('./threads', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./threads')>()),
  fetchWorkspaceThreads: fetchThreadsMock,
}));

const THREAD: ThreadListItem = {
  id: 'root-1',
  body: 'Root body',
  replyCount: 2,
  createdAt: new Date('2026-09-20T10:00:00.000Z'),
  latestReplyAt: new Date('2026-09-21T12:00:00.000Z'),
  author: { id: 'u-1', name: 'Ada', email: 'ada@example.com', image: null },
  container: { type: 'channel', id: 'ch-1', name: 'general', slug: 'general' },
  latestReply: null,
};

function page(
  threads: ThreadListItem[],
  pageInfo = { hasMore: false, nextCursor: null as string | null },
): { ok: true; data: ThreadPage } {
  return { ok: true, data: { threads, pageInfo } };
}

beforeEach(() => {
  fetchThreadsMock.mockReset();
  vi.stubEnv('NEXT_PUBLIC_API_URL', 'http://localhost:4000');
});

describe('useThreads', () => {
  it('stays idle without a workspace', () => {
    const { result } = renderHook(() => useThreads(null));
    expect(result.current.state).toEqual({ status: 'idle' });
    expect(fetchThreadsMock).not.toHaveBeenCalled();
  });

  it('loads threads for a workspace', async () => {
    fetchThreadsMock.mockResolvedValue(page([THREAD]));
    const { result } = renderHook(() => useThreads('ws-1'));

    await waitFor(() => {
      expect(result.current.state).toEqual({
        status: 'ready',
        threads: [THREAD],
        hasMore: false,
        nextCursor: null,
      });
    });
    expect(fetchThreadsMock).toHaveBeenCalledWith(
      'http://localhost:4000',
      'ws-1',
      expect.objectContaining({ limit: 30 }),
    );
  });

  it('maps unauthenticated responses', async () => {
    fetchThreadsMock.mockResolvedValue({ ok: false, unauthenticated: true });
    const { result } = renderHook(() => useThreads('ws-1'));

    await waitFor(() => {
      expect(result.current.state).toEqual({ status: 'unauthenticated' });
    });
  });

  it('maps failures to an error with retry', async () => {
    fetchThreadsMock.mockResolvedValue({ ok: false, kind: 'error', message: 'boom' });
    const { result } = renderHook(() => useThreads('ws-1'));
    await waitFor(() => {
      expect(result.current.state.status).toBe('error');
    });

    fetchThreadsMock.mockResolvedValue(page([THREAD]));
    act(() => {
      result.current.retry();
    });
    await waitFor(() => {
      expect(result.current.state.status).toBe('ready');
    });
  });

  it('appends the next page without duplicating rows', async () => {
    const second: ThreadListItem = { ...THREAD, id: 'root-2' };
    fetchThreadsMock.mockResolvedValueOnce(
      page([THREAD], { hasMore: true, nextCursor: 'c1' }),
    );
    const { result } = renderHook(() => useThreads('ws-1'));
    await waitFor(() => {
      expect(result.current.state.status).toBe('ready');
    });

    fetchThreadsMock.mockResolvedValueOnce(
      page([THREAD, second], { hasMore: false, nextCursor: null }),
    );
    act(() => {
      result.current.loadMore();
    });

    await waitFor(() => {
      if (result.current.state.status !== 'ready') return;
      expect(result.current.state.threads.map((t) => t.id)).toEqual(['root-1', 'root-2']);
      expect(result.current.state.hasMore).toBe(false);
    });
    expect(fetchThreadsMock).toHaveBeenLastCalledWith(
      'http://localhost:4000',
      'ws-1',
      expect.objectContaining({ cursor: 'c1' }),
    );
  });

  it('ignores loadMore when there is no cursor', async () => {
    fetchThreadsMock.mockResolvedValue(page([THREAD]));
    const { result } = renderHook(() => useThreads('ws-1'));
    await waitFor(() => {
      expect(result.current.state.status).toBe('ready');
    });

    fetchThreadsMock.mockClear();
    act(() => {
      result.current.loadMore();
    });
    expect(fetchThreadsMock).not.toHaveBeenCalled();
  });

  it('resets when the workspace changes', async () => {
    fetchThreadsMock.mockResolvedValue(page([THREAD]));
    const { result, rerender } = renderHook(({ id }) => useThreads(id), {
      initialProps: { id: 'ws-1' as string | null },
    });
    await waitFor(() => {
      expect(result.current.state.status).toBe('ready');
    });

    fetchThreadsMock.mockResolvedValue(page([]));
    rerender({ id: 'ws-2' });
    await waitFor(() => {
      expect(result.current.state).toEqual({
        status: 'ready',
        threads: [],
        hasMore: false,
        nextCursor: null,
      });
    });
    expect(fetchThreadsMock).toHaveBeenLastCalledWith(
      'http://localhost:4000',
      'ws-2',
      expect.anything(),
    );
  });
});
