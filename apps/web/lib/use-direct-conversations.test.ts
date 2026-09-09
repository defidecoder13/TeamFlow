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
} = vi.hoisted(() => ({
  fetchDirectConversationsMock: vi.fn(),
  onRealtimeMessageNewMock: vi.fn(),
  onRealtimeConversationReadMock: vi.fn(),
  onRealtimeReconnectMock: vi.fn(),
  joinRealtimeDirectConversationMock: vi.fn(),
  leaveRealtimeDirectConversationMock: vi.fn(),
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
