import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useMessages } from './use-messages';
import type { Message } from './messages';

const {
  fetchMessagesMock,
  sendMessageMock,
  editMessageMock,
  deleteMessageMock,
  connectRealtimeMock,
  joinRealtimeChannelMock,
  leaveRealtimeChannelMock,
  onRealtimeMessageNewMock,
  onRealtimeMessageUpdatedMock,
  onRealtimeMessageDeletedMock,
  onRealtimeReconnectMock,
} = vi.hoisted(() => ({
  fetchMessagesMock: vi.fn(),
  sendMessageMock: vi.fn(),
  editMessageMock: vi.fn(),
  deleteMessageMock: vi.fn(),
  connectRealtimeMock: vi.fn(),
  joinRealtimeChannelMock: vi.fn(),
  leaveRealtimeChannelMock: vi.fn(),
  onRealtimeMessageNewMock: vi.fn(),
  onRealtimeMessageUpdatedMock: vi.fn(),
  onRealtimeMessageDeletedMock: vi.fn(),
  onRealtimeReconnectMock: vi.fn(),
}));

vi.mock('./messages', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./messages')>()),
  fetchMessages: fetchMessagesMock,
  sendMessage: sendMessageMock,
  editMessage: editMessageMock,
  deleteMessage: deleteMessageMock,
}));

vi.mock('./realtime-client', () => ({
  connectRealtime: connectRealtimeMock,
  joinRealtimeChannel: joinRealtimeChannelMock,
  leaveRealtimeChannel: leaveRealtimeChannelMock,
  onRealtimeMessageNew: onRealtimeMessageNewMock,
  onRealtimeMessageUpdated: onRealtimeMessageUpdatedMock,
  onRealtimeMessageDeleted: onRealtimeMessageDeletedMock,
  onRealtimeReconnect: onRealtimeReconnectMock,
}));

import type {
  RealtimeMessageNewEvent,
  RealtimeMessageUpdatedEvent,
  RealtimeMessageDeletedEvent,
} from './realtime-client';

function makeMessage(overrides: Partial<Message> = {}): Message {
  return {
    id: 'm-1',
    channelId: 'ch-1',
    authorId: 'u-1',
    body: 'Hello team',
    createdAt: new Date('2026-09-06T12:00:00.000Z'),
    updatedAt: new Date('2026-09-06T12:00:00.000Z'),
    editedAt: null,
    deletedAt: null,
    author: { id: 'u-1', name: 'Ada Lovelace', image: null },
    ...overrides,
  };
}

let messageNewHandler: ((event: RealtimeMessageNewEvent) => void) | null = null;
let messageUpdatedHandler: ((event: RealtimeMessageUpdatedEvent) => void) | null = null;
let messageDeletedHandler: ((event: RealtimeMessageDeletedEvent) => void) | null = null;
let reconnectHandler: (() => void) | null = null;

beforeEach(() => {
  fetchMessagesMock.mockReset();
  sendMessageMock.mockReset();
  editMessageMock.mockReset();
  deleteMessageMock.mockReset();
  connectRealtimeMock.mockReset();
  joinRealtimeChannelMock.mockReset();
  leaveRealtimeChannelMock.mockReset();
  onRealtimeMessageNewMock.mockReset();
  onRealtimeMessageUpdatedMock.mockReset();
  onRealtimeMessageDeletedMock.mockReset();
  onRealtimeReconnectMock.mockReset();

  messageNewHandler = null;
  messageUpdatedHandler = null;
  messageDeletedHandler = null;
  reconnectHandler = null;

  onRealtimeMessageNewMock.mockImplementation(
    (handler: (event: RealtimeMessageNewEvent) => void) => {
      messageNewHandler = handler;
      return vi.fn();
    },
  );
  onRealtimeMessageUpdatedMock.mockImplementation(
    (handler: (event: RealtimeMessageUpdatedEvent) => void) => {
      messageUpdatedHandler = handler;
      return vi.fn();
    },
  );
  onRealtimeMessageDeletedMock.mockImplementation(
    (handler: (event: RealtimeMessageDeletedEvent) => void) => {
      messageDeletedHandler = handler;
      return vi.fn();
    },
  );
  onRealtimeReconnectMock.mockImplementation((handler: () => void) => {
    reconnectHandler = handler;
    return vi.fn();
  });

  vi.stubEnv('NEXT_PUBLIC_API_URL', 'http://localhost:4000');
});

describe('useMessages', () => {
  it('stays idle without a channel', () => {
    const { result } = renderHook(() => useMessages(null));

    expect(result.current.state).toEqual({ status: 'idle' });
    expect(fetchMessagesMock).not.toHaveBeenCalled();
  });

  it('loads the initial page', async () => {
    const message = makeMessage();
    fetchMessagesMock.mockResolvedValue({
      ok: true,
      data: { messages: [message], pageInfo: { hasMore: false, nextCursor: null } },
    });
    const { result } = renderHook(() => useMessages('ch-1'));

    await waitFor(() => {
      expect(result.current.state).toEqual({
        status: 'ready',
        messages: [message],
        hasMore: false,
        nextCursor: null,
      });
    });
  });

  it('appends older pages via cursor without duplicates', async () => {
    const newer = makeMessage({ id: 'm-2', body: 'newer' });
    const older = makeMessage({
      id: 'm-0',
      body: 'older',
      createdAt: new Date('2026-09-06T11:00:00.000Z'),
      updatedAt: new Date('2026-09-06T11:00:00.000Z'),
    });
    fetchMessagesMock.mockResolvedValue({
      ok: true,
      data: { messages: [newer], pageInfo: { hasMore: true, nextCursor: 'cursor-1' } },
    });
    const { result } = renderHook(() => useMessages('ch-1'));

    await waitFor(() => {
      expect(result.current.state.status).toBe('ready');
    });

    fetchMessagesMock.mockResolvedValue({
      ok: true,
      data: { messages: [older], pageInfo: { hasMore: false, nextCursor: null } },
    });
    act(() => {
      result.current.loadOlder();
    });
    await waitFor(() => {
      const state = result.current.state;
      expect(state.status).toBe('ready');
      if (state.status === 'ready') {
        expect(state.messages.map((m) => m.id)).toEqual(['m-0', 'm-2']);
        expect(state.hasMore).toBe(false);
      }
    });
    expect(fetchMessagesMock).toHaveBeenLastCalledWith(
      'http://localhost:4000',
      'ch-1',
      expect.objectContaining({ cursor: 'cursor-1' }),
    );
  });

  it('appends sent messages to the chronological end', async () => {
    const existing = makeMessage();
    const created = makeMessage({ id: 'm-9', body: 'Fresh' });
    fetchMessagesMock.mockResolvedValue({
      ok: true,
      data: { messages: [existing], pageInfo: { hasMore: false, nextCursor: null } },
    });
    sendMessageMock.mockResolvedValue({ ok: true, data: created });
    const { result } = renderHook(() => useMessages('ch-1'));

    await waitFor(() => {
      expect(result.current.state.status).toBe('ready');
    });

    let sendResult: { ok: boolean; error?: string } = { ok: false };
    await act(async () => {
      sendResult = await result.current.send('Fresh');
    });
    expect(sendResult).toEqual({ ok: true });
    expect(result.current.state).toEqual({
      status: 'ready',
      messages: [existing, created],
      hasMore: false,
      nextCursor: null,
    });
  });

  it('maintains strict chronological order across initial load, loading older, and sending', async () => {
    // API returns newest first: [C, B, A]
    const msgA = makeMessage({
      id: 'msg-A',
      body: 'A',
      createdAt: new Date('2026-09-06T10:00:00.000Z'),
    });
    const msgB = makeMessage({
      id: 'msg-B',
      body: 'B',
      createdAt: new Date('2026-09-06T11:00:00.000Z'),
    });
    const msgC = makeMessage({
      id: 'msg-C',
      body: 'C',
      createdAt: new Date('2026-09-06T12:00:00.000Z'),
    });

    // Older page from API (newest first): [Y, X]
    const msgX = makeMessage({
      id: 'msg-X',
      body: 'X',
      createdAt: new Date('2026-09-06T08:00:00.000Z'),
    });
    const msgY = makeMessage({
      id: 'msg-Y',
      body: 'Y',
      createdAt: new Date('2026-09-06T09:00:00.000Z'),
    });

    // Sent message: D
    const msgD = makeMessage({
      id: 'msg-D',
      body: 'D',
      createdAt: new Date('2026-09-06T13:00:00.000Z'),
    });

    fetchMessagesMock.mockResolvedValue({
      ok: true,
      data: { messages: [msgC, msgB, msgA], pageInfo: { hasMore: true, nextCursor: 'cursor-A' } },
    });

    const { result } = renderHook(() => useMessages('ch-1'));
    await waitFor(() => {
      expect(result.current.state.status).toBe('ready');
    });

    // Initial chronological order: A, B, C
    if (result.current.state.status === 'ready') {
      expect(result.current.state.messages.map((m) => m.id)).toEqual(['msg-A', 'msg-B', 'msg-C']);
    }

    // Load older: API returns [Y, X]
    fetchMessagesMock.mockResolvedValue({
      ok: true,
      data: { messages: [msgY, msgX], pageInfo: { hasMore: false, nextCursor: null } },
    });

    await act(async () => {
      await result.current.loadOlder();
    });

    // Result must be: X, Y, A, B, C
    if (result.current.state.status === 'ready') {
      expect(result.current.state.messages.map((m) => m.id)).toEqual([
        'msg-X',
        'msg-Y',
        'msg-A',
        'msg-B',
        'msg-C',
      ]);
    }

    // Send: D
    sendMessageMock.mockResolvedValue({ ok: true, data: msgD });
    await act(async () => {
      await result.current.send('D');
    });

    // Result must be: X, Y, A, B, C, D
    if (result.current.state.status === 'ready') {
      expect(result.current.state.messages.map((m) => m.id)).toEqual([
        'msg-X',
        'msg-Y',
        'msg-A',
        'msg-B',
        'msg-C',
        'msg-D',
      ]);
    }
  });

  it('prevents duplicate messages when loading older or sending duplicate IDs', async () => {
    const msgA = makeMessage({ id: 'msg-A', body: 'A' });
    fetchMessagesMock.mockResolvedValue({
      ok: true,
      data: { messages: [msgA, msgA], pageInfo: { hasMore: true, nextCursor: 'cursor-1' } },
    });

    const { result } = renderHook(() => useMessages('ch-1'));
    await waitFor(() => {
      expect(result.current.state.status).toBe('ready');
    });
    if (result.current.state.status === 'ready') {
      expect(result.current.state.messages).toHaveLength(1);
    }

    // Load older containing already existing msgA
    fetchMessagesMock.mockResolvedValue({
      ok: true,
      data: { messages: [msgA], pageInfo: { hasMore: false, nextCursor: null } },
    });
    await act(async () => {
      await result.current.loadOlder();
    });
    if (result.current.state.status === 'ready') {
      expect(result.current.state.messages.map((m) => m.id)).toEqual(['msg-A']);
    }
  });

  it('replaces edited messages in place', async () => {
    const original = makeMessage();
    fetchMessagesMock.mockResolvedValue({
      ok: true,
      data: { messages: [original], pageInfo: { hasMore: false, nextCursor: null } },
    });
    const edited = { ...original, body: 'Edited', editedAt: new Date('2026-09-06T13:00:00.000Z') };
    editMessageMock.mockResolvedValue({ ok: true, data: edited });
    const { result } = renderHook(() => useMessages('ch-1'));

    await waitFor(() => {
      expect(result.current.state.status).toBe('ready');
    });

    let editResult: { ok: boolean; error?: string } = { ok: false };
    await act(async () => {
      editResult = await result.current.edit('m-1', 'Edited');
    });
    expect(editResult).toEqual({ ok: true });
    expect(result.current.state).toEqual({
      status: 'ready',
      messages: [edited],
      hasMore: false,
      nextCursor: null,
    });
  });

  it('tombstones deleted messages in place', async () => {
    const original = makeMessage();
    fetchMessagesMock.mockResolvedValue({
      ok: true,
      data: { messages: [original], pageInfo: { hasMore: false, nextCursor: null } },
    });
    const tombstone = { ...original, body: null, deletedAt: new Date('2026-09-06T14:00:00.000Z') };
    deleteMessageMock.mockResolvedValue({ ok: true, data: tombstone });
    const { result } = renderHook(() => useMessages('ch-1'));

    await waitFor(() => {
      expect(result.current.state.status).toBe('ready');
    });

    let deleteResult: { ok: boolean; error?: string } = { ok: false };
    await act(async () => {
      deleteResult = await result.current.remove('m-1');
    });
    expect(deleteResult).toEqual({ ok: true });
    const state = result.current.state;
    expect(state.status).toBe('ready');
    if (state.status === 'ready') {
      expect(state.messages).toHaveLength(1);
      expect(state.messages[0]?.body).toBeNull();
    }
  });

  it('surfaces errors with retry', async () => {
    fetchMessagesMock.mockResolvedValue({ ok: false, unauthenticated: false });
    const { result } = renderHook(() => useMessages('ch-1'));

    await waitFor(() => {
      expect(result.current.state.status).toBe('error');
    });

    fetchMessagesMock.mockResolvedValue({
      ok: true,
      data: { messages: [], pageInfo: { hasMore: false, nextCursor: null } },
    });
    act(() => {
      result.current.retry();
    });
    await waitFor(() => {
      expect(result.current.state).toEqual({
        status: 'ready',
        messages: [],
        hasMore: false,
        nextCursor: null,
      });
    });
  });

  it('marks unauthenticated sessions', async () => {
    fetchMessagesMock.mockResolvedValue({ ok: false, unauthenticated: true });
    const { result } = renderHook(() => useMessages('ch-1'));

    await waitFor(() => {
      expect(result.current.state).toEqual({ status: 'unauthenticated' });
    });
  });

  it('rejects empty and whitespace-only messages on send and edit', async () => {
    const { result } = renderHook(() => useMessages('ch-1'));

    const sendResEmpty = await result.current.send('');
    expect(sendResEmpty).toEqual({ ok: false, error: 'Message cannot be empty.' });

    const sendResWhitespace = await result.current.send('   \n  ');
    expect(sendResWhitespace).toEqual({ ok: false, error: 'Message cannot be empty.' });
    expect(sendMessageMock).not.toHaveBeenCalled();

    const editResEmpty = await result.current.edit('m-1', '   ');
    expect(editResEmpty).toEqual({ ok: false, error: 'Message cannot be empty.' });
    expect(editMessageMock).not.toHaveBeenCalled();
  });

  it('prevents concurrent duplicate sends', async () => {
    const existing = makeMessage();
    fetchMessagesMock.mockResolvedValue({
      ok: true,
      data: { messages: [existing], pageInfo: { hasMore: false, nextCursor: null } },
    });

    let resolveSend!: (value: { ok: boolean; data: Message }) => void;
    const sendPromise = new Promise<{ ok: boolean; data: Message }>((resolve) => {
      resolveSend = resolve;
    });
    sendMessageMock.mockReturnValue(sendPromise);

    const { result } = renderHook(() => useMessages('ch-1'));
    await waitFor(() => {
      expect(result.current.state.status).toBe('ready');
    });

    let firstSendRes!: Promise<{ ok: boolean; error?: string }>;
    let secondSendRes!: { ok: boolean; error?: string };

    await act(async () => {
      firstSendRes = result.current.send('Message 1');
      secondSendRes = await result.current.send('Message 2');
    });

    // The second send must be blocked while the first is in flight
    expect(secondSendRes).toEqual({ ok: false, error: 'A message is currently sending.' });
    expect(sendMessageMock).toHaveBeenCalledTimes(1);

    // Complete the first send
    const msg1 = makeMessage({ id: 'm-new-1', body: 'Message 1' });
    await act(async () => {
      resolveSend({ ok: true, data: msg1 });
      await firstSendRes;
    });

    if (result.current.state.status === 'ready') {
      expect(result.current.state.messages.map((m) => m.id)).toEqual(['m-1', 'm-new-1']);
    }
  });

  it('ignores stale responses when channel changes during in-flight load or send', async () => {
    let resolveCh1Load!: (value: {
      ok: boolean;
      data: { messages: Message[]; pageInfo: { hasMore: boolean; nextCursor: null } };
    }) => void;
    const ch1LoadPromise = new Promise<{
      ok: boolean;
      data: { messages: Message[]; pageInfo: { hasMore: boolean; nextCursor: null } };
    }>((resolve) => {
      resolveCh1Load = resolve;
    });
    fetchMessagesMock.mockReturnValue(ch1LoadPromise);

    const { result, rerender } = renderHook(({ channelId }) => useMessages(channelId), {
      initialProps: { channelId: 'ch-1' },
    });

    expect(result.current.state.status).toBe('loading');

    // User switches to ch-2 before ch-1 finishes
    const ch2Message = makeMessage({ id: 'm-ch2', channelId: 'ch-2', body: 'Channel 2 msg' });
    fetchMessagesMock.mockResolvedValueOnce({
      ok: true,
      data: { messages: [ch2Message], pageInfo: { hasMore: false, nextCursor: null } },
    });

    rerender({ channelId: 'ch-2' });

    await waitFor(() => {
      expect(result.current.state.status).toBe('ready');
    });

    // Now ch-1's fetch finally resolves
    const ch1Message = makeMessage({ id: 'm-ch1', channelId: 'ch-1', body: 'Channel 1 msg' });
    await act(async () => {
      resolveCh1Load({
        ok: true,
        data: { messages: [ch1Message], pageInfo: { hasMore: false, nextCursor: null } },
      });
    });

    // State must remain channel 2 messages, not channel 1
    if (result.current.state.status === 'ready') {
      expect(result.current.state.messages.map((m) => m.id)).toEqual(['m-ch2']);
    }
  });

  it('preserves message state and returns error when send, edit, or delete fails', async () => {
    const existing = makeMessage({ id: 'm-1', body: 'Existing' });
    fetchMessagesMock.mockResolvedValue({
      ok: true,
      data: { messages: [existing], pageInfo: { hasMore: false, nextCursor: null } },
    });

    const { result } = renderHook(() => useMessages('ch-1'));
    await waitFor(() => {
      expect(result.current.state.status).toBe('ready');
    });

    // 1. Send failure
    sendMessageMock.mockResolvedValue({ ok: false, kind: 'error', message: 'Network offline' });
    let sendResult: { ok: boolean; error?: string } = { ok: false };
    await act(async () => {
      sendResult = await result.current.send('Will fail');
    });
    expect(sendResult.ok).toBe(false);
    if (result.current.state.status === 'ready') {
      expect(result.current.state.messages.map((m) => m.id)).toEqual(['m-1']);
    }

    // 2. Edit failure preserves original content
    editMessageMock.mockResolvedValue({ ok: false, kind: 'error', message: 'Failed to edit' });
    let editResult: { ok: boolean; error?: string } = { ok: false };
    await act(async () => {
      editResult = await result.current.edit('m-1', 'Attempted edit');
    });
    expect(editResult.ok).toBe(false);
    if (result.current.state.status === 'ready') {
      expect(result.current.state.messages[0]?.body).toBe('Existing');
    }

    // 3. Delete failure preserves message
    deleteMessageMock.mockResolvedValue({ ok: false, kind: 'error', message: 'Failed to delete' });
    let deleteResult: { ok: boolean; error?: string } = { ok: false };
    await act(async () => {
      deleteResult = await result.current.remove('m-1');
    });
    expect(deleteResult.ok).toBe(false);
    if (result.current.state.status === 'ready') {
      expect(result.current.state.messages[0]?.body).toBe('Existing');
      expect(result.current.state.messages[0]?.deletedAt).toBeNull();
    }
  });

  it('tracks isLoadingOlder and handles loadOlder failure with retry', async () => {
    const existing = makeMessage({ id: 'm-2', body: 'Newest' });
    const older = makeMessage({ id: 'm-1', body: 'Older' });

    fetchMessagesMock.mockResolvedValueOnce({
      ok: true,
      data: { messages: [existing], pageInfo: { hasMore: true, nextCursor: 'cursor-1' } },
    });

    const { result } = renderHook(() => useMessages('ch-1'));
    await waitFor(() => {
      expect(result.current.state.status).toBe('ready');
    });

    expect(result.current.isLoadingOlder).toBe(false);
    expect(result.current.loadOlderError).toBeNull();

    // Trigger loadOlder failure
    fetchMessagesMock.mockResolvedValueOnce({
      ok: false,
      kind: 'error',
      message: 'Failed to fetch history',
    });

    let loadPromise: Promise<void>;
    act(() => {
      loadPromise = result.current.loadOlder();
    });

    expect(result.current.isLoadingOlder).toBe(true);

    await act(async () => {
      await loadPromise;
    });

    expect(result.current.isLoadingOlder).toBe(false);
    expect(result.current.loadOlderError).toBe('Failed to fetch history');

    // Retry loadOlder successfully
    fetchMessagesMock.mockResolvedValueOnce({
      ok: true,
      data: { messages: [older], pageInfo: { hasMore: false, nextCursor: null } },
    });

    act(() => {
      loadPromise = result.current.loadOlder();
    });

    expect(result.current.isLoadingOlder).toBe(true);
    expect(result.current.loadOlderError).toBeNull();

    await act(async () => {
      await loadPromise;
    });

    expect(result.current.isLoadingOlder).toBe(false);
    expect(result.current.loadOlderError).toBeNull();
    if (result.current.state.status === 'ready') {
      expect(result.current.state.messages.map((m) => m.id)).toEqual(['m-1', 'm-2']);
      expect(result.current.state.hasMore).toBe(false);
    }
  });

  describe('realtime events', () => {
    it('subscribes to realtime channel and cleans up on unmount', async () => {
      fetchMessagesMock.mockResolvedValue({
        ok: true,
        data: { messages: [], pageInfo: { hasMore: false, nextCursor: null } },
      });
      const { unmount } = renderHook(() => useMessages('ch-1'));

      expect(connectRealtimeMock).toHaveBeenCalled();
      expect(joinRealtimeChannelMock).toHaveBeenCalledWith('ch-1');

      unmount();
      expect(leaveRealtimeChannelMock).toHaveBeenCalledWith('ch-1');
    });

    it('appends incoming message:new to state in chronological order', async () => {
      const existing = makeMessage({ id: 'm-1', body: 'First' });
      fetchMessagesMock.mockResolvedValue({
        ok: true,
        data: { messages: [existing], pageInfo: { hasMore: false, nextCursor: null } },
      });
      const { result } = renderHook(() => useMessages('ch-1'));
      await waitFor(() => {
        expect(result.current.state.status).toBe('ready');
      });

      expect(messageNewHandler).toBeDefined();

      act(() => {
        messageNewHandler?.({
          type: 'message:new',
          channelId: 'ch-1',
          message: {
            id: 'm-2',
            channelId: 'ch-1',
            authorId: 'u-2',
            body: 'Incoming realtime message',
            createdAt: '2026-09-06T12:05:00.000Z',
            updatedAt: '2026-09-06T12:05:00.000Z',
            editedAt: null,
            deletedAt: null,
            author: { id: 'u-2', name: 'Bob', image: null },
          },
        });
      });

      expect(result.current.state.status).toBe('ready');
      if (result.current.state.status === 'ready') {
        expect(result.current.state.messages).toHaveLength(2);
        expect(result.current.state.messages[1].id).toBe('m-2');
        expect(result.current.state.messages[1].body).toBe('Incoming realtime message');
      }
    });

    it('deduplicates incoming message:new if already in state', async () => {
      const existing = makeMessage({ id: 'm-1', body: 'First' });
      fetchMessagesMock.mockResolvedValue({
        ok: true,
        data: { messages: [existing], pageInfo: { hasMore: false, nextCursor: null } },
      });
      const { result } = renderHook(() => useMessages('ch-1'));
      await waitFor(() => {
        expect(result.current.state.status).toBe('ready');
      });

      act(() => {
        messageNewHandler?.({
          type: 'message:new',
          channelId: 'ch-1',
          message: {
            id: 'm-1',
            channelId: 'ch-1',
            authorId: 'u-1',
            body: 'First',
            createdAt: '2026-09-06T12:00:00.000Z',
            updatedAt: '2026-09-06T12:00:00.000Z',
            editedAt: null,
            deletedAt: null,
            author: { id: 'u-1', name: 'Ada Lovelace', image: null },
          },
        });
      });

      if (result.current.state.status === 'ready') {
        expect(result.current.state.messages).toHaveLength(1);
      }
    });

    it('ignores message:new for a different channel', async () => {
      const existing = makeMessage({ id: 'm-1', body: 'First' });
      fetchMessagesMock.mockResolvedValue({
        ok: true,
        data: { messages: [existing], pageInfo: { hasMore: false, nextCursor: null } },
      });
      const { result } = renderHook(() => useMessages('ch-1'));
      await waitFor(() => {
        expect(result.current.state.status).toBe('ready');
      });

      act(() => {
        messageNewHandler?.({
          type: 'message:new',
          channelId: 'ch-other',
          message: {
            id: 'm-2',
            channelId: 'ch-other',
            authorId: 'u-2',
            body: 'Other channel',
            createdAt: '2026-09-06T12:05:00.000Z',
            updatedAt: '2026-09-06T12:05:00.000Z',
            editedAt: null,
            deletedAt: null,
          },
        });
      });

      if (result.current.state.status === 'ready') {
        expect(result.current.state.messages).toHaveLength(1);
      }
    });

    it('updates message on message:updated event', async () => {
      const existing = makeMessage({ id: 'm-1', body: 'Original text' });
      fetchMessagesMock.mockResolvedValue({
        ok: true,
        data: { messages: [existing], pageInfo: { hasMore: false, nextCursor: null } },
      });
      const { result } = renderHook(() => useMessages('ch-1'));
      await waitFor(() => {
        expect(result.current.state.status).toBe('ready');
      });

      act(() => {
        messageUpdatedHandler?.({
          type: 'message:updated',
          channelId: 'ch-1',
          message: {
            id: 'm-1',
            channelId: 'ch-1',
            authorId: 'u-1',
            body: 'Edited text',
            createdAt: '2026-09-06T12:00:00.000Z',
            updatedAt: '2026-09-06T12:06:00.000Z',
            editedAt: '2026-09-06T12:06:00.000Z',
            deletedAt: null,
            author: { id: 'u-1', name: 'Ada Lovelace', image: null },
          },
        });
      });

      if (result.current.state.status === 'ready') {
        expect(result.current.state.messages[0].body).toBe('Edited text');
        expect(result.current.state.messages[0].editedAt).toEqual(
          new Date('2026-09-06T12:06:00.000Z'),
        );
      }
    });

    it('soft deletes message on message:deleted event', async () => {
      const existing = makeMessage({ id: 'm-1', body: 'To be deleted' });
      fetchMessagesMock.mockResolvedValue({
        ok: true,
        data: { messages: [existing], pageInfo: { hasMore: false, nextCursor: null } },
      });
      const { result } = renderHook(() => useMessages('ch-1'));
      await waitFor(() => {
        expect(result.current.state.status).toBe('ready');
      });

      act(() => {
        messageDeletedHandler?.({
          type: 'message:deleted',
          channelId: 'ch-1',
          messageId: 'm-1',
          deletedAt: '2026-09-06T12:07:00.000Z',
        });
      });

      if (result.current.state.status === 'ready') {
        expect(result.current.state.messages[0].body).toBeNull();
        expect(result.current.state.messages[0].deletedAt).toEqual(
          new Date('2026-09-06T12:07:00.000Z'),
        );
      }
    });

    it('re-fetches messages on realtime reconnect and deduplicates', async () => {
      const existing = makeMessage({ id: 'm-1', body: 'First' });
      const incoming = makeMessage({ id: 'm-2', body: 'Second while disconnected' });
      fetchMessagesMock.mockResolvedValueOnce({
        ok: true,
        data: { messages: [existing], pageInfo: { hasMore: false, nextCursor: null } },
      });
      const { result } = renderHook(() => useMessages('ch-1'));
      await waitFor(() => {
        expect(result.current.state.status).toBe('ready');
      });

      fetchMessagesMock.mockResolvedValueOnce({
        ok: true,
        data: { messages: [existing, incoming], pageInfo: { hasMore: false, nextCursor: null } },
      });

      await act(async () => {
        await reconnectHandler?.();
      });

      if (result.current.state.status === 'ready') {
        expect(result.current.state.messages).toHaveLength(2);
        expect(result.current.state.messages.map((m) => m.id)).toEqual(['m-1', 'm-2']);
      }
    });

    it('ignores realtime message:new events that have parentMessageId (thread replies)', async () => {
      const existing = makeMessage({ id: 'm-1', body: 'Root message' });
      fetchMessagesMock.mockResolvedValueOnce({
        ok: true,
        data: { messages: [existing], pageInfo: { hasMore: false, nextCursor: null } },
      });

      const { result } = renderHook(() => useMessages('ch-1'));
      await waitFor(() => {
        expect(result.current.state.status).toBe('ready');
      });

      act(() => {
        messageNewHandler?.({
          type: 'message:new',
          channelId: 'ch-1',
          message: {
            id: 'reply-1',
            channelId: 'ch-1',
            authorId: 'u-1',
            body: 'I am a thread reply',
            createdAt: '2026-09-06T12:05:00.000Z',
            updatedAt: '2026-09-06T12:05:00.000Z',
            editedAt: null,
            deletedAt: null,
            parentMessageId: 'm-1',
            author: { id: 'u-1', name: 'Ada Lovelace', image: null },
          },
        });
      });

      if (result.current.state.status === 'ready') {
        expect(result.current.state.messages).toHaveLength(1);
        expect(result.current.state.messages[0].id).toBe('m-1');
      }
    });

    it('updates root message thread replyCount and latestReplyAt on realtime message:updated', async () => {
      const existing = makeMessage({
        id: 'm-1',
        body: 'Root message',
        replyCount: 0,
        latestReplyAt: null,
      });
      fetchMessagesMock.mockResolvedValueOnce({
        ok: true,
        data: { messages: [existing], pageInfo: { hasMore: false, nextCursor: null } },
      });

      const { result } = renderHook(() => useMessages('ch-1'));
      await waitFor(() => {
        expect(result.current.state.status).toBe('ready');
      });

      act(() => {
        messageUpdatedHandler?.({
          type: 'message:updated',
          channelId: 'ch-1',
          message: {
            id: 'm-1',
            channelId: 'ch-1',
            authorId: 'u-1',
            body: 'Root message',
            createdAt: '2026-09-06T12:00:00.000Z',
            updatedAt: '2026-09-06T12:05:00.000Z',
            editedAt: null,
            deletedAt: null,
            parentMessageId: null,
            replyCount: 1,
            latestReplyAt: '2026-09-06T12:05:00.000Z',
            author: { id: 'u-1', name: 'Ada Lovelace', image: null },
          },
        });
      });

      if (result.current.state.status === 'ready') {
        expect(result.current.state.messages[0].replyCount).toBe(1);
        expect(result.current.state.messages[0].latestReplyAt).toEqual(
          new Date('2026-09-06T12:05:00.000Z'),
        );
      }
    });
  });
});

describe('useMessages reconnect reconciliation (offline window)', () => {
  it('repairs a missed edit via REST recovery without duplicating', async () => {
    const stale = makeMessage({ id: 'm-1', body: 'hello' });
    fetchMessagesMock.mockResolvedValueOnce({
      ok: true,
      data: { messages: [stale], pageInfo: { hasMore: false, nextCursor: null } },
    });
    const { result } = renderHook(() => useMessages('ch-1'));
    await waitFor(() => {
      expect(result.current.state.status).toBe('ready');
    });

    // While offline the server edited m-1; recovery returns the newer revision.
    const edited = makeMessage({
      id: 'm-1',
      body: 'hello edited',
      updatedAt: new Date('2026-09-06T12:05:00.000Z'),
      editedAt: new Date('2026-09-06T12:05:00.000Z'),
    });
    fetchMessagesMock.mockResolvedValueOnce({
      ok: true,
      data: { messages: [edited], pageInfo: { hasMore: false, nextCursor: null } },
    });
    await act(async () => {
      await reconnectHandler?.();
    });

    await waitFor(() => {
      if (result.current.state.status !== 'ready') throw new Error('not ready');
      expect(result.current.state.messages).toHaveLength(1);
      expect(result.current.state.messages[0].body).toBe('hello edited');
    });
  });

  it('repairs a missed delete via REST recovery', async () => {
    const live = makeMessage({ id: 'm-1', body: 'to be deleted' });
    fetchMessagesMock.mockResolvedValueOnce({
      ok: true,
      data: { messages: [live], pageInfo: { hasMore: false, nextCursor: null } },
    });
    const { result } = renderHook(() => useMessages('ch-1'));
    await waitFor(() => {
      expect(result.current.state.status).toBe('ready');
    });

    const tombstone = makeMessage({
      id: 'm-1',
      body: null,
      updatedAt: new Date('2026-09-06T12:07:00.000Z'),
      deletedAt: new Date('2026-09-06T12:07:00.000Z'),
    });
    fetchMessagesMock.mockResolvedValueOnce({
      ok: true,
      data: { messages: [tombstone], pageInfo: { hasMore: false, nextCursor: null } },
    });
    await act(async () => {
      await reconnectHandler?.();
    });

    await waitFor(() => {
      if (result.current.state.status !== 'ready') throw new Error('not ready');
      expect(result.current.state.messages).toHaveLength(1);
      expect(result.current.state.messages[0].body).toBeNull();
      expect(result.current.state.messages[0].deletedAt).toEqual(
        new Date('2026-09-06T12:07:00.000Z'),
      );
    });
  });

  it('keeps newest state when a socket update races REST recovery', async () => {
    const stale = makeMessage({ id: 'm-1', body: 'hello' });
    fetchMessagesMock.mockResolvedValueOnce({
      ok: true,
      data: { messages: [stale], pageInfo: { hasMore: false, nextCursor: null } },
    });
    const { result } = renderHook(() => useMessages('ch-1'));
    await waitFor(() => {
      expect(result.current.state.status).toBe('ready');
    });

    const editedJson = {
      id: 'm-1',
      channelId: 'ch-1',
      authorId: 'u-1',
      body: 'hello edited',
      createdAt: '2026-09-06T12:00:00.000Z',
      updatedAt: '2026-09-06T12:05:00.000Z',
      editedAt: '2026-09-06T12:05:00.000Z',
      deletedAt: null,
      author: { id: 'u-1', name: 'Ada Lovelace', image: null },
    };

    // Socket update arrives first.
    act(() => {
      messageUpdatedHandler?.({ type: 'message:updated', channelId: 'ch-1', message: editedJson });
    });

    // Then REST recovery returns the same revision: still one message, edited.
    const edited = makeMessage({
      id: 'm-1',
      body: 'hello edited',
      updatedAt: new Date('2026-09-06T12:05:00.000Z'),
      editedAt: new Date('2026-09-06T12:05:00.000Z'),
    });
    fetchMessagesMock.mockResolvedValueOnce({
      ok: true,
      data: { messages: [edited], pageInfo: { hasMore: false, nextCursor: null } },
    });
    await act(async () => {
      await reconnectHandler?.();
    });

    await waitFor(() => {
      if (result.current.state.status !== 'ready') throw new Error('not ready');
      expect(result.current.state.messages).toHaveLength(1);
      expect(result.current.state.messages[0].body).toBe('hello edited');
    });
  });
});
