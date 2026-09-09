/**
 * Frontend typing state hook tests (Phase 4I.5).
 *
 * Tests:
 * - typing:started adds user to container
 * - typing:stopped removes user from container
 * - duplicate typing:started is idempotent
 * - own user ID is ignored defensively
 * - channel container isolation (events for channel A do not affect channel B)
 * - DM container isolation (events for DM A do not affect DM B)
 * - container switching resets typing state
 * - meaningful input emits typing:start
 * - whitespace-only input does not emit typing:start
 * - continued typing refreshes before 3000ms TTL
 * - stopTyping / clear input emits typing:stop
 * - unmount cleans up subscriptions and emits typing:stop
 */

import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useTyping } from './use-typing';

const { emitStartMock, emitStopMock, onStartedMock, onStoppedMock } = vi.hoisted(() => ({
  emitStartMock: vi.fn(),
  emitStopMock: vi.fn(),
  onStartedMock: vi.fn(),
  onStoppedMock: vi.fn(),
}));

vi.mock('./realtime-client', () => ({
  emitTypingStart: emitStartMock,
  emitTypingStop: emitStopMock,
  onRealtimeTypingStarted: onStartedMock,
  onRealtimeTypingStopped: onStoppedMock,
}));

type StartedHandler = (event: {
  type: 'typing:started';
  userId: string;
  channelId?: string | null;
  conversationId?: string | null;
}) => void;

type StoppedHandler = (event: {
  type: 'typing:stopped';
  userId: string;
  channelId?: string | null;
  conversationId?: string | null;
}) => void;

const startedHandlers: StartedHandler[] = [];
const stoppedHandlers: StoppedHandler[] = [];

describe('useTyping Hook (Phase 4I.5)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    startedHandlers.length = 0;
    stoppedHandlers.length = 0;

    emitStartMock.mockResolvedValue({ ok: true });
    emitStopMock.mockResolvedValue({ ok: true });

    onStartedMock.mockImplementation((handler: StartedHandler) => {
      startedHandlers.push(handler);
      return () => {
        const idx = startedHandlers.indexOf(handler);
        if (idx !== -1) startedHandlers.splice(idx, 1);
      };
    });

    onStoppedMock.mockImplementation((handler: StoppedHandler) => {
      stoppedHandlers.push(handler);
      return () => {
        const idx = stoppedHandlers.indexOf(handler);
        if (idx !== -1) stoppedHandlers.splice(idx, 1);
      };
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('subscribes to realtime typing events and tracks typing users', () => {
    const { result } = renderHook(() =>
      useTyping({ channelId: 'ch-1' }, { currentUserId: 'user-self' }),
    );

    expect(result.current.typingUserIds).toEqual([]);
    expect(result.current.isUserTyping('user-1')).toBe(false);

    // Event for ch-1 arrives
    act(() => {
      startedHandlers.forEach((h) =>
        h({ type: 'typing:started', userId: 'user-1', channelId: 'ch-1' }),
      );
    });

    expect(result.current.typingUserIds).toEqual(['user-1']);
    expect(result.current.isUserTyping('user-1')).toBe(true);

    // Another user starts
    act(() => {
      startedHandlers.forEach((h) =>
        h({ type: 'typing:started', userId: 'user-2', channelId: 'ch-1' }),
      );
    });

    expect(result.current.typingUserIds).toEqual(['user-1', 'user-2']);

    // user-1 stops
    act(() => {
      stoppedHandlers.forEach((h) =>
        h({ type: 'typing:stopped', userId: 'user-1', channelId: 'ch-1' }),
      );
    });

    expect(result.current.typingUserIds).toEqual(['user-2']);
    expect(result.current.isUserTyping('user-1')).toBe(false);
    expect(result.current.isUserTyping('user-2')).toBe(true);
  });

  it('deduplicates duplicate started events idempotently', () => {
    const { result } = renderHook(() =>
      useTyping({ channelId: 'ch-1' }, { currentUserId: 'user-self' }),
    );

    act(() => {
      startedHandlers.forEach((h) =>
        h({ type: 'typing:started', userId: 'user-1', channelId: 'ch-1' }),
      );
      startedHandlers.forEach((h) =>
        h({ type: 'typing:started', userId: 'user-1', channelId: 'ch-1' }),
      );
    });

    expect(result.current.typingUserIds).toEqual(['user-1']);
  });

  it('defensively ignores typing events from the current user', () => {
    const { result } = renderHook(() =>
      useTyping({ channelId: 'ch-1' }, { currentUserId: 'user-self' }),
    );

    act(() => {
      startedHandlers.forEach((h) =>
        h({ type: 'typing:started', userId: 'user-self', channelId: 'ch-1' }),
      );
    });

    expect(result.current.typingUserIds).toEqual([]);
  });

  it('enforces channel and DM container isolation', () => {
    const { result } = renderHook(() =>
      useTyping({ channelId: 'ch-1' }, { currentUserId: 'user-self' }),
    );

    // Event for different channel
    act(() => {
      startedHandlers.forEach((h) =>
        h({ type: 'typing:started', userId: 'user-diff-channel', channelId: 'ch-2' }),
      );
    });

    // Event for DM conversation
    act(() => {
      startedHandlers.forEach((h) =>
        h({ type: 'typing:started', userId: 'user-dm', conversationId: 'conv-1' }),
      );
    });

    expect(result.current.typingUserIds).toEqual([]);

    // Event for matching channel
    act(() => {
      startedHandlers.forEach((h) =>
        h({ type: 'typing:started', userId: 'user-target', channelId: 'ch-1' }),
      );
    });

    expect(result.current.typingUserIds).toEqual(['user-target']);
  });

  it('resets typing state and unsubscribes on container switch', () => {
    let container = { channelId: 'ch-1' };
    const { result, rerender } = renderHook(
      (props) => useTyping(props.container, { currentUserId: 'user-self' }),
      { initialProps: { container } },
    );

    act(() => {
      startedHandlers.forEach((h) =>
        h({ type: 'typing:started', userId: 'user-1', channelId: 'ch-1' }),
      );
    });
    expect(result.current.typingUserIds).toEqual(['user-1']);

    // Switch to channel 2
    container = { channelId: 'ch-2' };
    rerender({ container });

    expect(result.current.typingUserIds).toEqual([]);

    // Old channel event does not affect new container
    act(() => {
      startedHandlers.forEach((h) =>
        h({ type: 'typing:started', userId: 'user-1', channelId: 'ch-1' }),
      );
    });
    expect(result.current.typingUserIds).toEqual([]);

    // New channel event affects new container
    act(() => {
      startedHandlers.forEach((h) =>
        h({ type: 'typing:started', userId: 'user-2', channelId: 'ch-2' }),
      );
    });
    expect(result.current.typingUserIds).toEqual(['user-2']);
  });

  it('emits typing:start on meaningful content and refreshes periodically', () => {
    const { result } = renderHook(() =>
      useTyping({ channelId: 'ch-1' }, { currentUserId: 'user-self', refreshIntervalMs: 1500 }),
    );

    // Whitespace only -> no emit
    act(() => {
      result.current.handleInputChange('   ');
    });
    expect(emitStartMock).not.toHaveBeenCalled();

    // Meaningful text -> emit typing:start
    act(() => {
      result.current.handleInputChange('Hello');
    });
    expect(emitStartMock).toHaveBeenCalledTimes(1);
    expect(emitStartMock).toHaveBeenCalledWith({ channelId: 'ch-1' });

    // Rapid keystroke -> no immediate second emit (refresh timer will handle it)
    act(() => {
      result.current.handleInputChange('Hello world');
    });
    expect(emitStartMock).toHaveBeenCalledTimes(1);

    // Advance 1500ms -> refresh fires
    act(() => {
      vi.advanceTimersByTime(1500);
    });
    expect(emitStartMock).toHaveBeenCalledTimes(2);

    // Clear input -> emit typing:stop and cancel refresh timer
    act(() => {
      result.current.handleInputChange('');
    });
    expect(emitStopMock).toHaveBeenCalledWith({ channelId: 'ch-1' });

    // Advance more time -> no further refreshes
    act(() => {
      vi.advanceTimersByTime(3000);
    });
    expect(emitStartMock).toHaveBeenCalledTimes(2);
  });

  it('emits typing:stop when handleStopTyping is invoked', () => {
    const { result } = renderHook(() =>
      useTyping({ conversationId: 'conv-1' }, { currentUserId: 'user-self' }),
    );

    act(() => {
      result.current.handleInputChange('Typing a DM...');
    });
    expect(emitStartMock).toHaveBeenCalledWith({ conversationId: 'conv-1' });

    act(() => {
      result.current.handleStopTyping();
    });
    expect(emitStopMock).toHaveBeenCalledWith({ conversationId: 'conv-1' });
  });

  it('cleans up and emits typing:stop on unmount', () => {
    const { result, unmount } = renderHook(() =>
      useTyping({ channelId: 'ch-1' }, { currentUserId: 'user-self' }),
    );

    act(() => {
      result.current.handleInputChange('Drafting...');
    });
    expect(emitStartMock).toHaveBeenCalledWith({ channelId: 'ch-1' });

    unmount();

    expect(emitStopMock).toHaveBeenCalledWith({ channelId: 'ch-1' });
    expect(startedHandlers).toHaveLength(0);
    expect(stoppedHandlers).toHaveLength(0);
  });
});
