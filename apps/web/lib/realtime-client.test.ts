import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { ioMock, socketMock } = vi.hoisted(() => {
  const socket = {
    connected: true,
    active: true,
    connect: vi.fn(),
    disconnect: vi.fn(),
    emit: vi.fn(),
    on: vi.fn(),
    off: vi.fn(),
    io: { on: vi.fn(), off: vi.fn() },
  };
  return { ioMock: vi.fn(() => socket), socketMock: socket };
});

vi.mock('socket.io-client', () => ({ io: ioMock }));

import {
  REALTIME_ACK_TIMEOUT_MS,
  emitTypingStart,
  joinRealtimeChannel,
  joinRealtimeDirectConversation,
} from './realtime-client';

beforeEach(() => {
  vi.useRealTimers();
  socketMock.connected = true;
  socketMock.connect.mockReset();
  socketMock.emit.mockReset();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('realtime ack timeouts', () => {
  it('resolves channel joins with the server acknowledgement', async () => {
    socketMock.emit.mockImplementation(
      (_event: string, _payload: unknown, ack: (res: { ok: boolean }) => void) => {
        ack({ ok: true });
      },
    );

    await expect(joinRealtimeChannel('ch-1')).resolves.toEqual({ ok: true });
    expect(socketMock.emit).toHaveBeenCalledWith(
      'channel:join',
      { channelId: 'ch-1' },
      expect.any(Function),
    );
  });

  it('passes server rejections through without timing out', async () => {
    socketMock.emit.mockImplementation(
      (_event: string, _payload: unknown, ack: (res: { ok: boolean; error?: string }) => void) => {
        ack({ ok: false, error: 'FORBIDDEN' });
      },
    );

    await expect(joinRealtimeChannel('ch-9')).resolves.toEqual({
      ok: false,
      error: 'FORBIDDEN',
    });
  });

  it('connects first when the socket is down, then joins', async () => {
    socketMock.connected = false;
    socketMock.emit.mockImplementation(
      (_event: string, _payload: unknown, ack: (res: { ok: boolean }) => void) => {
        ack({ ok: true });
      },
    );

    await expect(joinRealtimeChannel('ch-1')).resolves.toEqual({ ok: true });
    expect(socketMock.connect).toHaveBeenCalled();
  });

  it('resolves TIMEOUT instead of hanging when the ack never arrives', async () => {
    vi.useFakeTimers();
    socketMock.emit.mockImplementation(() => {});

    const pending = joinRealtimeChannel('ch-hung');
    const assertion = expect(pending).resolves.toEqual({ ok: false, error: 'TIMEOUT' });
    await vi.advanceTimersByTimeAsync(REALTIME_ACK_TIMEOUT_MS);
    await assertion;
  });

  it('ignores a late ack after the timeout settled', async () => {
    vi.useFakeTimers();
    let ack: ((res?: { ok: boolean }) => void) | undefined;
    socketMock.emit.mockImplementation(
      (_event: string, _payload: unknown, cb: (res?: { ok: boolean }) => void) => {
        ack = cb;
      },
    );

    const pending = joinRealtimeChannel('ch-late');
    await vi.advanceTimersByTimeAsync(REALTIME_ACK_TIMEOUT_MS);
    await expect(pending).resolves.toEqual({ ok: false, error: 'TIMEOUT' });

    ack?.({ ok: true });
    await expect(pending).resolves.toEqual({ ok: false, error: 'TIMEOUT' });
  });

  it('times out direct-conversation joins the same way', async () => {
    vi.useFakeTimers();
    socketMock.emit.mockImplementation(() => {});

    const pending = joinRealtimeDirectConversation('dm-hung');
    const assertion = expect(pending).resolves.toEqual({ ok: false, error: 'TIMEOUT' });
    await vi.advanceTimersByTimeAsync(REALTIME_ACK_TIMEOUT_MS);
    await assertion;
  });

  it('resolves typing starts with the ack, defaulting to ok', async () => {
    socketMock.emit.mockImplementation(
      (_event: string, _payload: unknown, ack: (res?: { ok: boolean }) => void) => {
        ack(undefined);
      },
    );

    await expect(emitTypingStart({ channelId: 'ch-1' })).resolves.toEqual({ ok: true });
  });

  it('times out typing starts instead of hanging the composer', async () => {
    vi.useFakeTimers();
    socketMock.emit.mockImplementation(() => {});

    const pending = emitTypingStart({ channelId: 'ch-hung' });
    const assertion = expect(pending).resolves.toEqual({ ok: false, error: 'TIMEOUT' });
    await vi.advanceTimersByTimeAsync(REALTIME_ACK_TIMEOUT_MS);
    await assertion;
  });
});
