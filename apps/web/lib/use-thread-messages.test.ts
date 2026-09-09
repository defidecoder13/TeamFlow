import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useThreadMessages } from './use-thread-messages';
import type { Message } from './messages';
import type {
  RealtimeMessageDeletedEvent,
  RealtimeMessageNewEvent,
  RealtimeMessageUpdatedEvent,
} from './realtime-client';

const {
  fetchThreadRepliesMock,
  sendThreadReplyMock,
  editMessageMock,
  deleteMessageMock,
  connectRealtimeMock,
  onRealtimeMessageNewMock,
  onRealtimeMessageUpdatedMock,
  onRealtimeMessageDeletedMock,
  onRealtimeReconnectMock,
  unsubscribeNewMock,
  unsubscribeUpdatedMock,
  unsubscribeDeletedMock,
  unsubscribeReconnectMock,
} = vi.hoisted(() => ({
  fetchThreadRepliesMock: vi.fn(),
  sendThreadReplyMock: vi.fn(),
  editMessageMock: vi.fn(),
  deleteMessageMock: vi.fn(),
  connectRealtimeMock: vi.fn(),
  onRealtimeMessageNewMock: vi.fn(),
  onRealtimeMessageUpdatedMock: vi.fn(),
  onRealtimeMessageDeletedMock: vi.fn(),
  onRealtimeReconnectMock: vi.fn(),
  unsubscribeNewMock: vi.fn(),
  unsubscribeUpdatedMock: vi.fn(),
  unsubscribeDeletedMock: vi.fn(),
  unsubscribeReconnectMock: vi.fn(),
}));

vi.mock('./messages', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./messages')>()),
  fetchThreadReplies: fetchThreadRepliesMock,
  sendThreadReply: sendThreadReplyMock,
  editMessage: editMessageMock,
  deleteMessage: deleteMessageMock,
}));

vi.mock('./realtime-client', () => ({
  connectRealtime: connectRealtimeMock,
  onRealtimeMessageNew: onRealtimeMessageNewMock,
  onRealtimeMessageUpdated: onRealtimeMessageUpdatedMock,
  onRealtimeMessageDeleted: onRealtimeMessageDeletedMock,
  onRealtimeReconnect: onRealtimeReconnectMock,
}));

function makeReply(id: string, body: string, dateStr: string): Message {
  return {
    id,
    channelId: 'ch-1',
    parentMessageId: 'root-1',
    authorId: 'u-1',
    body,
    createdAt: new Date(dateStr),
    updatedAt: new Date(dateStr),
    editedAt: null,
    deletedAt: null,
    author: { id: 'u-1', name: 'Ada Lovelace', image: null },
  };
}

function makeReplyPayload(
  id: string,
  body: string,
  dateStr: string,
  overrides: Record<string, unknown> = {},
) {
  return {
    id,
    channelId: 'ch-1',
    parentMessageId: 'root-1',
    authorId: 'u-1',
    body,
    createdAt: dateStr,
    updatedAt: dateStr,
    editedAt: null,
    deletedAt: null,
    author: { id: 'u-1', name: 'Ada Lovelace', image: null },
    ...overrides,
  };
}

describe('useThreadMessages', () => {
  let messageNewHandler: ((event: RealtimeMessageNewEvent) => void) | null = null;
  let messageUpdatedHandler: ((event: RealtimeMessageUpdatedEvent) => void) | null = null;
  let messageDeletedHandler: ((event: RealtimeMessageDeletedEvent) => void) | null = null;
  let reconnectHandler: (() => void) | null = null;

  beforeEach(() => {
    vi.stubEnv('NEXT_PUBLIC_API_URL', 'http://localhost:4000');
    fetchThreadRepliesMock.mockReset();
    sendThreadReplyMock.mockReset();
    editMessageMock.mockReset();
    deleteMessageMock.mockReset();
    connectRealtimeMock.mockReset();
    onRealtimeMessageNewMock.mockReset();
    onRealtimeMessageUpdatedMock.mockReset();
    onRealtimeMessageDeletedMock.mockReset();
    onRealtimeReconnectMock.mockReset();
    unsubscribeNewMock.mockReset();
    unsubscribeUpdatedMock.mockReset();
    unsubscribeDeletedMock.mockReset();
    unsubscribeReconnectMock.mockReset();

    messageNewHandler = null;
    messageUpdatedHandler = null;
    messageDeletedHandler = null;
    reconnectHandler = null;

    onRealtimeMessageNewMock.mockImplementation((handler) => {
      messageNewHandler = handler;
      return unsubscribeNewMock;
    });
    onRealtimeMessageUpdatedMock.mockImplementation((handler) => {
      messageUpdatedHandler = handler;
      return unsubscribeUpdatedMock;
    });
    onRealtimeMessageDeletedMock.mockImplementation((handler) => {
      messageDeletedHandler = handler;
      return unsubscribeDeletedMock;
    });
    onRealtimeReconnectMock.mockImplementation((handler) => {
      reconnectHandler = handler;
      return unsubscribeReconnectMock;
    });
  });

  it('loads thread replies and normalizes to chronological order (oldest first)', async () => {
    const reply1 = makeReply('r-1', 'First reply', '2026-09-06T12:05:00.000Z');
    const reply2 = makeReply('r-2', 'Second reply', '2026-09-06T12:10:00.000Z');

    fetchThreadRepliesMock.mockResolvedValue({
      ok: true,
      data: {
        messages: [reply2, reply1],
        pageInfo: { hasMore: false, nextCursor: null },
      },
    });

    const { result } = renderHook(() => useThreadMessages('root-1', 'ch-1'));

    expect(result.current.state.status).toBe('loading');

    await waitFor(() => {
      expect(result.current.state.status).toBe('ready');
    });

    if (result.current.state.status === 'ready') {
      expect(result.current.state.messages.map((m) => m.id)).toEqual(['r-1', 'r-2']);
      expect(result.current.state.hasMore).toBe(false);
    }
  });

  it('handles unauthenticated and notFound states', async () => {
    fetchThreadRepliesMock.mockResolvedValueOnce({
      ok: false,
      unauthenticated: true,
    });

    const { result, rerender } = renderHook(({ rootId }) => useThreadMessages(rootId, 'ch-1'), {
      initialProps: { rootId: 'root-unauth' },
    });

    await waitFor(() => {
      expect(result.current.state.status).toBe('unauthenticated');
    });

    fetchThreadRepliesMock.mockResolvedValueOnce({
      ok: false,
      kind: 'notFound',
      message: 'Root message not found',
    });

    rerender({ rootId: 'root-missing' });

    await waitFor(() => {
      expect(result.current.state.status).toBe('notFound');
    });
  });

  it('loads older replies via keyset pagination and prepends chronologically', async () => {
    const reply3 = makeReply('r-3', 'Third reply', '2026-09-06T12:15:00.000Z');
    const reply2 = makeReply('r-2', 'Second reply', '2026-09-06T12:10:00.000Z');
    const reply1 = makeReply('r-1', 'First reply', '2026-09-06T12:05:00.000Z');

    fetchThreadRepliesMock.mockResolvedValueOnce({
      ok: true,
      data: {
        messages: [reply3, reply2],
        pageInfo: { hasMore: true, nextCursor: 'cur-2' },
      },
    });

    const { result } = renderHook(() => useThreadMessages('root-1', 'ch-1'));

    await waitFor(() => {
      expect(result.current.state.status).toBe('ready');
    });

    fetchThreadRepliesMock.mockResolvedValueOnce({
      ok: true,
      data: {
        messages: [reply1],
        pageInfo: { hasMore: false, nextCursor: null },
      },
    });

    await act(async () => {
      await result.current.loadOlder();
    });

    if (result.current.state.status === 'ready') {
      expect(result.current.state.messages.map((m) => m.id)).toEqual(['r-1', 'r-2', 'r-3']);
      expect(result.current.state.hasMore).toBe(false);
    }
  });

  it('sends a new reply and appends it to messages', async () => {
    const reply1 = makeReply('r-1', 'First reply', '2026-09-06T12:05:00.000Z');
    const replyNew = makeReply('r-new', 'Fresh reply', '2026-09-06T12:20:00.000Z');

    fetchThreadRepliesMock.mockResolvedValueOnce({
      ok: true,
      data: {
        messages: [reply1],
        pageInfo: { hasMore: false, nextCursor: null },
      },
    });

    sendThreadReplyMock.mockResolvedValueOnce({
      ok: true,
      data: replyNew,
    });

    const { result } = renderHook(() => useThreadMessages('root-1', 'ch-1'));

    await waitFor(() => {
      expect(result.current.state.status).toBe('ready');
    });

    let sendRes: { ok: boolean; error?: string } | undefined;
    await act(async () => {
      sendRes = await result.current.send('Fresh reply');
    });

    expect(sendRes?.ok).toBe(true);
    if (result.current.state.status === 'ready') {
      expect(result.current.state.messages.map((m) => m.id)).toEqual(['r-1', 'r-new']);
    }
  });

  it('edits an existing reply in place', async () => {
    const reply1 = makeReply('r-1', 'First reply', '2026-09-06T12:05:00.000Z');
    const replyEdited = {
      ...reply1,
      body: 'Edited reply',
      editedAt: new Date('2026-09-06T12:25:00.000Z'),
    };

    fetchThreadRepliesMock.mockResolvedValueOnce({
      ok: true,
      data: {
        messages: [reply1],
        pageInfo: { hasMore: false, nextCursor: null },
      },
    });

    editMessageMock.mockResolvedValueOnce({
      ok: true,
      data: replyEdited,
    });

    const { result } = renderHook(() => useThreadMessages('root-1', 'ch-1'));

    await waitFor(() => {
      expect(result.current.state.status).toBe('ready');
    });

    await act(async () => {
      await result.current.edit('r-1', 'Edited reply');
    });

    if (result.current.state.status === 'ready') {
      expect(result.current.state.messages[0].body).toBe('Edited reply');
      expect(result.current.state.messages[0].editedAt).toBeDefined();
    }
  });

  it('removes a reply and renders as a tombstone', async () => {
    const reply1 = makeReply('r-1', 'To be deleted', '2026-09-06T12:05:00.000Z');
    const tombstone = {
      ...reply1,
      body: null,
      deletedAt: new Date('2026-09-06T12:30:00.000Z'),
    };

    fetchThreadRepliesMock.mockResolvedValueOnce({
      ok: true,
      data: {
        messages: [reply1],
        pageInfo: { hasMore: false, nextCursor: null },
      },
    });

    deleteMessageMock.mockResolvedValueOnce({
      ok: true,
      data: tombstone,
    });

    const { result } = renderHook(() => useThreadMessages('root-1', 'ch-1'));

    await waitFor(() => {
      expect(result.current.state.status).toBe('ready');
    });

    await act(async () => {
      await result.current.remove('r-1');
    });

    if (result.current.state.status === 'ready') {
      expect(result.current.state.messages[0].body).toBeNull();
      expect(result.current.state.messages[0].deletedAt).toBeDefined();
    }
  });

  describe('Realtime Thread Synchronization (Phase 4D.4)', () => {
    it('appends realtime message:new to the open thread chronologically', async () => {
      const reply1 = makeReply('r-1', 'First reply', '2026-09-06T12:05:00.000Z');

      fetchThreadRepliesMock.mockResolvedValueOnce({
        ok: true,
        data: {
          messages: [reply1],
          pageInfo: { hasMore: false, nextCursor: null },
        },
      });

      const { result } = renderHook(() => useThreadMessages('root-1', 'ch-1'));

      await waitFor(() => {
        expect(result.current.state.status).toBe('ready');
      });

      expect(messageNewHandler).toBeDefined();

      // Trigger realtime reply from User B
      act(() => {
        messageNewHandler!({
          type: 'message:new',
          channelId: 'ch-1',
          message: makeReplyPayload('r-2', 'Live realtime reply', '2026-09-06T12:10:00.000Z'),
        });
      });

      if (result.current.state.status === 'ready') {
        expect(result.current.state.messages.map((m) => m.id)).toEqual(['r-1', 'r-2']);
        expect(result.current.state.messages[1].body).toBe('Live realtime reply');
      }
    });

    it('deduplicates sender: HTTP response first, then Socket.IO event', async () => {
      const reply1 = makeReply('r-1', 'First reply', '2026-09-06T12:05:00.000Z');
      const replyNew = makeReply('r-mine', 'My new reply', '2026-09-06T12:10:00.000Z');

      fetchThreadRepliesMock.mockResolvedValueOnce({
        ok: true,
        data: {
          messages: [reply1],
          pageInfo: { hasMore: false, nextCursor: null },
        },
      });
      sendThreadReplyMock.mockResolvedValueOnce({
        ok: true,
        data: replyNew,
      });

      const { result } = renderHook(() => useThreadMessages('root-1', 'ch-1'));

      await waitFor(() => {
        expect(result.current.state.status).toBe('ready');
      });

      // 1. HTTP POST succeeds
      await act(async () => {
        await result.current.send('My new reply');
      });

      if (result.current.state.status === 'ready') {
        expect(result.current.state.messages.map((m) => m.id)).toEqual(['r-1', 'r-mine']);
      }

      // 2. Later, Socket.IO message:new arrives for r-mine
      act(() => {
        messageNewHandler!({
          type: 'message:new',
          channelId: 'ch-1',
          message: makeReplyPayload('r-mine', 'My new reply', '2026-09-06T12:10:00.000Z'),
        });
      });

      // Must render exactly once
      if (result.current.state.status === 'ready') {
        expect(result.current.state.messages.map((m) => m.id)).toEqual(['r-1', 'r-mine']);
      }
    });

    it('deduplicates sender: Socket.IO event first, then HTTP response arrives second', async () => {
      const reply1 = makeReply('r-1', 'First reply', '2026-09-06T12:05:00.000Z');
      const replyNew = makeReply('r-mine', 'My new reply', '2026-09-06T12:10:00.000Z');

      fetchThreadRepliesMock.mockResolvedValueOnce({
        ok: true,
        data: {
          messages: [reply1],
          pageInfo: { hasMore: false, nextCursor: null },
        },
      });

      let resolveHttpSend: (val: { ok: boolean; data: Message }) => void;
      const sendPromise = new Promise<{ ok: boolean; data: Message }>((resolve) => {
        resolveHttpSend = resolve;
      });
      sendThreadReplyMock.mockImplementationOnce(() => sendPromise);

      const { result } = renderHook(() => useThreadMessages('root-1', 'ch-1'));

      await waitFor(() => {
        expect(result.current.state.status).toBe('ready');
      });

      // 1. Send is triggered, HTTP request in flight
      let sendDone = false;
      const sendPromiseCall = result.current.send('My new reply').then((res) => {
        sendDone = true;
        return res;
      });

      // 2. Before HTTP resolves, Socket.IO message:new arrives
      act(() => {
        messageNewHandler!({
          type: 'message:new',
          channelId: 'ch-1',
          message: makeReplyPayload('r-mine', 'My new reply', '2026-09-06T12:10:00.000Z'),
        });
      });

      if (result.current.state.status === 'ready') {
        expect(result.current.state.messages.map((m) => m.id)).toEqual(['r-1', 'r-mine']);
      }

      // 3. Now HTTP response arrives
      await act(async () => {
        resolveHttpSend!({ ok: true, data: replyNew });
        await sendPromiseCall;
      });
      expect(sendDone).toBe(true);

      // Must render exactly once
      if (result.current.state.status === 'ready') {
        expect(result.current.state.messages.map((m) => m.id)).toEqual(['r-1', 'r-mine']);
      }
    });

    it('ignores message:new belonging to another channel', async () => {
      const reply1 = makeReply('r-1', 'First reply', '2026-09-06T12:05:00.000Z');
      fetchThreadRepliesMock.mockResolvedValueOnce({
        ok: true,
        data: { messages: [reply1], pageInfo: { hasMore: false, nextCursor: null } },
      });

      const { result } = renderHook(() => useThreadMessages('root-1', 'ch-1'));
      await waitFor(() => expect(result.current.state.status).toBe('ready'));

      act(() => {
        messageNewHandler!({
          type: 'message:new',
          channelId: 'ch-other', // different channel
          message: makeReplyPayload('r-other', 'Other channel reply', '2026-09-06T12:10:00.000Z'),
        });
      });

      if (result.current.state.status === 'ready') {
        expect(result.current.state.messages.map((m) => m.id)).toEqual(['r-1']);
      }
    });

    it('ignores message:new belonging to another root thread', async () => {
      const reply1 = makeReply('r-1', 'First reply', '2026-09-06T12:05:00.000Z');
      fetchThreadRepliesMock.mockResolvedValueOnce({
        ok: true,
        data: { messages: [reply1], pageInfo: { hasMore: false, nextCursor: null } },
      });

      const { result } = renderHook(() => useThreadMessages('root-1', 'ch-1'));
      await waitFor(() => expect(result.current.state.status).toBe('ready'));

      act(() => {
        messageNewHandler!({
          type: 'message:new',
          channelId: 'ch-1',
          message: makeReplyPayload('r-other', 'Another thread reply', '2026-09-06T12:10:00.000Z', {
            parentMessageId: 'root-different',
          }),
        });
      });

      if (result.current.state.status === 'ready') {
        expect(result.current.state.messages.map((m) => m.id)).toEqual(['r-1']);
      }
    });

    it('ignores root channel messages with parentMessageId: null', async () => {
      const reply1 = makeReply('r-1', 'First reply', '2026-09-06T12:05:00.000Z');
      fetchThreadRepliesMock.mockResolvedValueOnce({
        ok: true,
        data: { messages: [reply1], pageInfo: { hasMore: false, nextCursor: null } },
      });

      const { result } = renderHook(() => useThreadMessages('root-1', 'ch-1'));
      await waitFor(() => expect(result.current.state.status).toBe('ready'));

      act(() => {
        messageNewHandler!({
          type: 'message:new',
          channelId: 'ch-1',
          message: makeReplyPayload(
            'root-msg-new',
            'Root channel message',
            '2026-09-06T12:10:00.000Z',
            {
              parentMessageId: null,
            },
          ),
        });
      });

      if (result.current.state.status === 'ready') {
        expect(result.current.state.messages.map((m) => m.id)).toEqual(['r-1']);
      }
    });

    it('updates loaded reply in place on realtime message:updated', async () => {
      const reply1 = makeReply('r-1', 'Initial body', '2026-09-06T12:05:00.000Z');
      fetchThreadRepliesMock.mockResolvedValueOnce({
        ok: true,
        data: { messages: [reply1], pageInfo: { hasMore: false, nextCursor: null } },
      });

      const { result } = renderHook(() => useThreadMessages('root-1', 'ch-1'));
      await waitFor(() => expect(result.current.state.status).toBe('ready'));

      act(() => {
        messageUpdatedHandler!({
          type: 'message:updated',
          channelId: 'ch-1',
          message: makeReplyPayload('r-1', 'Edited remotely', '2026-09-06T12:05:00.000Z', {
            editedAt: '2026-09-06T12:15:00.000Z',
          }),
        });
      });

      if (result.current.state.status === 'ready') {
        expect(result.current.state.messages[0].body).toBe('Edited remotely');
        expect(result.current.state.messages[0].editedAt).toBeDefined();
      }
    });

    it('safely ignores message:updated if reply is not loaded in current window', async () => {
      const reply1 = makeReply('r-1', 'Initial body', '2026-09-06T12:05:00.000Z');
      fetchThreadRepliesMock.mockResolvedValueOnce({
        ok: true,
        data: { messages: [reply1], pageInfo: { hasMore: false, nextCursor: null } },
      });

      const { result } = renderHook(() => useThreadMessages('root-1', 'ch-1'));
      await waitFor(() => expect(result.current.state.status).toBe('ready'));

      act(() => {
        messageUpdatedHandler!({
          type: 'message:updated',
          channelId: 'ch-1',
          message: makeReplyPayload(
            'r-unloaded',
            'Updated older reply',
            '2026-09-06T12:01:00.000Z',
          ),
        });
      });

      if (result.current.state.status === 'ready') {
        expect(result.current.state.messages.map((m) => m.id)).toEqual(['r-1']);
      }
    });

    it('transforms reply into tombstone on realtime message:deleted', async () => {
      const reply1 = makeReply('r-1', 'Will be deleted', '2026-09-06T12:05:00.000Z');
      fetchThreadRepliesMock.mockResolvedValueOnce({
        ok: true,
        data: { messages: [reply1], pageInfo: { hasMore: false, nextCursor: null } },
      });

      const { result } = renderHook(() => useThreadMessages('root-1', 'ch-1'));
      await waitFor(() => expect(result.current.state.status).toBe('ready'));

      act(() => {
        messageDeletedHandler!({
          type: 'message:deleted',
          channelId: 'ch-1',
          messageId: 'r-1',
          deletedAt: '2026-09-06T12:20:00.000Z',
        });
      });

      if (result.current.state.status === 'ready') {
        expect(result.current.state.messages[0].body).toBeNull();
        expect(result.current.state.messages[0].deletedAt).toEqual(
          new Date('2026-09-06T12:20:00.000Z'),
        );
      }
    });

    it('re-syncs missed replies upon reconnect without duplicates', async () => {
      const reply1 = makeReply('r-1', 'Initial reply', '2026-09-06T12:05:00.000Z');
      const reply2 = makeReply('r-2', 'Missed offline reply', '2026-09-06T12:15:00.000Z');

      fetchThreadRepliesMock.mockResolvedValueOnce({
        ok: true,
        data: { messages: [reply1], pageInfo: { hasMore: false, nextCursor: null } },
      });

      const { result } = renderHook(() => useThreadMessages('root-1', 'ch-1'));
      await waitFor(() => expect(result.current.state.status).toBe('ready'));

      // Reconnect fetch returns reply1 and newly created reply2
      fetchThreadRepliesMock.mockResolvedValueOnce({
        ok: true,
        data: { messages: [reply2, reply1], pageInfo: { hasMore: false, nextCursor: null } },
      });

      await act(async () => {
        await reconnectHandler!();
      });

      if (result.current.state.status === 'ready') {
        expect(result.current.state.messages.map((m) => m.id)).toEqual(['r-1', 'r-2']);
      }
    });

    it('repairs missed reply edits and deletes via reconnect recovery', async () => {
      const reply1 = makeReply('r-1', 'Initial reply', '2026-09-06T12:05:00.000Z');

      fetchThreadRepliesMock.mockResolvedValueOnce({
        ok: true,
        data: { messages: [reply1], pageInfo: { hasMore: false, nextCursor: null } },
      });

      const { result } = renderHook(() => useThreadMessages('root-1', 'ch-1'));
      await waitFor(() => expect(result.current.state.status).toBe('ready'));

      // Missed edit repaired, reply stays in the thread (never promoted).
      const editedReply1: Message = {
        ...reply1,
        body: 'Initial reply (edited while offline)',
        updatedAt: new Date('2026-09-06T12:18:00.000Z'),
        editedAt: new Date('2026-09-06T12:18:00.000Z'),
      };
      fetchThreadRepliesMock.mockResolvedValueOnce({
        ok: true,
        data: { messages: [editedReply1], pageInfo: { hasMore: false, nextCursor: null } },
      });

      await act(async () => {
        await reconnectHandler!();
      });

      await waitFor(() => {
        if (result.current.state.status !== 'ready') throw new Error('not ready');
        expect(result.current.state.messages).toHaveLength(1);
        expect(result.current.state.messages[0].body).toBe('Initial reply (edited while offline)');
        expect(result.current.state.messages[0].parentMessageId).toBe('root-1');
      });

      // Missed delete repaired on the next recovery.
      const deletedReply1: Message = {
        ...editedReply1,
        body: null,
        updatedAt: new Date('2026-09-06T12:20:00.000Z'),
        deletedAt: new Date('2026-09-06T12:20:00.000Z'),
      };
      fetchThreadRepliesMock.mockResolvedValueOnce({
        ok: true,
        data: { messages: [deletedReply1], pageInfo: { hasMore: false, nextCursor: null } },
      });

      await act(async () => {
        await reconnectHandler!();
      });

      await waitFor(() => {
        if (result.current.state.status !== 'ready') throw new Error('not ready');
        expect(result.current.state.messages).toHaveLength(1);
        expect(result.current.state.messages[0].body).toBeNull();
        expect(result.current.state.messages[0].parentMessageId).toBe('root-1');
      });
    });

    it('cleans up realtime listeners on unmount or root switch', async () => {
      fetchThreadRepliesMock.mockResolvedValue({
        ok: true,
        data: { messages: [], pageInfo: { hasMore: false, nextCursor: null } },
      });

      const { unmount, rerender } = renderHook(({ rootId }) => useThreadMessages(rootId, 'ch-1'), {
        initialProps: { rootId: 'root-1' },
      });

      await waitFor(() => {
        expect(onRealtimeMessageNewMock).toHaveBeenCalledTimes(1);
      });

      // Switch to another root thread
      rerender({ rootId: 'root-2' });

      expect(unsubscribeNewMock).toHaveBeenCalledTimes(1);
      expect(unsubscribeUpdatedMock).toHaveBeenCalledTimes(1);
      expect(unsubscribeDeletedMock).toHaveBeenCalledTimes(1);
      expect(unsubscribeReconnectMock).toHaveBeenCalledTimes(1);

      unmount();

      expect(unsubscribeNewMock).toHaveBeenCalledTimes(2);
      expect(unsubscribeUpdatedMock).toHaveBeenCalledTimes(2);
      expect(unsubscribeDeletedMock).toHaveBeenCalledTimes(2);
      expect(unsubscribeReconnectMock).toHaveBeenCalledTimes(2);
    });
  });

  it('guards against stale responses during root switch race condition', async () => {
    let resolveFirst: (v: unknown) => void;
    const firstPromise = new Promise((resolve) => {
      resolveFirst = resolve;
    });

    fetchThreadRepliesMock.mockImplementationOnce(() => firstPromise);

    const { result, rerender } = renderHook(({ rootId }) => useThreadMessages(rootId, 'ch-1'), {
      initialProps: { rootId: 'root-slow' },
    });

    expect(result.current.state.status).toBe('loading');

    // Switch to root-fast
    const fastReply = makeReply('r-fast', 'Fast reply', '2026-09-06T12:00:00.000Z');
    fetchThreadRepliesMock.mockResolvedValueOnce({
      ok: true,
      data: {
        messages: [fastReply],
        pageInfo: { hasMore: false, nextCursor: null },
      },
    });

    rerender({ rootId: 'root-fast' });

    await waitFor(() => {
      expect(result.current.state.status).toBe('ready');
    });

    if (result.current.state.status === 'ready') {
      expect(result.current.state.messages.map((m) => m.id)).toEqual(['r-fast']);
    }

    // Now resolve root-slow
    const slowReply = makeReply('r-slow', 'Slow reply', '2026-09-06T12:00:00.000Z');
    await act(async () => {
      resolveFirst!({
        ok: true,
        data: {
          messages: [slowReply],
          pageInfo: { hasMore: false, nextCursor: null },
        },
      });
    });

    // Root-fast messages should not be overwritten by root-slow
    if (result.current.state.status === 'ready') {
      expect(result.current.state.messages.map((m) => m.id)).toEqual(['r-fast']);
    }
  });
});
