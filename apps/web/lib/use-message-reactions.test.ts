import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useMessageReactions, __resetStoreForTesting } from './use-message-reactions';
import type { MessageReactionSummary } from './messages';

const { fetchMessageReactionsMock, addMessageReactionMock, removeMessageReactionMock } = vi.hoisted(
  () => ({
    fetchMessageReactionsMock: vi.fn(),
    addMessageReactionMock: vi.fn(),
    removeMessageReactionMock: vi.fn(),
  }),
);

const { onRealtimeReactionAddedMock, onRealtimeReactionRemovedMock, onRealtimeReconnectMock } =
  vi.hoisted(() => ({
    onRealtimeReactionAddedMock: vi.fn(),
    onRealtimeReactionRemovedMock: vi.fn(),
    onRealtimeReconnectMock: vi.fn(),
  }));

vi.mock('./messages', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./messages')>()),
  fetchMessageReactions: fetchMessageReactionsMock,
  addMessageReaction: addMessageReactionMock,
  removeMessageReaction: removeMessageReactionMock,
}));

vi.mock('./realtime-client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./realtime-client')>()),
  onRealtimeReactionAdded: onRealtimeReactionAddedMock,
  onRealtimeReactionRemoved: onRealtimeReactionRemovedMock,
  onRealtimeReconnect: onRealtimeReconnectMock,
}));

describe('useMessageReactions', () => {
  beforeEach(() => {
    __resetStoreForTesting();
    vi.clearAllMocks();
    onRealtimeReactionAddedMock.mockReturnValue(() => {});
    onRealtimeReactionRemovedMock.mockReturnValue(() => {});
    onRealtimeReconnectMock.mockReturnValue(() => {});
  });

  it('fetches reactions on mount and sets state', async () => {
    const mockReactions: MessageReactionSummary[] = [
      { emoji: '👍', count: 2, reacted: false },
      { emoji: '❤️', count: 1, reacted: true },
    ];
    fetchMessageReactionsMock.mockResolvedValueOnce({ ok: true, data: mockReactions });

    const { result } = renderHook(() => useMessageReactions({ messageId: 'm-1' }));

    expect(result.current.loading).toBe(true);

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.reactions).toEqual(mockReactions);
    expect(result.current.error).toBeNull();
    expect(fetchMessageReactionsMock).toHaveBeenCalledWith(expect.any(String), 'm-1');
  });

  it('uses initialReactions if provided while fetching', async () => {
    const initial: MessageReactionSummary[] = [{ emoji: '🔥', count: 5, reacted: false }];
    const serverReactions: MessageReactionSummary[] = [{ emoji: '🔥', count: 6, reacted: true }];
    fetchMessageReactionsMock.mockResolvedValueOnce({ ok: true, data: serverReactions });

    const { result } = renderHook(() =>
      useMessageReactions({ messageId: 'm-1', initialReactions: initial }),
    );

    expect(result.current.reactions).toEqual(initial);

    await waitFor(() => {
      expect(result.current.reactions).toEqual(serverReactions);
    });
  });

  it('handles fetch failure gracefully', async () => {
    fetchMessageReactionsMock.mockResolvedValueOnce({
      ok: false,
      kind: 'server',
      message: 'Failed to fetch reactions',
    });

    const { result } = renderHook(() => useMessageReactions({ messageId: 'm-1' }));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.reactions).toEqual([]);
    expect(result.current.error).toBeNull();
  });

  it('adds reaction and updates state on success', async () => {
    fetchMessageReactionsMock.mockResolvedValueOnce({ ok: true, data: [] });
    const afterAdd: MessageReactionSummary[] = [{ emoji: '🎉', count: 1, reacted: true }];
    addMessageReactionMock.mockResolvedValueOnce({
      ok: true,
      data: { id: 'rxn-1', messageId: 'm-1', userId: 'u-1', emoji: '🎉' },
    });
    fetchMessageReactionsMock.mockResolvedValueOnce({ ok: true, data: afterAdd });

    const { result } = renderHook(() => useMessageReactions({ messageId: 'm-1' }));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    let success = false;
    await act(async () => {
      success = await result.current.addReaction('🎉');
    });

    expect(success).toBe(true);
    expect(result.current.reactions).toEqual(afterAdd);
    expect(result.current.error).toBeNull();
    expect(addMessageReactionMock).toHaveBeenCalledWith(expect.any(String), 'm-1', '🎉');
  });

  it('preserves existing reactions and sets error if addReaction fails', async () => {
    const existing: MessageReactionSummary[] = [{ emoji: '👍', count: 1, reacted: false }];
    fetchMessageReactionsMock.mockResolvedValueOnce({ ok: true, data: existing });
    addMessageReactionMock.mockResolvedValueOnce({
      ok: false,
      kind: 'conflict',
      message: 'Reaction already exists',
    });

    const { result } = renderHook(() => useMessageReactions({ messageId: 'm-1' }));

    await waitFor(() => {
      expect(result.current.reactions).toEqual(existing);
    });

    let success = true;
    await act(async () => {
      success = await result.current.addReaction('👍');
    });

    expect(success).toBe(false);
    // Unchanged state, no optimistic mutation
    expect(result.current.reactions).toEqual(existing);
    expect(result.current.error).toBe('Reaction already exists');
  });

  it('removes reaction and updates state on success', async () => {
    const existing: MessageReactionSummary[] = [{ emoji: '❤️', count: 1, reacted: true }];
    fetchMessageReactionsMock.mockResolvedValueOnce({ ok: true, data: existing });
    const afterRemove: MessageReactionSummary[] = [];
    removeMessageReactionMock.mockResolvedValueOnce({ ok: true, data: { success: true } });
    fetchMessageReactionsMock.mockResolvedValueOnce({ ok: true, data: afterRemove });

    const { result } = renderHook(() => useMessageReactions({ messageId: 'm-1' }));

    await waitFor(() => {
      expect(result.current.reactions).toEqual(existing);
    });

    let success = false;
    await act(async () => {
      success = await result.current.removeReaction('❤️');
    });

    expect(success).toBe(true);
    expect(result.current.reactions).toEqual(afterRemove);
    expect(result.current.error).toBeNull();
    expect(removeMessageReactionMock).toHaveBeenCalledWith(expect.any(String), 'm-1', '❤️');
  });

  it('toggleReaction removes if already reacted, adds if not reacted', async () => {
    const initial: MessageReactionSummary[] = [
      { emoji: '👍', count: 1, reacted: true },
      { emoji: '🚀', count: 2, reacted: false },
    ];
    fetchMessageReactionsMock.mockResolvedValueOnce({ ok: true, data: initial });

    const { result } = renderHook(() => useMessageReactions({ messageId: 'm-1' }));
    await waitFor(() => {
      expect(result.current.reactions).toEqual(initial);
    });

    // Toggle on '👍' -> since reacted is true, should call removeMessageReaction
    removeMessageReactionMock.mockResolvedValueOnce({
      ok: true,
      data: { success: true },
    });
    fetchMessageReactionsMock.mockResolvedValueOnce({
      ok: true,
      data: [{ emoji: '🚀', count: 2, reacted: false }],
    });

    await act(async () => {
      await result.current.toggleReaction('👍');
    });

    expect(removeMessageReactionMock).toHaveBeenCalledWith(expect.any(String), 'm-1', '👍');

    // Toggle on '🚀' -> since reacted is false, should call addMessageReaction
    addMessageReactionMock.mockResolvedValueOnce({
      ok: true,
      data: { id: 'rxn-2', messageId: 'm-1', userId: 'u-1', emoji: '🚀' },
    });
    fetchMessageReactionsMock.mockResolvedValueOnce({
      ok: true,
      data: [{ emoji: '🚀', count: 3, reacted: true }],
    });

    await act(async () => {
      await result.current.toggleReaction('🚀');
    });

    expect(addMessageReactionMock).toHaveBeenCalledWith(expect.any(String), 'm-1', '🚀');
  });

  it('clears error with clearError()', async () => {
    fetchMessageReactionsMock.mockResolvedValueOnce({ ok: true, data: [] });
    addMessageReactionMock.mockResolvedValueOnce({
      ok: false,
      kind: 'server',
      message: 'Server error',
    });

    const { result } = renderHook(() => useMessageReactions({ messageId: 'm-1' }));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    await act(async () => {
      await result.current.addReaction('🔥');
    });

    expect(result.current.error).toBe('Server error');

    act(() => {
      result.current.clearError();
    });

    expect(result.current.error).toBeNull();
  });

  it('handles realtime reaction added event', async () => {
    fetchMessageReactionsMock.mockResolvedValueOnce({ ok: true, data: [] });
    let addedHandler: (event: import('./realtime-client').RealtimeReactionAddedEvent) => void;
    onRealtimeReactionAddedMock.mockImplementation((handler) => {
      addedHandler = handler;
      return () => {};
    });

    const { result } = renderHook(() => useMessageReactions({ messageId: 'm-1' }));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(addedHandler!).toBeDefined();

    act(() => {
      addedHandler!({
        type: 'reaction:added',
        channelId: 'c-1',
        messageId: 'm-1',
        emoji: '👍',
        userId: 'user-2',
      });
    });

    expect(result.current.reactions).toEqual([
      { emoji: '👍', count: 1, reacted: false, userIds: ['user-2'] },
    ]);

    // Add another user to the same emoji
    act(() => {
      addedHandler!({
        type: 'reaction:added',
        channelId: 'c-1',
        messageId: 'm-1',
        emoji: '👍',
        userId: 'user-3',
      });
    });

    expect(result.current.reactions).toEqual([
      { emoji: '👍', count: 2, reacted: false, userIds: ['user-2', 'user-3'] },
    ]);
  });

  it('handles realtime reaction removed event', async () => {
    fetchMessageReactionsMock.mockResolvedValueOnce({
      ok: true,
      data: [{ emoji: '👍', count: 2, reacted: false, userIds: ['user-2', 'user-3'] }],
    });
    let removedHandler: (event: import('./realtime-client').RealtimeReactionRemovedEvent) => void;
    onRealtimeReactionRemovedMock.mockImplementation((handler) => {
      removedHandler = handler;
      return () => {};
    });

    const { result } = renderHook(() => useMessageReactions({ messageId: 'm-1' }));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(removedHandler!).toBeDefined();

    act(() => {
      removedHandler!({
        type: 'reaction:removed',
        channelId: 'c-1',
        messageId: 'm-1',
        emoji: '👍',
        userId: 'user-2',
      });
    });

    expect(result.current.reactions).toEqual([
      { emoji: '👍', count: 1, reacted: false, userIds: ['user-3'] },
    ]);

    // Remove the last one
    act(() => {
      removedHandler!({
        type: 'reaction:removed',
        channelId: 'c-1',
        messageId: 'm-1',
        emoji: '👍',
        userId: 'user-3',
      });
    });

    expect(result.current.reactions).toEqual([]);
  });

  describe('optimistic updates', () => {
    it('optimistically adds a reaction immediately', async () => {
      fetchMessageReactionsMock.mockResolvedValueOnce({ ok: true, data: [] });
      let resolveAdd: (val: unknown) => void;
      const addPromise = new Promise((res) => {
        resolveAdd = res;
      });
      addMessageReactionMock.mockReturnValue(addPromise);

      const { result } = renderHook(() =>
        useMessageReactions({ messageId: 'm-2', currentUserId: 'u-1' }),
      );

      await waitFor(() => expect(result.current.loading).toBe(false));

      act(() => {
        void result.current.addReaction('👍');
      });

      // Optimistic state
      expect(result.current.reactions).toEqual([
        { emoji: '👍', count: 1, reacted: true, userIds: [] },
      ]);

      fetchMessageReactionsMock.mockResolvedValueOnce({
        ok: true,
        data: [{ emoji: '👍', count: 1, reacted: true, userIds: ['u-1'] }],
      });

      await act(async () => {
        resolveAdd!({ ok: true, data: {} });
        await addPromise;
      });

      // Confirmed state
      expect(result.current.reactions).toEqual([
        { emoji: '👍', count: 1, reacted: true, userIds: ['u-1'] },
      ]);
    });

    it('optimistically removes a reaction immediately', async () => {
      fetchMessageReactionsMock.mockResolvedValueOnce({
        ok: true,
        data: [{ emoji: '👍', count: 1, reacted: true, userIds: ['u-1'] }],
      });
      let resolveRemove: (val: unknown) => void;
      const removePromise = new Promise((res) => {
        resolveRemove = res;
      });
      removeMessageReactionMock.mockReturnValue(removePromise);

      const { result } = renderHook(() =>
        useMessageReactions({ messageId: 'm-2', currentUserId: 'u-1' }),
      );

      await waitFor(() => expect(result.current.loading).toBe(false));

      act(() => {
        void result.current.removeReaction('👍');
      });

      // Optimistic state
      expect(result.current.reactions).toEqual([]);

      fetchMessageReactionsMock.mockResolvedValueOnce({ ok: true, data: [] });

      await act(async () => {
        resolveRemove!({ ok: true, data: {} });
        await removePromise;
      });

      expect(result.current.reactions).toEqual([]);
    });

    it('rolls back on add failure', async () => {
      fetchMessageReactionsMock.mockResolvedValueOnce({ ok: true, data: [] });
      let resolveAdd: (val: unknown) => void;
      const addPromise = new Promise((res) => {
        resolveAdd = res;
      });
      addMessageReactionMock.mockReturnValue(addPromise);

      const { result } = renderHook(() =>
        useMessageReactions({ messageId: 'm-2', currentUserId: 'u-1' }),
      );
      await waitFor(() => expect(result.current.loading).toBe(false));

      act(() => {
        void result.current.addReaction('👍');
      });

      expect(result.current.reactions).toEqual([
        { emoji: '👍', count: 1, reacted: true, userIds: [] },
      ]);

      await act(async () => {
        resolveAdd!({ ok: false, message: 'Server failed' });
        await addPromise;
      });

      // Rolled back state
      expect(result.current.reactions).toEqual([]);
      expect(result.current.error).toBe('Server failed');
    });
  });
});

describe('cross-view synchronization', () => {
  it('synchronizes state between multiple mounted instances of the same messageId', async () => {
    __resetStoreForTesting();
    fetchMessageReactionsMock.mockResolvedValue({ ok: true, data: [] });

    // Simulate mounting two instances (e.g. Main channel and ThreadPanel pinned root)
    const view1 = renderHook(() =>
      useMessageReactions({ messageId: 'm-cross', currentUserId: 'u-1' }),
    );
    const view2 = renderHook(() =>
      useMessageReactions({ messageId: 'm-cross', currentUserId: 'u-1' }),
    );

    await waitFor(() => {
      expect(view1.result.current.loading).toBe(false);
      expect(view2.result.current.loading).toBe(false);
    });

    // Mock API success for add
    let resolveAdd: (val: unknown) => void;
    const addPromise = new Promise((res) => {
      resolveAdd = res;
    });
    addMessageReactionMock.mockReturnValue(addPromise);

    // View 1 adds a reaction
    act(() => {
      void view1.result.current.addReaction('🔥');
    });

    // Both views should IMMEDIATELY show the optimistic state!
    expect(view1.result.current.reactions).toEqual([
      { emoji: '🔥', count: 1, reacted: true, userIds: [] },
    ]);
    expect(view2.result.current.reactions).toEqual([
      { emoji: '🔥', count: 1, reacted: true, userIds: [] },
    ]);

    // Resolve API
    fetchMessageReactionsMock.mockResolvedValue({
      ok: true,
      data: [{ emoji: '🔥', count: 1, reacted: true, userIds: ['u-1'] }],
    });
    await act(async () => {
      resolveAdd({ ok: true, data: {} });
      await addPromise;
    });

    // Both views should have confirmed state
    expect(view1.result.current.reactions).toEqual([
      { emoji: '🔥', count: 1, reacted: true, userIds: ['u-1'] },
    ]);
    expect(view2.result.current.reactions).toEqual([
      { emoji: '🔥', count: 1, reacted: true, userIds: ['u-1'] },
    ]);
  });
});

describe('race conditions & concurrency', () => {
  beforeEach(() => {
    __resetStoreForTesting();
    vi.clearAllMocks();
    onRealtimeReactionAddedMock.mockReturnValue(() => {});
    onRealtimeReactionRemovedMock.mockReturnValue(() => {});
    onRealtimeReconnectMock.mockReturnValue(() => {});
  });

  it('handles Case B: add -> socket event arrives before HTTP response', async () => {
    fetchMessageReactionsMock.mockResolvedValueOnce({ ok: true, data: [] });
    let addedHandler: (event: import('./realtime-client').RealtimeReactionAddedEvent) => void;
    onRealtimeReactionAddedMock.mockImplementation((handler) => {
      addedHandler = handler;
      return () => {};
    });

    let resolveAdd: (val: unknown) => void;
    const addPromise = new Promise((res) => {
      resolveAdd = res;
    });
    addMessageReactionMock.mockReturnValue(addPromise);

    const { result } = renderHook(() =>
      useMessageReactions({ messageId: 'm-race-b', currentUserId: 'u-1' }),
    );
    await waitFor(() => expect(result.current.loading).toBe(false));

    // 1. User clicks add
    act(() => {
      void result.current.addReaction('🚀');
    });
    expect(result.current.reactions).toEqual([
      { emoji: '🚀', count: 1, reacted: true, userIds: [] },
    ]);

    // 2. Socket event arrives before HTTP resolves
    act(() => {
      addedHandler!({
        type: 'reaction:added',
        channelId: 'c-1',
        messageId: 'm-race-b',
        emoji: '🚀',
        userId: 'u-1',
      });
    });

    // Count should still be 1 (no double counting)
    expect(result.current.reactions).toEqual([
      { emoji: '🚀', count: 1, reacted: true, userIds: ['u-1'] },
    ]);

    // 3. HTTP resolves
    fetchMessageReactionsMock.mockResolvedValueOnce({
      ok: true,
      data: [{ emoji: '🚀', count: 1, reacted: true, userIds: ['u-1'] }],
    });
    await act(async () => {
      resolveAdd!({ ok: true, data: {} });
      await addPromise;
    });

    expect(result.current.reactions).toEqual([
      { emoji: '🚀', count: 1, reacted: true, userIds: ['u-1'] },
    ]);
  });

  it('handles Case C: add -> socket event from another user, then our HTTP fails', async () => {
    fetchMessageReactionsMock.mockResolvedValueOnce({ ok: true, data: [] });
    let addedHandler: (event: import('./realtime-client').RealtimeReactionAddedEvent) => void;
    onRealtimeReactionAddedMock.mockImplementation((handler) => {
      addedHandler = handler;
      return () => {};
    });

    let resolveAdd: (val: unknown) => void;
    const addPromise = new Promise((res) => {
      resolveAdd = res;
    });
    addMessageReactionMock.mockReturnValue(addPromise);

    const { result } = renderHook(() =>
      useMessageReactions({ messageId: 'm-race-c', currentUserId: 'u-1' }),
    );
    await waitFor(() => expect(result.current.loading).toBe(false));

    // User A adds
    act(() => {
      void result.current.addReaction('👍');
    });
    expect(result.current.reactions).toEqual([
      { emoji: '👍', count: 1, reacted: true, userIds: [] },
    ]);

    // Remote user B adds before A's HTTP resolves
    act(() => {
      addedHandler!({
        type: 'reaction:added',
        channelId: 'c-1',
        messageId: 'm-race-c',
        emoji: '👍',
        userId: 'u-2',
      });
    });
    // Temporary state: user B's + user A's optimistic = 2
    expect(result.current.reactions).toEqual([
      { emoji: '👍', count: 2, reacted: true, userIds: ['u-2'] },
    ]);

    // User A's HTTP fails -> roll back user A's reaction
    await act(async () => {
      resolveAdd!({ ok: false, message: 'Server error' });
      await addPromise;
    });

    // State rolls back user A's reaction, but user B's reaction remains!
    expect(result.current.reactions).toEqual([
      { emoji: '👍', count: 1, reacted: false, userIds: ['u-2'] },
    ]);
    expect(result.current.error).toBe('Server error');
  });

  it('handles rapid add -> remove -> add sequence correctly', async () => {
    fetchMessageReactionsMock.mockResolvedValueOnce({ ok: true, data: [] });
    addMessageReactionMock.mockResolvedValue({ ok: true, data: {} });
    removeMessageReactionMock.mockResolvedValue({ ok: true, data: {} });

    const { result } = renderHook(() =>
      useMessageReactions({ messageId: 'm-rapid', currentUserId: 'u-1' }),
    );
    await waitFor(() => expect(result.current.loading).toBe(false));

    // Rapid toggle: add -> remove -> add
    act(() => {
      void result.current.addReaction('❤️');
      void result.current.removeReaction('❤️');
      void result.current.addReaction('❤️');
    });

    // Final optimistic state should be added
    expect(result.current.reactions).toEqual([
      { emoji: '❤️', count: 1, reacted: true, userIds: [] },
    ]);
  });

  it('handles multiple emojis simultaneously with isolated states', async () => {
    fetchMessageReactionsMock.mockResolvedValueOnce({
      ok: true,
      data: [{ emoji: '🔥', count: 1, reacted: true, userIds: ['u-1'] }],
    });
    addMessageReactionMock.mockResolvedValue({ ok: true, data: {} });
    removeMessageReactionMock.mockResolvedValue({ ok: true, data: {} });

    const { result } = renderHook(() =>
      useMessageReactions({ messageId: 'm-multi-emoji', currentUserId: 'u-1' }),
    );
    await waitFor(() => expect(result.current.loading).toBe(false));

    // Simultaneously add 👍, add ❤️, remove 🔥
    act(() => {
      void result.current.addReaction('👍');
      void result.current.addReaction('❤️');
      void result.current.removeReaction('🔥');
    });

    const emojis = result.current.reactions.map((r) => r.emoji);
    expect(emojis).toContain('👍');
    expect(emojis).toContain('❤️');
    expect(emojis).not.toContain('🔥');
  });

  it('re-syncs all tracked messages on socket reconnect', async () => {
    fetchMessageReactionsMock.mockResolvedValue({ ok: true, data: [] });
    let reconnectHandler: () => void;
    onRealtimeReconnectMock.mockImplementation((handler) => {
      reconnectHandler = handler;
      return () => {};
    });

    const { result } = renderHook(() =>
      useMessageReactions({ messageId: 'm-reconnect', currentUserId: 'u-1' }),
    );
    await waitFor(() => expect(result.current.loading).toBe(false));

    fetchMessageReactionsMock.mockClear();
    fetchMessageReactionsMock.mockResolvedValueOnce({
      ok: true,
      data: [
        { emoji: '👍', count: 1, reacted: false, userIds: ['u-2'] },
        { emoji: '❤️', count: 1, reacted: false, userIds: ['u-3'] },
      ],
    });

    // Fire reconnect
    await act(async () => {
      reconnectHandler!();
    });

    expect(fetchMessageReactionsMock).toHaveBeenCalledWith(expect.any(String), 'm-reconnect');
    await waitFor(() => {
      expect(result.current.reactions).toEqual([
        { emoji: '👍', count: 1, reacted: false, userIds: ['u-2'] },
        { emoji: '❤️', count: 1, reacted: false, userIds: ['u-3'] },
      ]);
    });
  });
});
