/**
 * Notification hook tests (Phase 4H.7): initial fetch, pagination, realtime
 * merge/dedupe, read behaviors with rollback, workspace isolation, race
 * protection, and reconnect resync. Network and sockets are mocked.
 */
import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useNotifications, type NotificationsState } from './use-notifications';
import type { NotificationFilter, NotificationItem, NotificationPage } from './notifications';

const {
  fetchMock,
  markOneMock,
  markAllMock,
  connectMock,
  onNewMock,
  onReadMock,
  onReadAllMock,
  onReconnectMock,
} = vi.hoisted(() => ({
  fetchMock: vi.fn(),
  markOneMock: vi.fn(),
  markAllMock: vi.fn(),
  connectMock: vi.fn(),
  onNewMock: vi.fn(),
  onReadMock: vi.fn(),
  onReadAllMock: vi.fn(),
  onReconnectMock: vi.fn(),
}));

vi.mock('./notifications', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./notifications')>()),
  fetchNotifications: fetchMock,
  markNotificationRead: markOneMock,
  markAllNotificationsRead: markAllMock,
}));

vi.mock('./realtime-client', () => ({
  connectRealtime: connectMock,
  onRealtimeNotificationNew: onNewMock,
  onRealtimeNotificationRead: onReadMock,
  onRealtimeNotificationReadAll: onReadAllMock,
  onRealtimeReconnect: onReconnectMock,
}));

type Handler = (event: never) => void;
const handlers: Record<string, Handler[]> = { new: [], read: [], readAll: [], reconnect: [] };

function item(id: string, overrides: Partial<NotificationItem> = {}): NotificationItem {
  return {
    id,
    type: 'MENTION',
    workspaceId: 'ws-1',
    recipientUserId: 'u-1',
    actorUserId: 'u-2',
    actorName: 'Grace Hopper',
    actorImage: null,
    messageId: `m-${id}`,
    conversationId: null,
    channelId: 'ch-1',
    threadRootMessageId: null,
    channelName: 'general',
    conversationName: null,
    createdAt: new Date('2026-09-06T12:00:00.000Z'),
    readAt: null,
    ...overrides,
  };
}

function page(
  ids: string[],
  hasMore: boolean,
  nextCursor: string | null = null,
): { ok: true; data: NotificationPage } {
  return {
    ok: true,
    data: { notifications: ids.map((id) => item(id)), pageInfo: { hasMore, nextCursor } },
  };
}

function ok<T>(data: T): { ok: true; data: T } {
  return { ok: true, data };
}

beforeEach(() => {
  vi.clearAllMocks();
  handlers.new = [];
  handlers.read = [];
  handlers.readAll = [];
  handlers.reconnect = [];
  onNewMock.mockImplementation((handler: Handler) => {
    handlers.new.push(handler);
    return () => {};
  });
  onReadMock.mockImplementation((handler: Handler) => {
    handlers.read.push(handler);
    return () => {};
  });
  onReadAllMock.mockImplementation((handler: Handler) => {
    handlers.readAll.push(handler);
    return () => {};
  });
  onReconnectMock.mockImplementation((handler: Handler) => {
    handlers.reconnect.push(handler);
    return () => {};
  });
  vi.stubEnv('NEXT_PUBLIC_API_URL', 'http://localhost:4000');
});

function readyIds(state: NotificationsState): string[] {
  if (state.status !== 'ready') {
    throw new Error(`expected ready, got ${state.status}`);
  }
  return state.items.map((item) => item.id);
}

describe('useNotifications', () => {
  it('stays idle without a workspace and loads on mount', async () => {
    const { result, rerender } = renderHook(({ ws }) => useNotifications(ws), {
      initialProps: { ws: null as string | null },
    });
    expect(result.current.state).toEqual({ status: 'idle' });
    expect(fetchMock).not.toHaveBeenCalled();

    fetchMock.mockResolvedValueOnce(page(['n-1'], false));
    rerender({ ws: 'ws-1' });
    await waitFor(() => {
      expect(result.current.state.status).toBe('ready');
    });
    expect(readyIds(result.current.state)).toEqual(['n-1']);
    expect(connectMock).toHaveBeenCalled();
  });

  it('shows loading, error with retry, and unauthenticated states', async () => {
    fetchMock.mockResolvedValueOnce({ ok: false, kind: 'error', message: 'Down.' });
    const { result } = renderHook(() => useNotifications('ws-1'));
    await waitFor(() => {
      expect(result.current.state.status).toBe('error');
    });

    fetchMock.mockResolvedValueOnce(page(['n-1'], false));
    act(() => {
      result.current.retry();
    });
    await waitFor(() => {
      expect(result.current.state.status).toBe('ready');
    });
  });

  it('appends cursor pages without duplicates', async () => {
    fetchMock.mockResolvedValueOnce(page(['n-1', 'n-2'], true, 'cursor-1'));
    const { result } = renderHook(() => useNotifications('ws-1'));
    await waitFor(() => {
      expect(result.current.state.status).toBe('ready');
    });

    fetchMock.mockResolvedValueOnce(page(['n-2', 'n-3'], false, null));
    act(() => {
      result.current.loadMore();
    });
    await waitFor(() => {
      expect(readyIds(result.current.state)).toEqual(['n-1', 'n-2', 'n-3']);
    });
    expect(fetchMock).toHaveBeenLastCalledWith(
      expect.anything(),
      expect.anything(),
      expect.objectContaining({ cursor: 'cursor-1' }),
    );
  });

  it('merges notification:new by id and ignores other workspaces', async () => {
    fetchMock.mockResolvedValueOnce(page(['n-1'], false));
    const { result } = renderHook(() => useNotifications('ws-1'));
    await waitFor(() => {
      expect(result.current.state.status).toBe('ready');
    });

    const fresh = item('n-2');
    act(() => {
      for (const handler of handlers.new) {
        handler({
          type: 'notification:new',
          notification: {
            ...fresh,
            createdAt: fresh.createdAt.toISOString(),
            readAt: null,
          },
        } as never);
      }
    });
    expect(readyIds(result.current.state)).toEqual(['n-2', 'n-1']);
    expect(result.current.hasUnread).toBe(true);

    // Re-delivery of a known id reconciles instead of duplicating.
    act(() => {
      for (const handler of handlers.new) {
        handler({
          type: 'notification:new',
          notification: {
            ...fresh,
            createdAt: fresh.createdAt.toISOString(),
            readAt: new Date('2026-09-06T13:00:00.000Z').toISOString(),
          },
        } as never);
      }
    });
    expect(readyIds(result.current.state)).toEqual(['n-2', 'n-1']);

    // Foreign workspace events never enter this list.
    act(() => {
      for (const handler of handlers.new) {
        handler({
          type: 'notification:new',
          notification: {
            ...fresh,
            id: 'n-x',
            workspaceId: 'ws-other',
            createdAt: fresh.createdAt.toISOString(),
            readAt: null,
          },
        } as never);
      }
    });
    expect(readyIds(result.current.state)).toEqual(['n-2', 'n-1']);
  });

  it('applies read and read-all events by id', async () => {
    fetchMock.mockResolvedValueOnce(page(['n-1', 'n-2'], false));
    const { result } = renderHook(() => useNotifications('ws-1'));
    await waitFor(() => {
      expect(result.current.state.status).toBe('ready');
    });

    act(() => {
      for (const handler of handlers.read) {
        handler({
          type: 'notification:read',
          id: 'n-1',
          workspaceId: 'ws-1',
          readAt: '2026-09-06T13:00:00.000Z',
        } as never);
      }
    });
    let state = result.current.state;
    if (state.status !== 'ready') {
      throw new Error('expected ready');
    }
    expect(state.items.find((n) => n.id === 'n-1')?.readAt).toEqual(
      new Date('2026-09-06T13:00:00.000Z'),
    );
    expect(state.items.find((n) => n.id === 'n-2')?.readAt).toBeNull();

    act(() => {
      for (const handler of handlers.readAll) {
        handler({
          type: 'notification:read-all',
          workspaceId: 'ws-1',
          readAt: '2026-09-06T14:00:00.000Z',
          updatedCount: 5,
        } as never);
      }
    });
    state = result.current.state;
    if (state.status !== 'ready') {
      throw new Error('expected ready');
    }
    expect(state.items.every((n) => n.readAt !== null)).toBe(true);

    // Foreign workspace read-all affects nothing here.
    act(() => {
      for (const handler of handlers.readAll) {
        handler({
          type: 'notification:read-all',
          workspaceId: 'ws-other',
          readAt: '2026-09-06T15:00:00.000Z',
          updatedCount: 5,
        } as never);
      }
    });
  });

  it('drops stale responses on workspace switch', async () => {
    let resolveFirst!: (value: unknown) => void;
    fetchMock
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveFirst = resolve;
          }),
      )
      .mockResolvedValueOnce(page(['n-9'], false));
    const { result, rerender } = renderHook(({ ws }) => useNotifications(ws), {
      initialProps: { ws: 'ws-1' },
    });
    rerender({ ws: 'ws-2' });

    await waitFor(() => {
      expect(result.current.state.status).toBe('ready');
    });
    act(() => {
      resolveFirst({ ok: true, data: page(['n-stale'], false).data });
    });
    expect(readyIds(result.current.state)).toEqual(['n-9']);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('resyncs through REST on reconnect without duplicates', async () => {
    fetchMock.mockResolvedValueOnce(page(['n-1'], false));
    const { result } = renderHook(() => useNotifications('ws-1'));
    await waitFor(() => {
      expect(result.current.state.status).toBe('ready');
    });

    fetchMock.mockResolvedValueOnce(page(['n-1', 'n-2'], false));
    await act(async () => {
      for (const handler of handlers.reconnect) {
        await handler(undefined as never);
      }
    });
    expect(readyIds(result.current.state)).toEqual(['n-1', 'n-2']);
  });

  it('marks one read and rolls back failures', async () => {
    fetchMock.mockResolvedValue(page(['n-1'], false));
    const { result } = renderHook(() => useNotifications('ws-1'));
    await waitFor(() => {
      expect(result.current.state.status).toBe('ready');
    });

    markOneMock.mockResolvedValueOnce(ok(item('n-1', { readAt: new Date() })));
    act(() => {
      result.current.markRead('n-1');
    });
    const state = result.current.state;
    if (state.status !== 'ready') {
      throw new Error('expected ready');
    }
    expect(state.items[0].readAt).not.toBeNull();
    expect(markOneMock).toHaveBeenCalledWith(expect.anything(), 'ws-1', 'n-1');
    expect(result.current.actionError).toBeNull();
  });

  it('rolls back optimistic reads when the request fails', async () => {
    fetchMock.mockResolvedValue(page(['n-1'], false));
    const { result } = renderHook(() => useNotifications('ws-1'));
    await waitFor(() => {
      expect(result.current.state.status).toBe('ready');
    });

    markOneMock.mockResolvedValueOnce({ ok: false, kind: 'error', message: 'Down.' });
    await act(async () => {
      result.current.markRead('n-1');
    });
    expect(result.current.actionError).toBe('Down.');
    const state = result.current.state;
    if (state.status !== 'ready') {
      throw new Error('expected ready');
    }
    expect(state.items[0].readAt).toBeNull();
  });

  it('marks all read optimistically and rolls back failures', async () => {
    fetchMock.mockResolvedValueOnce(page(['n-1', 'n-2'], false));
    const { result } = renderHook(() => useNotifications('ws-1'));
    await waitFor(() => {
      expect(result.current.state.status).toBe('ready');
    });

    markAllMock.mockResolvedValueOnce(ok({ updatedCount: 2 }));
    act(() => {
      result.current.markAllRead();
    });
    let state = result.current.state;
    if (state.status !== 'ready') {
      throw new Error('expected ready');
    }
    expect(state.items.every((n) => n.readAt !== null)).toBe(true);

    markAllMock.mockResolvedValueOnce({ ok: false, kind: 'error', message: 'Down.' });
    // New unread arrival, then a failing mark-all restores exactly it.
    act(() => {
      for (const handler of handlers.new) {
        handler({
          type: 'notification:new',
          notification: {
            ...item('n-3'),
            createdAt: item('n-3').createdAt.toISOString(),
            readAt: null,
          },
        } as never);
      }
    });
    await act(async () => {
      result.current.markAllRead();
    });
    expect(result.current.actionError).toBe('Down.');
    state = result.current.state;
    if (state.status !== 'ready') {
      throw new Error('expected ready');
    }
    expect(state.items.find((n) => n.id === 'n-3')?.readAt).toBeNull();
    expect(state.items.find((n) => n.id === 'n-1')?.readAt).not.toBeNull();
  });

  describe('filters', () => {
    function realtimeNew(id: string, overrides: Partial<NotificationItem> = {}) {
      const fresh = item(id, overrides);
      return {
        type: 'notification:new',
        notification: {
          ...fresh,
          createdAt: fresh.createdAt.toISOString(),
          readAt: fresh.readAt ? fresh.readAt.toISOString() : null,
        },
      } as never;
    }

    it('sends unreadOnly and type to the backend, including combined', async () => {
      fetchMock.mockResolvedValueOnce(page(['n-1'], false));
      const { result, rerender } = renderHook(
        ({ filter }: { filter: NotificationFilter }) => useNotifications('ws-1', filter),
        { initialProps: { filter: { unreadOnly: false } as NotificationFilter } },
      );
      await waitFor(() => {
        expect(result.current.state.status).toBe('ready');
      });
      expect(fetchMock).toHaveBeenLastCalledWith(
        expect.anything(),
        'ws-1',
        expect.not.objectContaining({ unreadOnly: true, type: expect.anything() }),
      );

      fetchMock.mockResolvedValueOnce(page([], false));
      rerender({ filter: { unreadOnly: true, type: 'MENTION' } });
      await waitFor(() => {
        expect(fetchMock).toHaveBeenLastCalledWith(
          expect.anything(),
          'ws-1',
          expect.objectContaining({ unreadOnly: true, type: 'MENTION' }),
        );
      });
    });

    it('reloads the list when the filter changes', async () => {
      fetchMock.mockResolvedValueOnce(page(['n-1', 'n-2'], false));
      const { result, rerender } = renderHook(
        ({ filter }: { filter: NotificationFilter }) => useNotifications('ws-1', filter),
        { initialProps: { filter: { unreadOnly: false } as NotificationFilter } },
      );
      await waitFor(() => {
        expect(readyIds(result.current.state)).toEqual(['n-1', 'n-2']);
      });

      fetchMock.mockResolvedValueOnce(page(['n-1'], false));
      rerender({ filter: { unreadOnly: true } });
      await waitFor(() => {
        expect(readyIds(result.current.state)).toEqual(['n-1']);
      });
    });

    it('inserts only matching realtime arrivals under a filter', async () => {
      fetchMock.mockResolvedValueOnce(page([], false));
      const { result } = renderHook(() =>
        useNotifications('ws-1', { unreadOnly: false, type: 'MENTION' }),
      );
      await waitFor(() => {
        expect(result.current.state.status).toBe('ready');
      });

      act(() => {
        for (const handler of handlers.new) {
          handler(realtimeNew('n-1', { type: 'MENTION' }));
          handler(realtimeNew('n-2', { type: 'DM_MESSAGE' }));
        }
      });
      expect(readyIds(result.current.state)).toEqual(['n-1']);
    });

    it('inserts unread arrivals under the Unread filter', async () => {
      fetchMock.mockResolvedValueOnce(page([], false));
      const { result } = renderHook(() => useNotifications('ws-1', { unreadOnly: true }));
      await waitFor(() => {
        expect(result.current.state.status).toBe('ready');
      });

      act(() => {
        for (const handler of handlers.new) {
          handler(realtimeNew('n-1'));
        }
      });
      expect(readyIds(result.current.state)).toEqual(['n-1']);
    });

    it('removes rows on read events under the Unread filter', async () => {
      fetchMock.mockResolvedValueOnce(page(['n-1', 'n-2'], false));
      const { result } = renderHook(() => useNotifications('ws-1', { unreadOnly: true }));
      await waitFor(() => {
        expect(readyIds(result.current.state)).toEqual(['n-1', 'n-2']);
      });

      act(() => {
        for (const handler of handlers.read) {
          handler({
            type: 'notification:read',
            id: 'n-1',
            workspaceId: 'ws-1',
            readAt: '2026-09-06T13:00:00.000Z',
          } as never);
        }
      });
      expect(readyIds(result.current.state)).toEqual(['n-2']);

      act(() => {
        for (const handler of handlers.readAll) {
          handler({
            type: 'notification:read-all',
            workspaceId: 'ws-1',
            readAt: '2026-09-06T14:00:00.000Z',
            updatedCount: 1,
          } as never);
        }
      });
      expect(readyIds(result.current.state)).toEqual([]);
    });

    it('removes optimistically on mark-read under Unread and restores on failure', async () => {
      fetchMock.mockResolvedValueOnce(page(['n-1', 'n-2'], false));
      const { result } = renderHook(() => useNotifications('ws-1', { unreadOnly: true }));
      await waitFor(() => {
        expect(readyIds(result.current.state)).toEqual(['n-1', 'n-2']);
      });

      markOneMock.mockResolvedValueOnce({ ok: false, kind: 'error', message: 'Down.' });
      await act(async () => {
        await result.current.markRead('n-1');
      });
      expect(readyIds(result.current.state)).toEqual(['n-1', 'n-2']);
      expect(result.current.actionError).toBe('Down.');
    });

    it('removes optimistically on mark-all-read under Unread and restores on failure', async () => {
      fetchMock.mockResolvedValueOnce(page(['n-1', 'n-2'], false));
      const { result } = renderHook(() => useNotifications('ws-1', { unreadOnly: true }));
      await waitFor(() => {
        expect(readyIds(result.current.state)).toEqual(['n-1', 'n-2']);
      });

      markAllMock.mockResolvedValueOnce({ ok: false, kind: 'error', message: 'Down.' });
      await act(async () => {
        result.current.markAllRead();
      });
      expect(readyIds(result.current.state)).toEqual(['n-1', 'n-2']);
    });
  });
});
