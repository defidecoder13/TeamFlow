import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SessionState } from '../../lib/use-session-user';
import type { DirectConversationState } from '../../lib/use-direct-conversation';
import type { DirectMessagesState } from '../../lib/use-direct-messages';
import type { DirectConversation, Message } from '../../lib/messages';
import { DmView } from './DmView';

const {
  pushMock,
  sessionState,
  conversationState,
  conversationRetryMock,
  setConversationMock,
  messagesState,
  messagesRetryMock,
  messagesSendMock,
  messagesLoadOlderMock,
  messagesRefreshMock,
  messagesMarkReadMock,
  setChannelMembersOpenMock,
  showToastMock,
  markConversationLocallyReadMock,
} = vi.hoisted(() => ({
  pushMock: vi.fn(),
  sessionState: { value: { status: 'loading' } as SessionState },
  conversationState: {
    value: { status: 'loading' } as DirectConversationState,
  },
  conversationRetryMock: vi.fn(),
  setConversationMock: vi.fn(),
  messagesState: {
    value: {
      status: 'ready',
      messages: [],
      hasMore: false,
      nextCursor: null,
    } as DirectMessagesState,
  },
  messagesRetryMock: vi.fn(),
  messagesSendMock: vi.fn().mockResolvedValue({ ok: true, messageId: 'm-new' }),
  messagesLoadOlderMock: vi.fn().mockResolvedValue(undefined),
  messagesRefreshMock: vi.fn().mockResolvedValue(undefined),
  messagesMarkReadMock: vi.fn().mockResolvedValue(true),
  setChannelMembersOpenMock: vi.fn(),
  showToastMock: vi.fn(),
  markConversationLocallyReadMock: vi.fn(),
}));

vi.mock('../../lib/mock-hooks/useRouter', () => ({
  useRouter: () => ({ push: pushMock, pathname: '/app/dms/dm-1' }),
}));

vi.mock('../../lib/mock-context', () => ({
  useApp: () => ({
    setChannelMembersOpen: setChannelMembersOpenMock,
    showToast: showToastMock,
    isChannelMembersOpen: false,
  }),
}));

const shellRef: { value: Record<string, unknown> } = { value: {} };

vi.mock('../../lib/shell-context', () => ({
  useShell: () => shellRef.value,
}));

vi.mock('../../lib/use-direct-conversation', () => ({
  useDirectConversation: () => ({
    state: conversationState.value,
    retry: conversationRetryMock,
    setConversation: setConversationMock,
  }),
}));

vi.mock('../../lib/use-direct-messages', () => ({
  useDirectMessages: () => ({
    state: messagesState.value,
    retry: messagesRetryMock,
    refresh: messagesRefreshMock,
    loadOlder: messagesLoadOlderMock,
    send: messagesSendMock,
    edit: vi.fn().mockResolvedValue({ ok: true }),
    remove: vi.fn().mockResolvedValue({ ok: true }),
    removeAttachment: vi.fn(),
    markRead: messagesMarkReadMock,
    normalizeMessages: vi.fn((msgs) => msgs),
    isLoadingOlder: false,
    loadOlderError: null,
  }),
}));

vi.mock('../../lib/use-typing', () => ({
  useTyping: () => ({
    typingUserIds: [],
    isUserTyping: () => false,
    handleInputChange: vi.fn(),
    handleStopTyping: vi.fn(),
  }),
}));

vi.mock('../../lib/attachments', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../lib/attachments')>()),
  uploadSingleAttachmentDraft: vi.fn().mockResolvedValue({ ok: true }),
  fetchAttachmentDownloadUrl: vi.fn().mockResolvedValue({ ok: true, url: 'https://example.com' }),
}));

vi.mock('../../lib/use-thread-messages', () => ({
  useThreadMessages: () => ({
    state: { status: 'loading' },
    retry: vi.fn(),
    refresh: vi.fn(),
    loadOlder: vi.fn(),
    send: vi.fn().mockResolvedValue({ ok: true }),
    edit: vi.fn().mockResolvedValue({ ok: true }),
    remove: vi.fn().mockResolvedValue({ ok: true }),
    removeAttachment: vi.fn(),
    isLoadingOlder: false,
    loadOlderError: null,
  }),
}));

vi.mock('../../lib/use-message-reactions', () => ({
  useMessageReactions: () => ({
    reactions: [],
    toggleReaction: vi.fn(),
  }),
}));

const USER = {
  id: 'u-1',
  name: 'Ada Lovelace',
  email: 'ada@example.com',
  image: null,
  emailVerified: true,
};

const CONVERSATION: DirectConversation = {
  id: 'dm-1',
  workspaceId: 'ws-1',
  type: 'DIRECT',
  createdAt: new Date('2026-09-08T00:00:00.000Z'),
  updatedAt: new Date('2026-09-08T00:00:00.000Z'),
  participants: [
    { id: 'u-1', name: 'Ada Lovelace', email: 'ada@example.com', image: null },
    { id: 'u-2', name: 'Alan Turing', email: 'alan@example.com', image: null },
  ],
  peer: { id: 'u-2', name: 'Alan Turing', email: 'alan@example.com', image: null },
  participantCount: 2,
};

const GROUP_CONVERSATION: DirectConversation = {
  ...CONVERSATION,
  type: 'GROUP',
  name: 'Ship crew',
  currentUserRole: 'ADMIN',
  participants: [
    { id: 'u-1', name: 'Ada Lovelace', email: 'ada@example.com', image: null },
    { id: 'u-2', name: 'Alan Turing', email: 'alan@example.com', image: null },
    { id: 'u-3', name: 'Grace Hopper', email: 'grace@example.com', image: null },
  ],
  participantCount: 3,
};

function rootMessage(overrides: Partial<Message> = {}): Message {
  return {
    id: 'm-root',
    channelId: null,
    directMessageConversationId: 'dm-1',
    authorId: 'u-2',
    body: 'Hello Ada!',
    parentMessageId: null,
    replyCount: 0,
    latestReplyAt: null,
    createdAt: new Date('2026-09-08T12:00:00.000Z'),
    updatedAt: new Date('2026-09-08T12:00:00.000Z'),
    editedAt: null,
    deletedAt: null,
    author: { id: 'u-2', name: 'Alan Turing', image: null },
    ...overrides,
  };
}

function readyShell(overrides: Record<string, unknown> = {}) {
  return {
    session: { status: 'authenticated' },
    currentUser: USER,
    currentWorkspace: {
      id: 'ws-1',
      name: 'Real Workspace',
      slug: 'real-workspace',
      role: 'OWNER',
      createdAt: '2026-09-06T00:00:00.000Z',
      updatedAt: '2026-09-06T00:00:00.000Z',
    },
    members: {
      state: {
        status: 'ready',
        members: [
          {
            id: 'wm-1',
            role: 'OWNER',
            createdAt: '2026-09-06T00:00:00.000Z',
            user: USER,
          },
          {
            id: 'wm-2',
            role: 'MEMBER',
            createdAt: '2026-09-06T00:00:00.000Z',
            user: {
              id: 'u-2',
              name: 'Alan Turing',
              email: 'alan@example.com',
              image: null,
            },
          },
        ],
      },
      retry: vi.fn(),
    },
    presence: {
      getPresence: (userId: string) => ({
        userId,
        status: userId === 'u-2' ? 'ONLINE' : 'OFFLINE',
        lastSeenAt: null,
      }),
      retry: vi.fn(),
    },
    dmState: {
      state: { status: 'ready', conversations: [] },
      retry: vi.fn(),
      addConversation: vi.fn(),
      markConversationLocallyRead: markConversationLocallyReadMock,
    },
    ...overrides,
  };
}

function authenticateWithConversation(conversation: DirectConversation = CONVERSATION) {
  sessionState.value = { status: 'authenticated', user: USER };
  conversationState.value = { status: 'ready', conversation };
  shellRef.value = readyShell();
}

beforeEach(() => {
  pushMock.mockReset();
  conversationRetryMock.mockReset();
  messagesRetryMock.mockReset();
  messagesSendMock.mockReset();
  messagesSendMock.mockResolvedValue({ ok: true, messageId: 'm-new' });
  messagesLoadOlderMock.mockReset();
  messagesRefreshMock.mockReset();
  messagesMarkReadMock.mockReset();
  messagesMarkReadMock.mockResolvedValue(true);
  setChannelMembersOpenMock.mockReset();
  setConversationMock.mockReset();
  showToastMock.mockReset();
  markConversationLocallyReadMock.mockReset();
  sessionState.value = { status: 'loading' };
  conversationState.value = { status: 'loading' };
  messagesState.value = { status: 'ready', messages: [], hasMore: false, nextCursor: null };
  shellRef.value = readyShell();
});

describe('DmView', () => {
  it('renders peer title and empty conversation from real conversation data', () => {
    authenticateWithConversation();
    render(<DmView conversationId="dm-1" />);

    expect(screen.getByRole('heading', { name: 'Alan Turing' })).toBeInTheDocument();
    expect(screen.getByText(/online/i)).toBeInTheDocument();
    expect(
      screen.getByText(/this is the start of your conversation with alan turing/i),
    ).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/message alan turing/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /view 2 participants/i })).toBeInTheDocument();
    expect(screen.queryByText(/alex chen/i)).not.toBeInTheDocument();
  });

  it('shows loading while the conversation request is pending', () => {
    sessionState.value = { status: 'authenticated', user: USER };
    shellRef.value = readyShell();
    conversationState.value = { status: 'loading' };
    render(<DmView conversationId="dm-1" />);

    expect(
      screen.getByRole('heading', { name: /loading conversation/i }),
    ).toBeInTheDocument();
    expect(screen.queryByText(/conversation not found/i)).not.toBeInTheDocument();
  });

  it('shows not-found with return home after a definitive 404', async () => {
    const user = userEvent.setup();
    sessionState.value = { status: 'authenticated', user: USER };
    shellRef.value = readyShell();
    conversationState.value = { status: 'notFound' };
    render(<DmView conversationId="missing" />);

    expect(
      screen.getByRole('heading', { name: /conversation not found/i }),
    ).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /return to home/i }));
    expect(pushMock).toHaveBeenCalledWith('/app');
  });

  it('offers retry when the conversation fetch fails', async () => {
    const user = userEvent.setup();
    sessionState.value = { status: 'authenticated', user: USER };
    shellRef.value = readyShell();
    conversationState.value = {
      status: 'error',
      message: 'Could not load the conversation.',
    };
    render(<DmView conversationId="dm-1" />);

    expect(screen.getByText('Could not load the conversation.')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /try again/i }));
    expect(conversationRetryMock).toHaveBeenCalledTimes(1);
  });

  it('redirects unauthenticated visitors to sign-in', () => {
    sessionState.value = { status: 'unauthenticated' };
    shellRef.value = readyShell({ session: { status: 'unauthenticated' } });
    render(<DmView conversationId="dm-1" />);

    expect(screen.getByRole('button', { name: /go to sign in/i })).toBeInTheDocument();
  });

  it('opens the participants dialog from the header control', async () => {
    const user = userEvent.setup();
    authenticateWithConversation();
    render(<DmView conversationId="dm-1" />);

    await user.click(screen.getByRole('button', { name: /view 2 participants/i }));
    expect(setChannelMembersOpenMock).toHaveBeenCalledWith(true);
  });

  it('renders group conversation name and participant count', () => {
    authenticateWithConversation(GROUP_CONVERSATION);
    render(<DmView conversationId="dm-1" />);

    expect(screen.getByRole('heading', { name: 'Ship crew' })).toBeInTheDocument();
    expect(screen.getByText(/3 participants/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /view 3 participants/i })).toBeInTheDocument();
  });

  it('filters thread replies out of the root feed', () => {
    authenticateWithConversation();
    messagesState.value = {
      status: 'ready',
      messages: [
        rootMessage({ id: 'm-root', body: 'Root message' }),
        rootMessage({
          id: 'm-reply',
          parentMessageId: 'm-root',
          body: 'Reply body',
          authorId: 'u-1',
          author: { id: 'u-1', name: 'Ada Lovelace', image: null },
        }),
      ],
      hasMore: false,
      nextCursor: null,
    };
    render(<DmView conversationId="dm-1" />);

    expect(screen.getByText('Root message')).toBeInTheDocument();
    expect(screen.queryByText('Reply body')).not.toBeInTheDocument();
  });

  it('marks the latest root message read when messages load', () => {
    authenticateWithConversation();
    messagesState.value = {
      status: 'ready',
      messages: [rootMessage({ id: 'm-latest' })],
      hasMore: false,
      nextCursor: null,
    };
    render(<DmView conversationId="dm-1" />);

    expect(messagesMarkReadMock).toHaveBeenCalledWith('m-latest');
    expect(markConversationLocallyReadMock).toHaveBeenCalledWith('dm-1', 'm-latest');
  });

  it('loads older messages when the feed has more history', async () => {
    const user = userEvent.setup();
    authenticateWithConversation();
    messagesState.value = {
      status: 'ready',
      messages: [rootMessage()],
      hasMore: true,
      nextCursor: 'cursor-1',
    };
    render(<DmView conversationId="dm-1" />);

    await user.click(screen.getByRole('button', { name: /load earlier messages/i }));
    expect(messagesLoadOlderMock).toHaveBeenCalledTimes(1);
  });

  it('sends a message through the composer pipeline', async () => {
    const user = userEvent.setup();
    authenticateWithConversation();
    render(<DmView conversationId="dm-1" />);

    const composer = screen.getByPlaceholderText(/message alan turing/i);
    await user.type(composer, 'Hello Alan{Enter}');

    expect(messagesSendMock).toHaveBeenCalledWith('Hello Alan');
  });

  it('maps messages notFound to a feed error with retry', () => {
    authenticateWithConversation();
    messagesState.value = { status: 'notFound' };
    render(<DmView conversationId="dm-1" />);

    expect(
      screen.getByText(/conversation no longer available/i),
    ).toBeInTheDocument();
  });

  describe('thread deep link (?message=)', () => {
    beforeEach(() => {
      window.history.replaceState(null, '', '/app/dms/dm-1');
    });

    it('opens the thread panel when ?message= points at a DM root with replies', async () => {
      window.history.replaceState(null, '', '/app/dms/dm-1?message=dm-thread-root');
      authenticateWithConversation();
      messagesState.value = {
        status: 'ready',
        messages: [
          {
            id: 'dm-thread-root',
            directMessageConversationId: 'dm-1',
            authorId: 'u-2',
            body: 'DM thread root',
            createdAt: new Date('2026-09-06T12:00:00.000Z'),
            updatedAt: new Date('2026-09-06T12:00:00.000Z'),
            editedAt: null,
            deletedAt: null,
            parentMessageId: null,
            replyCount: 2,
            latestReplyAt: new Date('2026-09-06T12:10:00.000Z'),
            author: { id: 'u-2', name: 'Alan Turing', image: null },
          },
        ],
        hasMore: false,
        nextCursor: null,
      };

      const { container } = render(<DmView conversationId="dm-1" />);

      await waitFor(() => {
        expect(
          container.querySelector('[data-selected-thread-id="dm-thread-root"]'),
        ).toBeInTheDocument();
      });
      expect(new URLSearchParams(window.location.search).get('message')).toBeNull();
    });

    it('does not open the thread panel for a plain DM message', async () => {
      window.history.replaceState(null, '', '/app/dms/dm-1?message=dm-plain');
      authenticateWithConversation();
      messagesState.value = {
        status: 'ready',
        messages: [
          {
            id: 'dm-plain',
            directMessageConversationId: 'dm-1',
            authorId: 'u-1',
            body: 'Plain DM',
            createdAt: new Date('2026-09-06T12:00:00.000Z'),
            updatedAt: new Date('2026-09-06T12:00:00.000Z'),
            editedAt: null,
            deletedAt: null,
            parentMessageId: null,
            replyCount: 0,
            author: { id: 'u-1', name: 'Ada Lovelace', image: null },
          },
        ],
        hasMore: false,
        nextCursor: null,
      };

      const { container } = render(<DmView conversationId="dm-1" />);

      await waitFor(() => {
        expect(new URLSearchParams(window.location.search).get('message')).toBeNull();
      });
      expect(container.querySelector('[data-selected-thread-id]')).toBeNull();
    });
  });
});
