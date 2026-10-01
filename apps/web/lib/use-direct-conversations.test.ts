import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useDirectConversations } from './use-direct-conversations';
import type { DirectConversation } from './messages';
import type { RealtimeConversationReadEvent, RealtimeMessageNewEvent } from './realtime-client';

const {
  fetchDirectConversationsMock,
  onRealtimeMessageNewMock,
  onRealtimeConversationReadMock,
  onRealtimeReconnectMock,
  joinRealtimeDirectConversationMock,
  leaveRealtimeDirectConversationMock,
  onRealtimeConversationCreatedMock,
  createdHandlers,
} = vi.hoisted(() => ({
  fetchDirectConversationsMock: vi.fn(),
  onRealtimeMessageNewMock: vi.fn(),
  onRealtimeConversationReadMock: vi.fn(),
  onRealtimeReconnectMock: vi.fn(),
  joinRealtimeDirectConversationMock: vi.fn(),
  leaveRealtimeDirectConversationMock: vi.fn(),
  onRealtimeConversationCreatedMock: vi.fn(),
  createdHandlers: [] as Array<(event: unknown) => void>,
}));

vi.mock('./messages', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./messages')>()),
  fetchDirectConversations: fetchDirectConversationsMock,
}));

vi.mock('./realtime-client', () => ({
  connectRealtime: vi.fn(),
  joinRealtimeDirectConversation: joinRealtimeDirectConversationMock,
  leaveRealtimeDirectConversation: leaveRealtimeDirectConversationMock,
  onRealtimeMessageNew: onRealtimeMessageNewMock,
  onRealtimeConversationRead: onRealtimeConversationReadMock,
  onRealtimeReconnect: onRealtimeReconnectMock,
  onRealtimeConversationCreated: (handler: (event: unknown) => void) => {
    createdHandlers.push(handler);
    return () => {};
  },
  onRealtimeConversationUpdated: vi.fn(() => () => {}),
  onRealtimeParticipantAdded: vi.fn(() => () => {}),
  onRealtimeParticipantRemoved: vi.fn(() => () => {}),
}));

const CONVERSATION_1: DirectConversation = {
  id: 'dm-1',
  workspaceId: 'ws-1',
  type: 'DIRECT',
  createdAt: new Date('2026-09-08T00:00:00.000Z'),
  updatedAt: new Date('2026-09-08T00:00:00.000Z'),
  unreadCount: 0,
  hasUnread: false,
  participants: [
    { id: 'u-1', name: 'User One', email: 'user1@example.com', image: null },
    { id: 'u-2', name: 'User Two', email: 'user2@example.com', image: null },
  ],
  peer: { id: 'u-2', name: 'User Two', email: 'user2@example.com', image: null },
};

const CONVERSATION_2: DirectConversation = {
  id: 'dm-2',
  workspaceId: 'ws-1',
  type: 'DIRECT',
  createdAt: new Date('2026-09-08T01:00:00.000Z'),
  updatedAt: new Date('2026-09-08T01:00:00.000Z'),
  unreadCount: 0,
  hasUnread: false,
  participants: [
    { id: 'u-1', name: 'User One', email: 'user1@example.com', image: null },
    { id: 'u-3', name: 'User Three', email: 'user3@example.com', image: null },
  ],
  peer: { id: 'u-3', name: 'User Three', email: 'user3@example.com', image: null },
};

beforeEach(() => {
  fetchDirectConversationsMock.mockReset();
  onRealtimeMessageNewMock.mockReturnValue(() => {});
  onRealtimeConversationReadMock.mockReturnValue(() => {});
  onRealtimeReconnectMock.mockReturnValue(() => {});
  joinRealtimeDirectConversationMock.mockClear();
  leaveRealtimeDirectConversationMock.mockClear();
  onRealtimeConversationCreatedMock.mockClear();
  createdHandlers.length = 0;
  vi.stubEnv('NEXT_PUBLIC_API_URL', 'http://localhost:4000');
});

describe('useDirectConversations', () => {
  it('stays idle without a workspace', () => {
    const { result } = renderHook(() => useDirectConversations(null));
    expect(result.current.state).toEqual({ status: 'idle' });
    expect(fetchDirectConversationsMock).not.toHaveBeenCalled();
  });

  it('loads conversations, handles addConversation, and retries on failure', async () => {
    fetchDirectConversationsMock.mockResolvedValue({
      ok: true,
      data: {
        conversations: [CONVERSATION_1],
        pageInfo: { hasMore: false, nextCursor: null },
      },
    });

    const { result } = renderHook(() => useDirectConversations('ws-1'));

    await waitFor(() => {
      expect(result.current.state).toEqual({
        status: 'ready',
        conversations: [CONVERSATION_1],
      });
    });

    // Optimistically add another conversation (prepended)
    act(() => {
      result.current.addConversation(CONVERSATION_2);
    });

    expect(result.current.state).toEqual({
      status: 'ready',
      conversations: [CONVERSATION_2, CONVERSATION_1],
    });

    // Test retry on failure
    fetchDirectConversationsMock.mockResolvedValue({
      ok: false,
      unauthenticated: false,
      kind: 'error',
    });

    act(() => {
      result.current.retry();
    });

    await waitFor(() => {
      expect(result.current.state.status).toBe('error');
    });
  });

  it('handles unauthenticated state', async () => {
    fetchDirectConversationsMock.mockResolvedValue({
      ok: false,
      unauthenticated: true,
    });

    const { result } = renderHook(() => useDirectConversations('ws-1'));

    await waitFor(() => {
      expect(result.current.state.status).toBe('unauthenticated');
    });
  });

  it('increments unread count on incoming root message from peer, ignores self and replies', async () => {
    let messageNewHandler: ((ev: RealtimeMessageNewEvent) => void) | null = null;
    onRealtimeMessageNewMock.mockImplementation((handler) => {
      messageNewHandler = handler;
      return () => {};
    });

    fetchDirectConversationsMock.mockResolvedValue({
      ok: true,
      data: {
        conversations: [CONVERSATION_1],
        pageInfo: { hasMore: false, nextCursor: null },
      },
    });

    const { result } = renderHook(() => useDirectConversations('ws-1', 'u-1'));

    await waitFor(() => {
      expect(result.current.state.status).toBe('ready');
    });

    expect(messageNewHandler).not.toBeNull();

    // 1. Message from peer in dm-1 -> increments unread
    act(() => {
      messageNewHandler!({
        type: 'message:new',
        conversationId: 'dm-1',
        message: {
          id: 'msg-peer-1',
          authorId: 'u-2',
          parentMessageId: null,
        },
      });
    });

    if (result.current.state.status === 'ready') {
      expect(result.current.state.conversations[0].unreadCount).toBe(1);
      expect(result.current.state.conversations[0].hasUnread).toBe(true);
    }

    // 2. Message from current user (self) -> does NOT increment unread
    act(() => {
      messageNewHandler!({
        type: 'message:new',
        conversationId: 'dm-1',
        message: {
          id: 'msg-self-1',
          authorId: 'u-1',
          parentMessageId: null,
        },
      });
    });

    if (result.current.state.status === 'ready') {
      expect(result.current.state.conversations[0].unreadCount).toBe(1);
    }

    // 3. Thread reply -> does NOT increment root unread
    act(() => {
      messageNewHandler!({
        type: 'message:new',
        conversationId: 'dm-1',
        message: {
          id: 'msg-reply-1',
          authorId: 'u-2',
          parentMessageId: 'msg-peer-1',
        },
      });
    });

    if (result.current.state.status === 'ready') {
      expect(result.current.state.conversations[0].unreadCount).toBe(1);
    }
  });

  it('resets unread state on conversation:read for current user and through markConversationLocallyRead', async () => {
    let readHandler: ((ev: RealtimeConversationReadEvent) => void) | null = null;
    onRealtimeConversationReadMock.mockImplementation((handler) => {
      readHandler = handler;
      return () => {};
    });

    fetchDirectConversationsMock.mockResolvedValue({
      ok: true,
      data: {
        conversations: [{ ...CONVERSATION_1, unreadCount: 5, hasUnread: true }],
        pageInfo: { hasMore: false, nextCursor: null },
      },
    });

    const { result } = renderHook(() => useDirectConversations('ws-1', 'u-1'));

    await waitFor(() => {
      expect(result.current.state.status).toBe('ready');
    });

    // 1. conversation:read from peer does not clear current user's unread
    act(() => {
      readHandler!({
        type: 'conversation:read',
        conversationId: 'dm-1',
        userId: 'u-2',
        lastReadMessageId: 'msg-1',
        lastReadAt: new Date().toISOString(),
      });
    });

    if (result.current.state.status === 'ready') {
      expect(result.current.state.conversations[0].unreadCount).toBe(5);
    }

    // 2. conversation:read from self clears unread
    act(() => {
      readHandler!({
        type: 'conversation:read',
        conversationId: 'dm-1',
        userId: 'u-1',
        lastReadMessageId: 'msg-1',
        lastReadAt: new Date().toISOString(),
      });
    });

    if (result.current.state.status === 'ready') {
      expect(result.current.state.conversations[0].unreadCount).toBe(0);
      expect(result.current.state.conversations[0].hasUnread).toBe(false);
    }

    // 3. markConversationLocallyRead resets unread locally
    act(() => {
      result.current.markConversationLocallyRead('dm-1', 'msg-latest');
    });

    if (result.current.state.status === 'ready') {
      expect(result.current.state.conversations[0].unreadCount).toBe(0);
      expect(result.current.state.conversations[0].hasUnread).toBe(false);
      expect(result.current.state.conversations[0].lastReadMessageId).toBe('msg-latest');
    }
  });

  it('does not rejoin rooms on unread updates but joins membership changes', async () => {
    let messageNewHandler: ((ev: RealtimeMessageNewEvent) => void) | null = null;
    onRealtimeMessageNewMock.mockImplementation((handler) => {
      messageNewHandler = handler;
      return () => {};
    });

    fetchDirectConversationsMock.mockResolvedValue({
      ok: true,
      data: {
        conversations: [CONVERSATION_1, CONVERSATION_2],
        pageInfo: { hasMore: false, nextCursor: null },
      },
    });

    const { result } = renderHook(() => useDirectConversations('ws-1', 'u-1'));

    await waitFor(() => {
      expect(result.current.state.status).toBe('ready');
    });

    // Initial load joins each room exactly once.
    expect(joinRealtimeDirectConversationMock).toHaveBeenCalledTimes(2);
    expect(joinRealtimeDirectConversationMock).toHaveBeenCalledWith('dm-1');
    expect(joinRealtimeDirectConversationMock).toHaveBeenCalledWith('dm-2');
    joinRealtimeDirectConversationMock.mockClear();

    // Unread increment changes state but not membership: no socket calls.
    act(() => {
      messageNewHandler!({
        type: 'message:new',
        conversationId: 'dm-1',
        message: { id: 'msg-peer-9', authorId: 'u-2', parentMessageId: null },
      });
    });

    if (result.current.state.status === 'ready') {
      expect(result.current.state.conversations[0].unreadCount).toBe(1);
    }
    expect(joinRealtimeDirectConversationMock).not.toHaveBeenCalled();
    expect(leaveRealtimeDirectConversationMock).not.toHaveBeenCalled();

    // Local read-state change is also membership-neutral: no socket calls.
    act(() => {
      result.current.markConversationLocallyRead('dm-1', 'msg-peer-9');
    });
    expect(joinRealtimeDirectConversationMock).not.toHaveBeenCalled();
    expect(leaveRealtimeDirectConversationMock).not.toHaveBeenCalled();

    // Adding a new conversation joins only the new room, exactly once.
    const conversation3: DirectConversation = {
      ...CONVERSATION_2,
      id: 'dm-3',
      peer: { id: 'u-4', name: 'User Four', email: 'user4@example.com', image: null },
    };
    act(() => {
      result.current.addConversation(conversation3);
    });
    expect(joinRealtimeDirectConversationMock).toHaveBeenCalledTimes(1);
    expect(joinRealtimeDirectConversationMock).toHaveBeenCalledWith('dm-3');
  });
});

describe('useDirectConversations conversation:created sync', () => {
  const RAW_NEW = {
    id: 'dm-9',
    workspaceId: 'ws-1',
    type: 'DIRECT',
    name: null,
    createdAt: '2026-09-09T00:00:00.000Z',
    updatedAt: '2026-09-09T00:00:00.000Z',
    participants: [
      {
        id: 'u-1',
        name: 'User One',
        email: 'user1@example.com',
        image: null,
        role: 'MEMBER',
        joinedAt: '2026-09-09T00:00:00.000Z',
      },
      {
        id: 'u-9',
        name: 'User Nine',
        email: 'user9@example.com',
        image: null,
        role: 'MEMBER',
        joinedAt: '2026-09-09T00:00:00.000Z',
      },
    ],
    participant: null,
    peer: {
      id: 'u-9',
      name: 'User Nine',
      email: 'user9@example.com',
      image: null,
    },
    participantCount: 2,
    unreadCount: 0,
    hasUnread: false,
    lastReadMessageId: null,
  };

  async function readyWith(conversations: DirectConversation[]) {
    fetchDirectConversationsMock.mockResolvedValue({
      ok: true,
      data: { conversations, pageInfo: { hasMore: false, nextCursor: null } },
    });
    const { result } = renderHook(() => useDirectConversations('ws-1', 'u-1'));
    await waitFor(() => {
      expect(result.current.state.status).toBe('ready');
    });
    return result;
  }

  function fireCreated(conversation: unknown, workspaceId = 'ws-1') {
    act(() => {
      for (const handler of [...createdHandlers]) {
        handler({ type: 'conversation:created', workspaceId, conversation });
      }
    });
  }

  it('prepends pushed conversations, joins the room, and ignores other workspaces', async () => {
    const result = await readyWith([CONVERSATION_1]);
    fireCreated(RAW_NEW);
    const state = result.current.state;
    if (state.status !== 'ready') throw new Error('not ready');
    expect(state.conversations.map((c) => c.id)).toEqual(['dm-9', 'dm-1']);
    expect(state.conversations[0].peer).toEqual(
      expect.objectContaining({ id: 'u-9', name: 'User Nine' }),
    );
    expect(joinRealtimeDirectConversationMock).toHaveBeenCalledWith('dm-9');

    fireCreated(RAW_NEW, 'ws-9');
    expect(result.current.state).toEqual(state);
  });

  it('dedupes double delivery and REST races by id', async () => {
    const result = await readyWith([CONVERSATION_1]);
    fireCreated(RAW_NEW);
    fireCreated(RAW_NEW);
    act(() => {
      result.current.addConversation({
        ...(result.current.state as { conversations: DirectConversation[] }).conversations[0],
        id: 'dm-9',
      } as DirectConversation);
    });
    const state = result.current.state;
    if (state.status !== 'ready') throw new Error('not ready');
    expect(state.conversations.filter((c) => c.id === 'dm-9')).toHaveLength(1);
  });

  it('drops malformed payloads without touching state', async () => {
    const result = await readyWith([CONVERSATION_1]);
    const before = result.current.state;
    fireCreated({ id: 'dm-x' });
    expect(result.current.state).toBe(before);
  });
});
