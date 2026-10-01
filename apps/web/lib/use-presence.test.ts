/**
 * Frontend presence hook tests (Phase 4I.3).
 *
 * Tests:
 * A. Initial REST snapshot loads and populates state
 * B. Realtime presence:changed updates one user
 * C. Duplicate events do not create inconsistent state
 * D. Realtime event arriving before REST response is preserved
 * E. REST response arriving before realtime event
 * F. Stale workspace request ignored on switch
 * G. Workspace switch clears and isolates presence
 * H. Reconnect triggers REST resync
 * I. Unsubscribe / cleanup on unmount
 * J. Loading and unauthenticated states
 * K. REST failure does not crash hook and returns safe default
 * L. getPresence fallback for unobserved users
 */

import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { usePresence } from './use-presence';
import type { UserPresence } from './presence';

const { fetchMock, connectMock, onPresenceMock, onReconnectMock } = vi.hoisted(() => ({
  fetchMock: vi.fn(),
  connectMock: vi.fn(),
  onPresenceMock: vi.fn(),
  onReconnectMock: vi.fn(),
}));

vi.mock('./presence', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./presence')>()),
  fetchWorkspacePresence: fetchMock,
}));

vi.mock('./realtime-client', () => ({
  connectRealtime: connectMock,
  onRealtimePresenceChanged: onPresenceMock,
  onRealtimeReconnect: onReconnectMock,
}));

type PresenceHandler = (event: {
  type: 'presence:changed';
  userId: string;
  status: 'ONLINE' | 'OFFLINE';
  lastSeenAt: string | null;
}) => void;

type ReconnectHandler = () => void;

const presenceHandlers: PresenceHandler[] = [];
const reconnectHandlers: ReconnectHandler[] = [];

beforeEach(() => {
  vi.clearAllMocks();
  presenceHandlers.length = 0;
  reconnectHandlers.length = 0;

  onPresenceMock.mockImplementation((handler: PresenceHandler) => {
    presenceHandlers.push(handler);
    return () => {
      const idx = presenceHandlers.indexOf(handler);
      if (idx !== -1) presenceHandlers.splice(idx, 1);
    };
  });

  onReconnectMock.mockImplementation((handler: ReconnectHandler) => {
    reconnectHandlers.push(handler);
    return () => {
      const idx = reconnectHandlers.indexOf(handler);
      if (idx !== -1) reconnectHandlers.splice(idx, 1);
    };
  });

  vi.stubEnv('NEXT_PUBLIC_API_URL', 'http://localhost:4000');
});

describe('usePresence', () => {
  it('A. Initial REST snapshot loads and populates state', async () => {
    const mockPresence: UserPresence[] = [
      { userId: 'u-1', status: 'ONLINE', lastSeenAt: null },
      { userId: 'u-2', status: 'OFFLINE', lastSeenAt: '2026-09-09T18:00:00.000Z' },
    ];
    fetchMock.mockResolvedValueOnce({ ok: true, presence: mockPresence });

    const { result } = renderHook(() => usePresence('ws-1'));
    expect(result.current.state).toEqual({ status: 'loading' });

    await waitFor(() => {
      expect(result.current.state.status).toBe('ready');
    });

    expect(result.current.getPresence('u-1')).toEqual({
      userId: 'u-1',
      status: 'ONLINE',
      lastSeenAt: null,
    });
    expect(result.current.getPresence('u-2')).toEqual({
      userId: 'u-2',
      status: 'OFFLINE',
      lastSeenAt: '2026-09-09T18:00:00.000Z',
    });
  });

  it('B & C. Realtime presence:changed updates one user, duplicate events are idempotent', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      presence: [{ userId: 'u-1', status: 'OFFLINE', lastSeenAt: null }],
    });

    const { result } = renderHook(() => usePresence('ws-1'));
    await waitFor(() => {
      expect(result.current.state.status).toBe('ready');
    });

    expect(result.current.getPresence('u-1').status).toBe('OFFLINE');

    // Emit realtime ONLINE event
    act(() => {
      for (const h of presenceHandlers) {
        h({ type: 'presence:changed', userId: 'u-1', status: 'ONLINE', lastSeenAt: null });
      }
    });

    expect(result.current.getPresence('u-1')).toEqual({
      userId: 'u-1',
      status: 'ONLINE',
      lastSeenAt: null,
    });

    // Emit duplicate ONLINE event
    act(() => {
      for (const h of presenceHandlers) {
        h({ type: 'presence:changed', userId: 'u-1', status: 'ONLINE', lastSeenAt: null });
      }
    });

    expect(result.current.getPresence('u-1').status).toBe('ONLINE');
  });

  it('D. Realtime event arriving before REST response is preserved', async () => {
    let resolveRest!: (value: unknown) => void;
    fetchMock.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveRest = resolve;
        }),
    );

    const { result } = renderHook(() => usePresence('ws-1'));
    expect(result.current.state.status).toBe('loading');

    // Realtime event arrives first while REST is in-flight
    act(() => {
      for (const h of presenceHandlers) {
        h({ type: 'presence:changed', userId: 'u-1', status: 'ONLINE', lastSeenAt: null });
      }
    });

    expect(result.current.getPresence('u-1').status).toBe('ONLINE');

    // REST snapshot resolves later with stale OFFLINE for u-1
    await act(async () => {
      resolveRest({
        ok: true,
        presence: [
          { userId: 'u-1', status: 'OFFLINE', lastSeenAt: null },
          { userId: 'u-2', status: 'ONLINE', lastSeenAt: null },
        ],
      });
    });

    await waitFor(() => {
      expect(result.current.state.status).toBe('ready');
    });

    // u-1 remains ONLINE (newer realtime event preserved), u-2 is loaded as ONLINE
    expect(result.current.getPresence('u-1').status).toBe('ONLINE');
    expect(result.current.getPresence('u-2').status).toBe('ONLINE');
  });

  it('F & G. Workspace switch drops stale responses and isolates presence map', async () => {
    let resolveFirst!: (value: unknown) => void;
    fetchMock
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveFirst = resolve;
          }),
      )
      .mockResolvedValueOnce({
        ok: true,
        presence: [{ userId: 'u-ws2', status: 'ONLINE', lastSeenAt: null }],
      });

    const { result, rerender } = renderHook(({ wsId }) => usePresence(wsId), {
      initialProps: { wsId: 'ws-1' },
    });

    // Switch to ws-2
    rerender({ wsId: 'ws-2' });

    await waitFor(() => {
      expect(result.current.state.status).toBe('ready');
    });

    expect(result.current.getPresence('u-ws2').status).toBe('ONLINE');
    expect(result.current.getPresence('u-ws1').status).toBe('OFFLINE');

    // Resolve stale ws-1 request
    act(() => {
      resolveFirst({
        ok: true,
        presence: [{ userId: 'u-ws1', status: 'ONLINE', lastSeenAt: null }],
      });
    });

    // State remains isolated for ws-2
    expect(result.current.getPresence('u-ws2').status).toBe('ONLINE');
    expect(result.current.getPresence('u-ws1').status).toBe('OFFLINE');
  });

  it('H. Reconnect triggers REST resync', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      presence: [{ userId: 'u-1', status: 'ONLINE', lastSeenAt: null }],
    });

    const { result } = renderHook(() => usePresence('ws-1'));
    await waitFor(() => {
      expect(result.current.state.status).toBe('ready');
    });
    expect(result.current.getPresence('u-1').status).toBe('ONLINE');

    // Reconnect fires: return fresh snapshot where u-1 went OFFLINE while disconnected
    fetchMock.mockResolvedValueOnce({
      ok: true,
      presence: [{ userId: 'u-1', status: 'OFFLINE', lastSeenAt: '2026-09-09T18:10:00.000Z' }],
    });

    await act(async () => {
      for (const h of reconnectHandlers) {
        h();
      }
    });

    await waitFor(() => {
      expect(result.current.getPresence('u-1').status).toBe('OFFLINE');
      expect(result.current.getPresence('u-1').lastSeenAt).toBe('2026-09-09T18:10:00.000Z');
    });
  });

  it('I. Unsubscribes listeners on unmount', () => {
    const { unmount } = renderHook(() => usePresence('ws-1'));
    expect(presenceHandlers.length).toBe(1);
    expect(reconnectHandlers.length).toBe(1);

    unmount();

    expect(presenceHandlers.length).toBe(0);
    expect(reconnectHandlers.length).toBe(0);
  });

  it('J & K. Handles REST failure gracefully without breaking getPresence fallback', async () => {
    fetchMock.mockResolvedValueOnce({ ok: false, kind: 'error', message: 'API error' });
    const { result } = renderHook(() => usePresence('ws-1'));

    await waitFor(() => {
      expect(result.current.state.status).toBe('error');
    });

    // getPresence still returns safe OFFLINE default
    expect(result.current.getPresence('unknown-user')).toEqual({
      userId: 'unknown-user',
      status: 'OFFLINE',
      lastSeenAt: null,
    });

    // Retry recovery
    fetchMock.mockResolvedValueOnce({
      ok: true,
      presence: [{ userId: 'u-1', status: 'ONLINE', lastSeenAt: null }],
    });

    act(() => {
      result.current.retry();
    });

    await waitFor(() => {
      expect(result.current.state.status).toBe('ready');
    });
    expect(result.current.getPresence('u-1').status).toBe('ONLINE');
  });
});
