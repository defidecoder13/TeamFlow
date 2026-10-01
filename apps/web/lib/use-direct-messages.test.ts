import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useDirectMessages } from './use-direct-messages';
import type { Message } from './messages';
import type {
  RealtimeMessageDeletedEvent,
  RealtimeMessageNewEvent,
  RealtimeMessageUpdatedEvent,
} from './realtime-client';

const {
  fetchDirectMessagesMock,
  sendDirectMessageMock,
  editMessageMock,
  deleteMessageMock,
  markDirectConversationReadMock,
  connectRealtimeMock,
  joinRealtimeDirectConversationMock,
  leaveRealtimeDirectConversationMock,
  onRealtimeMessageNewMock,
  onRealtimeMessageUpdatedMock,
  onRealtimeMessageDeletedMock,
  onRealtimeReconnectMock,
} = vi.hoisted(() => ({
  fetchDirectMessagesMock: vi.fn(),
  sendDirectMessageMock: vi.fn(),
  editMessageMock: vi.fn(),
  deleteMessageMock: vi.fn(),
  markDirectConversationReadMock: vi.fn(),
  connectRealtimeMock: vi.fn(),
  joinRealtimeDirectConversationMock: vi.fn(),
  leaveRealtimeDirectConversationMock: vi.fn(),
  onRealtimeMessageNewMock: vi.fn(),
  onRealtimeMessageUpdatedMock: vi.fn(),
  onRealtimeMessageDeletedMock: vi.fn(),
  onRealtimeReconnectMock: vi.fn(),
}));

vi.mock('./messages', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./messages')>()),
  fetchDirectMessages: fetchDirectMessagesMock,
  sendDirectMessage: sendDirectMessageMock,
  editMessage: editMessageMock,
  deleteMessage: deleteMessageMock,
  markDirectConversationRead: markDirectConversationReadMock,
}));

vi.mock('./realtime-client', () => ({
  connectRealtime: connectRealtimeMock,
  joinRealtimeDirectConversation: joinRealtimeDirectConversationMock,
  leaveRealtimeDirectConversation: leaveRealtimeDirectConversationMock,
  onRealtimeMessageNew: onRealtimeMessageNewMock,
  onRealtimeMessageUpdated: onRealtimeMessageUpdatedMock,
  onRealtimeMessageDeleted: onRealtimeMessageDeletedMock,
  onRealtimeReconnect: onRealtimeReconnectMock,
}));

const MESSAGE_1: Message = {
  id: 'msg-1',
  channelId: null,
  directMessageConversationId: 'dm-1',
  parentMessageId: null,
  authorId: 'u-1',
  body: 'Hello there!',
  replyCount: 0,
  latestReplyAt: null,
  createdAt: new Date('2026-09-08T00:00:00.000Z'),
  updatedAt: new Date('2026-09-08T00:00:00.000Z'),
  editedAt: null,
  deletedAt: null,
  author: { id: 'u-1', name: 'User One', image: null },
};

const MESSAGE_2: Message = {
  id: 'msg-2',
  channelId: null,
  directMessageConversationId: 'dm-1',
  parentMessageId: null,
  authorId: 'u-2',
  body: 'General Kenobi!',
  replyCount: 0,
  latestReplyAt: null,
  createdAt: new Date('2026-09-08T00:01:00.000Z'),
  updatedAt: new Date('2026-09-08T00:01:00.000Z'),
  editedAt: null,
  deletedAt: null,
  author: { id: 'u-2', name: 'User Two', image: null },
};

let messageNewHandler: ((event: RealtimeMessageNewEvent) => void) | null = null;
let messageUpdatedHandler: ((event: RealtimeMessageUpdatedEvent) => void) | null = null;
let messageDeletedHandler: ((event: RealtimeMessageDeletedEvent) => void) | null = null;
let reconnectHandler: (() => void) | null = null;

const unsubscribeNew = vi.fn();
const unsubscribeUpdated = vi.fn();
const unsubscribeDeleted = vi.fn();
const unsubscribeReconnect = vi.fn();

beforeEach(() => {
  fetchDirectMessagesMock.mockReset();
  sendDirectMessageMock.mockReset();
  editMessageMock.mockReset();
  deleteMessageMock.mockReset();
  connectRealtimeMock.mockReset();
  joinRealtimeDirectConversationMock.mockReset();
  leaveRealtimeDirectConversationMock.mockReset();
  onRealtimeMessageNewMock.mockReset();
  onRealtimeMessageUpdatedMock.mockReset();
  onRealtimeMessageDeletedMock.mockReset();
  onRealtimeReconnectMock.mockReset();
  unsubscribeNew.mockReset();
  unsubscribeUpdated.mockReset();
  unsubscribeDeleted.mockReset();
  unsubscribeReconnect.mockReset();

  messageNewHandler = null;
  messageUpdatedHandler = null;
  messageDeletedHandler = null;
  reconnectHandler = null;

  onRealtimeMessageNewMock.mockImplementation(
    (handler: (event: RealtimeMessageNewEvent) => void) => {
      messageNewHandler = handler;
      return unsubscribeNew;
    },
  );
  onRealtimeMessageUpdatedMock.mockImplementation(
    (handler: (event: RealtimeMessageUpdatedEvent) => void) => {
      messageUpdatedHandler = handler;
      return unsubscribeUpdated;
    },
  );
  onRealtimeMessageDeletedMock.mockImplementation(
    (handler: (event: RealtimeMessageDeletedEvent) => void) => {
      messageDeletedHandler = handler;
      return unsubscribeDeleted;
    },
  );
  onRealtimeReconnectMock.mockImplementation((handler: () => void) => {
    reconnectHandler = handler;
    return unsubscribeReconnect;
  });

  vi.stubEnv('NEXT_PUBLIC_API_URL', 'http://localhost:4000');
});

describe('useDirectMessages', () => {
  it('stays idle when conversationId is null', () => {
    const { result } = renderHook(() => useDirectMessages(null));
    expect(result.current.state).toEqual({ status: 'idle' });
    expect(fetchDirectMessagesMock).not.toHaveBeenCalled();
  });

  it('loads and reverses messages into chronological order', async () => {
    // Backend returns newest first: [MESSAGE_2, MESSAGE_1]
    fetchDirectMessagesMock.mockResolvedValue({
      ok: true,
      data: {
        messages: [MESSAGE_2, MESSAGE_1],
        pageInfo: { hasMore: false, nextCursor: null },
      },
    });

    const { result } = renderHook(() => useDirectMessages('dm-1'));

    await waitFor(() => {
      expect(result.current.state.status).toBe('ready');
    });

    if (result.current.state.status === 'ready') {
      // Hook normalizes to oldest first: [MESSAGE_1, MESSAGE_2]
      expect(result.current.state.messages).toEqual([MESSAGE_1, MESSAGE_2]);
      expect(result.current.state.hasMore).toBe(false);
    }
  });

  it('sends direct message and appends to state', async () => {
    fetchDirectMessagesMock.mockResolvedValue({
      ok: true,
      data: {
        messages: [MESSAGE_1],
        pageInfo: { hasMore: false, nextCursor: null },
      },
    });
    sendDirectMessageMock.mockResolvedValue({
      ok: true,
      data: MESSAGE_2,
    });

    const { result } = renderHook(() => useDirectMessages('dm-1'));

    await waitFor(() => {
      expect(result.current.state.status).toBe('ready');
    });

    let sendResult: { ok: boolean; error?: string } = { ok: false };
    await act(async () => {
      sendResult = await result.current.send('General Kenobi!');
    });

    expect(sendResult.ok).toBe(true);
    if (result.current.state.status === 'ready') {
      expect(result.current.state.messages).toEqual([MESSAGE_1, MESSAGE_2]);
    }
  });

  it('edits a message in-place', async () => {
    fetchDirectMessagesMock.mockResolvedValue({
      ok: true,
      data: {
        messages: [MESSAGE_1],
        pageInfo: { hasMore: false, nextCursor: null },
      },
    });
    const editedMsg: Message = { ...MESSAGE_1, body: 'Updated message' };
    editMessageMock.mockResolvedValue({
      ok: true,
      data: editedMsg,
    });

    const { result } = renderHook(() => useDirectMessages('dm-1'));

    await waitFor(() => {
      expect(result.current.state.status).toBe('ready');
    });

    await act(async () => {
      await result.current.edit('msg-1', 'Updated message');
    });

    if (result.current.state.status === 'ready') {
      expect(result.current.state.messages[0]?.body).toBe('Updated message');
    }
  });

  it('removes a message in-place', async () => {
    fetchDirectMessagesMock.mockResolvedValue({
      ok: true,
      data: {
        messages: [MESSAGE_1],
        pageInfo: { hasMore: false, nextCursor: null },
      },
    });
    const deletedMsg: Message = { ...MESSAGE_1, body: null, deletedAt: new Date() };
    deleteMessageMock.mockResolvedValue({
      ok: true,
      data: deletedMsg,
    });

    const { result } = renderHook(() => useDirectMessages('dm-1'));

    await waitFor(() => {
      expect(result.current.state.status).toBe('ready');
    });

    await act(async () => {
      await result.current.remove('msg-1');
    });

    if (result.current.state.status === 'ready') {
      expect(result.current.state.messages[0]?.body).toBeNull();
    }
  });

  it('loads older messages and prepends them with keyset pagination', async () => {
    fetchDirectMessagesMock
      .mockResolvedValueOnce({
        ok: true,
        data: {
          messages: [MESSAGE_2],
          pageInfo: { hasMore: true, nextCursor: 'cur-1' },
        },
      })
      .mockResolvedValueOnce({
        ok: true,
        data: {
          messages: [MESSAGE_1],
          pageInfo: { hasMore: false, nextCursor: null },
        },
      });

    const { result } = renderHook(() => useDirectMessages('dm-1'));

    await waitFor(() => {
      expect(result.current.state.status).toBe('ready');
    });

    await act(async () => {
      await result.current.loadOlder();
    });

    if (result.current.state.status === 'ready') {
      expect(result.current.state.messages).toEqual([MESSAGE_1, MESSAGE_2]);
      expect(result.current.state.hasMore).toBe(false);
    }
  });

  describe('realtime synchronization', () => {
    it('appends incoming message from message:new event', async () => {
      fetchDirectMessagesMock.mockResolvedValue({
        ok: true,
        data: {
          messages: [MESSAGE_1],
          pageInfo: { hasMore: false, nextCursor: null },
        },
      });

      const { result } = renderHook(() => useDirectMessages('dm-1'));

      await waitFor(() => {
        expect(result.current.state.status).toBe('ready');
      });

      expect(messageNewHandler).not.toBeNull();

      act(() => {
        messageNewHandler!({
          type: 'message:new',
          conversationId: 'dm-1',
          channelId: null,
          message: {
            id: 'msg-2',
            channelId: null,
            directMessageConversationId: 'dm-1',
            authorId: 'u-2',
            body: 'Incoming realtime DM',
            createdAt: '2026-09-08T00:01:00.000Z',
            updatedAt: '2026-09-08T00:01:00.000Z',
            editedAt: null,
            deletedAt: null,
            author: { id: 'u-2', name: 'User Two', image: null },
          },
        });
      });

      if (result.current.state.status === 'ready') {
        expect(result.current.state.messages).toHaveLength(2);
        expect(result.current.state.messages[1]?.body).toBe('Incoming realtime DM');
      }
    });

    it('deduplicates incoming message if already present in state (e.g. sender received REST response first)', async () => {
      fetchDirectMessagesMock.mockResolvedValue({
        ok: true,
        data: {
          messages: [MESSAGE_1, MESSAGE_2],
          pageInfo: { hasMore: false, nextCursor: null },
        },
      });

      const { result } = renderHook(() => useDirectMessages('dm-1'));

      await waitFor(() => {
        expect(result.current.state.status).toBe('ready');
      });

      act(() => {
        messageNewHandler!({
          type: 'message:new',
          conversationId: 'dm-1',
          channelId: null,
          message: {
            id: 'msg-2',
            channelId: null,
            directMessageConversationId: 'dm-1',
            authorId: 'u-2',
            body: 'General Kenobi!',
            createdAt: '2026-09-08T00:01:00.000Z',
            updatedAt: '2026-09-08T00:01:00.000Z',
            editedAt: null,
            deletedAt: null,
            author: { id: 'u-2', name: 'User Two', image: null },
          },
        });
      });

      if (result.current.state.status === 'ready') {
        expect(result.current.state.messages).toHaveLength(2);
      }
    });

    it('ignores thread reply messages in root DM list', async () => {
      fetchDirectMessagesMock.mockResolvedValue({
        ok: true,
        data: {
          messages: [MESSAGE_1],
          pageInfo: { hasMore: false, nextCursor: null },
        },
      });

      const { result } = renderHook(() => useDirectMessages('dm-1'));

      await waitFor(() => {
        expect(result.current.state.status).toBe('ready');
      });

      act(() => {
        messageNewHandler!({
          type: 'message:new',
          conversationId: 'dm-1',
          channelId: null,
          message: {
            id: 'reply-1',
            channelId: null,
            directMessageConversationId: 'dm-1',
            parentMessageId: 'msg-1', // Thread reply!
            authorId: 'u-2',
            body: 'A thread reply to msg-1',
            createdAt: '2026-09-08T00:01:00.000Z',
            updatedAt: '2026-09-08T00:01:00.000Z',
            editedAt: null,
            deletedAt: null,
            author: { id: 'u-2', name: 'User Two', image: null },
          },
        });
      });

      if (result.current.state.status === 'ready') {
        expect(result.current.state.messages).toHaveLength(1);
        expect(result.current.state.messages[0]?.id).toBe('msg-1');
      }
    });

    it('ignores messages belonging to other conversations or channels', async () => {
      fetchDirectMessagesMock.mockResolvedValue({
        ok: true,
        data: {
          messages: [MESSAGE_1],
          pageInfo: { hasMore: false, nextCursor: null },
        },
      });

      const { result } = renderHook(() => useDirectMessages('dm-1'));

      await waitFor(() => {
        expect(result.current.state.status).toBe('ready');
      });

      // Different DM conversation
      act(() => {
        messageNewHandler!({
          type: 'message:new',
          conversationId: 'dm-other',
          channelId: null,
          message: {
            id: 'msg-other',
            channelId: null,
            directMessageConversationId: 'dm-other',
            authorId: 'u-3',
            body: 'Other conversation message',
            createdAt: '2026-09-08T00:01:00.000Z',
            updatedAt: '2026-09-08T00:01:00.000Z',
            editedAt: null,
            deletedAt: null,
            author: { id: 'u-3', name: 'User Three', image: null },
          },
        });
      });

      // Channel message
      act(() => {
        messageNewHandler!({
          type: 'message:new',
          channelId: 'ch-1',
          conversationId: null,
          message: {
            id: 'msg-channel',
            channelId: 'ch-1',
            authorId: 'u-3',
            body: 'Channel message',
            createdAt: '2026-09-08T00:01:00.000Z',
            updatedAt: '2026-09-08T00:01:00.000Z',
            editedAt: null,
            deletedAt: null,
            author: { id: 'u-3', name: 'User Three', image: null },
          },
        });
      });

      if (result.current.state.status === 'ready') {
        expect(result.current.state.messages).toHaveLength(1);
        expect(result.current.state.messages[0]?.id).toBe('msg-1');
      }
    });

    it('updates existing message in-place on message:updated event', async () => {
      fetchDirectMessagesMock.mockResolvedValue({
        ok: true,
        data: {
          messages: [MESSAGE_1],
          pageInfo: { hasMore: false, nextCursor: null },
        },
      });

      const { result } = renderHook(() => useDirectMessages('dm-1'));

      await waitFor(() => {
        expect(result.current.state.status).toBe('ready');
      });

      act(() => {
        messageUpdatedHandler!({
          type: 'message:updated',
          conversationId: 'dm-1',
          channelId: null,
          message: {
            id: 'msg-1',
            channelId: null,
            directMessageConversationId: 'dm-1',
            authorId: 'u-1',
            body: 'Realtime updated body',
            createdAt: '2026-09-08T00:00:00.000Z',
            updatedAt: '2026-09-08T00:02:00.000Z',
            editedAt: '2026-09-08T00:02:00.000Z',
            deletedAt: null,
            author: { id: 'u-1', name: 'User One', image: null },
          },
        });
      });

      if (result.current.state.status === 'ready') {
        expect(result.current.state.messages[0]?.body).toBe('Realtime updated body');
      }
    });

    it('marks message as deleted on message:deleted event', async () => {
      fetchDirectMessagesMock.mockResolvedValue({
        ok: true,
        data: {
          messages: [MESSAGE_1],
          pageInfo: { hasMore: false, nextCursor: null },
        },
      });

      const { result } = renderHook(() => useDirectMessages('dm-1'));

      await waitFor(() => {
        expect(result.current.state.status).toBe('ready');
      });

      act(() => {
        messageDeletedHandler!({
          type: 'message:deleted',
          conversationId: 'dm-1',
          channelId: null,
          messageId: 'msg-1',
          deletedAt: '2026-09-08T00:03:00.000Z',
        });
      });

      if (result.current.state.status === 'ready') {
        expect(result.current.state.messages[0]?.body).toBeNull();
        expect(result.current.state.messages[0]?.deletedAt).toEqual(
          new Date('2026-09-08T00:03:00.000Z'),
        );
      }
    });

    it('re-joins room and fetches missed messages upon reconnect', async () => {
      fetchDirectMessagesMock
        .mockResolvedValueOnce({
          ok: true,
          data: {
            messages: [MESSAGE_1],
            pageInfo: { hasMore: false, nextCursor: null },
          },
        })
        .mockResolvedValueOnce({
          ok: true,
          data: {
            messages: [MESSAGE_2, MESSAGE_1],
            pageInfo: { hasMore: false, nextCursor: null },
          },
        });

      const { result } = renderHook(() => useDirectMessages('dm-1'));

      await waitFor(() => {
        expect(result.current.state.status).toBe('ready');
      });

      expect(result.current.state.status === 'ready' && result.current.state.messages).toHaveLength(
        1,
      );

      // Trigger reconnect
      await act(async () => {
        reconnectHandler!();
      });

      expect(joinRealtimeDirectConversationMock).toHaveBeenCalledTimes(2);
      expect(fetchDirectMessagesMock).toHaveBeenCalledTimes(2);

      if (result.current.state.status === 'ready') {
        expect(result.current.state.messages).toHaveLength(2);
        expect(result.current.state.messages[1]?.id).toBe('msg-2');
      }
    });

    it('repairs missed DM edits and deletes via reconnect recovery', async () => {
      fetchDirectMessagesMock
        .mockResolvedValueOnce({
          ok: true,
          data: {
            messages: [MESSAGE_1],
            pageInfo: { hasMore: false, nextCursor: null },
          },
        })
        .mockResolvedValueOnce({
          ok: true,
          data: {
            messages: [
              {
                ...MESSAGE_1,
                body: 'Hello there (edited while offline)',
                updatedAt: new Date('2026-09-08T00:05:00.000Z'),
                editedAt: new Date('2026-09-08T00:05:00.000Z'),
              },
            ],
            pageInfo: { hasMore: false, nextCursor: null },
          },
        })
        .mockResolvedValueOnce({
          ok: true,
          data: {
            messages: [
              {
                ...MESSAGE_1,
                body: null,
                updatedAt: new Date('2026-09-08T00:07:00.000Z'),
                deletedAt: new Date('2026-09-08T00:07:00.000Z'),
              },
            ],
            pageInfo: { hasMore: false, nextCursor: null },
          },
        });

      const { result } = renderHook(() => useDirectMessages('dm-1'));

      await waitFor(() => {
        expect(result.current.state.status).toBe('ready');
      });

      // Missed edit repaired, no duplicate.
      await act(async () => {
        reconnectHandler!();
      });
      await waitFor(() => {
        if (result.current.state.status !== 'ready') throw new Error('not ready');
        expect(result.current.state.messages).toHaveLength(1);
        expect(result.current.state.messages[0].body).toBe('Hello there (edited while offline)');
      });

      // Missed delete repaired on the next recovery.
      await act(async () => {
        reconnectHandler!();
      });
      await waitFor(() => {
        if (result.current.state.status !== 'ready') throw new Error('not ready');
        expect(result.current.state.messages).toHaveLength(1);
        expect(result.current.state.messages[0].body).toBeNull();
        expect(result.current.state.messages[0].deletedAt).toEqual(
          new Date('2026-09-08T00:07:00.000Z'),
        );
      });
    });

    it('leaves direct conversation and cleans up listeners on unmount or conversation change', async () => {
      fetchDirectMessagesMock.mockResolvedValue({
        ok: true,
        data: {
          messages: [MESSAGE_1],
          pageInfo: { hasMore: false, nextCursor: null },
        },
      });

      const { rerender, unmount } = renderHook(
        ({ convId }: { convId: string | null }) => useDirectMessages(convId),
        {
          initialProps: { convId: 'dm-1' as string | null },
        },
      );

      await waitFor(() => {
        expect(joinRealtimeDirectConversationMock).toHaveBeenCalledWith('dm-1');
      });

      rerender({ convId: 'dm-2' });

      expect(leaveRealtimeDirectConversationMock).toHaveBeenCalledWith('dm-1');
      expect(unsubscribeNew).toHaveBeenCalled();
      expect(unsubscribeUpdated).toHaveBeenCalled();
      expect(unsubscribeDeleted).toHaveBeenCalled();
      expect(unsubscribeReconnect).toHaveBeenCalled();

      unmount();
      expect(leaveRealtimeDirectConversationMock).toHaveBeenCalledWith('dm-2');
    });
  });

  describe('markRead', () => {
    it('calls markDirectConversationRead with messageId and skips duplicate calls for same message', async () => {
      fetchDirectMessagesMock.mockResolvedValue({
        ok: true,
        data: {
          messages: [MESSAGE_1],
          pageInfo: { hasMore: false, nextCursor: null },
        },
      });
      markDirectConversationReadMock.mockResolvedValue({
        ok: true,
        data: {
          conversationId: 'dm-1',
          userId: 'u-1',
          lastReadMessageId: 'msg-1',
          lastReadAt: new Date().toISOString(),
        },
      });

      const { result } = renderHook(() => useDirectMessages('dm-1'));

      await waitFor(() => {
        expect(result.current.state.status).toBe('ready');
      });

      // First call marks read
      let success = false;
      await act(async () => {
        success = await result.current.markRead('msg-1');
      });

      expect(success).toBe(true);
      expect(markDirectConversationReadMock).toHaveBeenCalledTimes(1);
      expect(markDirectConversationReadMock).toHaveBeenCalledWith('http://localhost:4000', 'dm-1', {
        messageId: 'msg-1',
      });

      // Second call with same messageId is a no-op (avoids redundant network traffic)
      await act(async () => {
        success = await result.current.markRead('msg-1');
      });

      expect(success).toBe(true);
      expect(markDirectConversationReadMock).toHaveBeenCalledTimes(1);
    });
  });

  describe('removeAttachment', () => {
    const att = (id: string) => ({
      id,
      messageId: 'msg-1',
      originalName: `${id}.png`,
      mimeType: 'image/png',
      size: 10,
      createdAt: new Date('2026-09-08T00:00:00.000Z'),
    });

    it('removes only the targeted attachment from DM state', async () => {
      fetchDirectMessagesMock.mockResolvedValue({
        ok: true,
        data: {
          messages: [{ ...MESSAGE_1, attachments: [att('a-1'), att('a-2')] }],
          pageInfo: { hasMore: false, nextCursor: null },
        },
      });
      const { result } = renderHook(() => useDirectMessages('dm-1'));
      await waitFor(() => {
        expect(result.current.state.status).toBe('ready');
      });

      act(() => {
        result.current.removeAttachment('msg-1', 'a-1');
      });

      const state = result.current.state;
      if (state.status !== 'ready') throw new Error('not ready');
      expect(state.messages[0].attachments?.map((a) => a.id)).toEqual(['a-2']);
    });

    it('empties the collection when the final attachment is removed', async () => {
      fetchDirectMessagesMock.mockResolvedValue({
        ok: true,
        data: {
          messages: [{ ...MESSAGE_1, attachments: [att('a-1')] }],
          pageInfo: { hasMore: false, nextCursor: null },
        },
      });
      const { result } = renderHook(() => useDirectMessages('dm-1'));
      await waitFor(() => {
        expect(result.current.state.status).toBe('ready');
      });

      act(() => {
        result.current.removeAttachment('msg-1', 'a-1');
      });

      const state = result.current.state;
      if (state.status !== 'ready') throw new Error('not ready');
      expect(state.messages[0].attachments).toEqual([]);
    });
  });

  describe('refresh', () => {
    it('silently merges refetched messages without flipping to loading', async () => {
      fetchDirectMessagesMock.mockResolvedValue({
        ok: true,
        data: {
          messages: [MESSAGE_1],
          pageInfo: { hasMore: false, nextCursor: null },
        },
      });
      const { result } = renderHook(() => useDirectMessages('dm-1'));
      await waitFor(() => {
        expect(result.current.state.status).toBe('ready');
      });

      const withAttachment: Message = {
        ...MESSAGE_1,
        attachments: [
          {
            id: 'a-1',
            messageId: 'msg-1',
            originalName: 'photo.png',
            mimeType: 'image/png',
            size: 10,
            createdAt: new Date('2026-09-08T00:00:00.000Z'),
          },
        ],
      };
      fetchDirectMessagesMock.mockResolvedValue({
        ok: true,
        data: {
          messages: [withAttachment],
          pageInfo: { hasMore: false, nextCursor: null },
        },
      });

      await act(async () => {
        await result.current.refresh();
      });

      expect(result.current.state.status).toBe('ready');
      const state = result.current.state;
      if (state.status !== 'ready') throw new Error('not ready');
      expect(state.messages[0].attachments).toHaveLength(1);
    });
  });
});
