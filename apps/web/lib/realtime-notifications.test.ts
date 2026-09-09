/**
 * Notification realtime subscriber tests (Phase 4H.6, mocked transport).
 *
 * Verifies the singleton client wires notification event subscriptions and
 * cleanup without rendering anything. Resync itself travels through the
 * existing notification REST API on `onRealtimeReconnect` (covered by hook
 * tests elsewhere); these events only ever merge by notification id.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  onRealtimeNotificationNew,
  onRealtimeNotificationRead,
  onRealtimeNotificationReadAll,
  type RealtimeNotificationNewEvent,
  type RealtimeNotificationReadAllEvent,
  type RealtimeNotificationReadEvent,
} from './realtime-client';

const { fakeSocket, ioMock } = vi.hoisted(() => {
  const handlers = new Map<string, Set<(event: unknown) => void>>();
  const fakeSocket = {
    on: vi.fn((event: string, handler: (event: unknown) => void) => {
      if (!handlers.has(event)) {
        handlers.set(event, new Set());
      }
      handlers.get(event)!.add(handler);
    }),
    off: vi.fn((event: string, handler: (event: unknown) => void) => {
      handlers.get(event)?.delete(handler);
    }),
    emit: vi.fn(),
    handlers,
  };
  return { fakeSocket, ioMock: vi.fn(() => fakeSocket) };
});

vi.mock('socket.io-client', () => ({
  io: ioMock,
}));

function fire(event: string, payload: unknown): void {
  for (const handler of fakeSocket.handlers.get(event) ?? []) {
    handler(payload);
  }
}

describe('notification realtime subscribers', () => {
  beforeEach(() => {
    fakeSocket.handlers.clear();
    fakeSocket.on.mockClear();
    fakeSocket.off.mockClear();
    vi.stubEnv('NEXT_PUBLIC_API_URL', 'http://localhost:4000');
  });

  it('routes notification:new payloads to subscribers and cleans up', () => {
    const seen: RealtimeNotificationNewEvent[] = [];
    const unsubscribe = onRealtimeNotificationNew((event) => seen.push(event));
    expect(fakeSocket.on).toHaveBeenCalledWith('notification:new', expect.any(Function));

    fire('notification:new', { type: 'notification:new', notification: { id: 'n-1' } });
    expect(seen).toHaveLength(1);
    expect(seen[0].notification.id).toBe('n-1');

    unsubscribe();
    expect(fakeSocket.off).toHaveBeenCalledWith('notification:new', expect.any(Function));
    fire('notification:new', { type: 'notification:new', notification: { id: 'n-2' } });
    expect(seen).toHaveLength(1);
  });

  it('routes read and read-all events to their own subscribers', () => {
    const reads: RealtimeNotificationReadEvent[] = [];
    const readAlls: RealtimeNotificationReadAllEvent[] = [];
    const unsubRead = onRealtimeNotificationRead((event) => reads.push(event));
    const unsubReadAll = onRealtimeNotificationReadAll((event) => readAlls.push(event));

    fire('notification:read', {
      type: 'notification:read',
      id: 'n-1',
      workspaceId: 'ws-1',
      readAt: 'x',
    });
    fire('notification:read-all', {
      type: 'notification:read-all',
      workspaceId: 'ws-1',
      readAt: 'x',
      updatedCount: 3,
    });

    expect(reads).toHaveLength(1);
    expect(reads[0].id).toBe('n-1');
    expect(readAlls).toHaveLength(1);
    expect(readAlls[0].updatedCount).toBe(3);

    unsubRead();
    unsubReadAll();
    fire('notification:read', {
      type: 'notification:read',
      id: 'n-2',
      workspaceId: 'ws-1',
      readAt: 'x',
    });
    expect(reads).toHaveLength(1);
  });
});
