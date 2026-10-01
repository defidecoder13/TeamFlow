import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SessionState } from '../../lib/use-session-user';
import type { WorkspaceChannelState } from '../../lib/use-workspace-channel';
import type { MessagesState } from '../../lib/use-messages';
import type { ChannelMembersState } from '../../lib/use-channel-members';
import { ChannelView } from './ChannelView';

const {
  pushMock,
  sessionState,
  channelQueryState,
  channelRetryMock,
  setChannelMock,
  messagesState,
  messagesRetryMock,
  messagesSendMock,
  messagesLoadOlderMock,
  membersState,
  setChannelMembersOpenMock,
  showToastMock,
  toggleChannelStarMock,
  toggleChannelMuteMock,
  removeChannelMock,
  updateChannelStateMock,
} = vi.hoisted(() => ({
  pushMock: vi.fn(),
  sessionState: { value: { status: 'loading' } as SessionState },
  channelQueryState: { value: { status: 'loading' } as WorkspaceChannelState },
  channelRetryMock: vi.fn(),
  setChannelMock: vi.fn(),
  messagesState: {
    value: { status: 'ready', messages: [], hasMore: false, nextCursor: null } as MessagesState,
  },
  messagesRetryMock: vi.fn(),
  messagesSendMock: vi.fn().mockResolvedValue({ ok: true, messageId: 'm-new' }),
  messagesLoadOlderMock: vi.fn().mockResolvedValue(undefined),
  membersState: { value: { status: 'idle' } as ChannelMembersState },
  setChannelMembersOpenMock: vi.fn(),
  showToastMock: vi.fn(),
  toggleChannelStarMock: vi.fn().mockResolvedValue(undefined),
  toggleChannelMuteMock: vi.fn().mockResolvedValue(undefined),
  removeChannelMock: vi.fn(),
  updateChannelStateMock: vi.fn(),
}));

vi.mock('../../lib/mock-hooks/useRouter', () => ({
  useRouter: () => ({ push: pushMock, pathname: '/app/channels/engineering' }),
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

vi.mock('../../lib/use-workspace-channel', () => ({
  useWorkspaceChannel: () => ({
    state: channelQueryState.value,
    retry: channelRetryMock,
    setChannel: setChannelMock,
  }),
}));

vi.mock('../../lib/use-messages', () => ({
  useMessages: () => ({
    state: messagesState.value,
    retry: messagesRetryMock,
    refresh: vi.fn(),
    loadOlder: messagesLoadOlderMock,
    send: messagesSendMock,
    edit: vi.fn().mockResolvedValue({ ok: true }),
    remove: vi.fn().mockResolvedValue({ ok: true }),
    removeAttachment: vi.fn(),
    isLoadingOlder: false,
    loadOlderError: null,
  }),
}));

vi.mock('../../lib/use-channel-members', () => ({
  useChannelMembers: () => ({
    state: membersState.value,
    retry: vi.fn(),
    addMember: vi.fn().mockResolvedValue({ ok: true }),
    removeMember: vi.fn().mockResolvedValue({ ok: true }),
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

const WORKSPACE = {
  id: 'ws-1',
  name: 'Real Workspace',
  slug: 'real-workspace',
  role: 'OWNER' as const,
  createdAt: '2026-09-06T00:00:00.000Z',
  updatedAt: '2026-09-06T00:00:00.000Z',
};

const CHANNEL = {
  id: 'ch-1',
  name: 'Engineering',
  slug: 'engineering',
  description: 'Build things',
  topic: 'Shipping',
  type: 'PUBLIC' as const,
  createdById: 'u-1',
  createdAt: '2026-09-06T00:00:00.000Z',
  updatedAt: '2026-09-06T00:00:00.000Z',
};

function readyShell(overrides: Record<string, unknown> = {}) {
  return {
    session: { status: 'authenticated' },
    currentWorkspace: { ...WORKSPACE },
    currentUser: USER,
    channels: [
      {
        ...CHANNEL,
        userState: {
          unreadCount: 0,
          hasUnread: false,
          lastReadMessageId: null,
          isStarred: false,
          isMuted: false,
        },
      },
    ],
    members: { state: { status: 'ready', members: [] }, retry: vi.fn() },
    presence: { getPresence: () => ({ userId: 'x', status: 'OFFLINE', lastSeenAt: null }), retry: vi.fn() },
    channelState: {
      state: { status: 'ready', channels: [] },
      retry: vi.fn(),
      addChannel: vi.fn(),
      updateChannelState: updateChannelStateMock,
      removeChannel: removeChannelMock,
    },
    toggleChannelStar: toggleChannelStarMock,
    toggleChannelMute: toggleChannelMuteMock,
    ...overrides,
  };
}

function authenticateWithChannel() {
  sessionState.value = { status: 'authenticated', user: USER };
  channelQueryState.value = { status: 'ready', channel: CHANNEL };
  shellRef.value = readyShell();
}

beforeEach(() => {
  pushMock.mockReset();
  channelRetryMock.mockReset();
  messagesRetryMock.mockReset();
  messagesSendMock.mockReset();
  messagesSendMock.mockResolvedValue({ ok: true, messageId: 'm-new' });
  messagesLoadOlderMock.mockReset();
  setChannelMembersOpenMock.mockReset();
  showToastMock.mockReset();
  removeChannelMock.mockReset();
  updateChannelStateMock.mockReset();
  toggleChannelStarMock.mockClear();
  sessionState.value = { status: 'loading' };
  channelQueryState.value = { status: 'loading' };
  messagesState.value = { status: 'ready', messages: [], hasMore: false, nextCursor: null };
  membersState.value = { status: 'idle' };
  shellRef.value = readyShell();
});

describe('ChannelView', () => {
  it('renders channel header and empty conversation from real channel data', () => {
    authenticateWithChannel();
    render(<ChannelView slug="engineering" />);

    expect(screen.getByRole('heading', { name: 'Engineering' })).toBeInTheDocument();
    expect(screen.getByText('Shipping')).toBeInTheDocument();
    expect(screen.getByText(/welcome to #?engineering/i)).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/message #engineering/i)).toBeInTheDocument();
    expect(screen.queryByText(/alex chen/i)).not.toBeInTheDocument();
  });

  it('shows loading while the channel request is pending', () => {
    sessionState.value = { status: 'authenticated', user: USER };
    shellRef.value = readyShell();
    channelQueryState.value = { status: 'loading' };
    render(<ChannelView slug="engineering" />);

    expect(screen.getByRole('heading', { name: /loading channel/i })).toBeInTheDocument();
    expect(screen.queryByText(/channel not found/i)).not.toBeInTheDocument();
  });

  it('shows not-found with return home after a definitive 404', async () => {
    const user = userEvent.setup();
    sessionState.value = { status: 'authenticated', user: USER };
    shellRef.value = readyShell();
    channelQueryState.value = { status: 'notFound' };
    render(<ChannelView slug="missing" />);

    expect(screen.getByRole('heading', { name: /channel not found/i })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /return to home/i }));
    expect(pushMock).toHaveBeenCalledWith('/app');
  });

  it('offers retry when the channel fetch fails', async () => {
    const user = userEvent.setup();
    sessionState.value = { status: 'authenticated', user: USER };
    shellRef.value = readyShell();
    channelQueryState.value = { status: 'error', message: 'Could not load the channel.' };
    render(<ChannelView slug="engineering" />);

    expect(screen.getByText('Could not load the channel.')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /try again/i }));
    expect(channelRetryMock).toHaveBeenCalledTimes(1);
  });

  it('opens the members dialog from the header control', async () => {
    const user = userEvent.setup();
    authenticateWithChannel();
    render(<ChannelView slug="engineering" />);

    await user.click(screen.getByRole('button', { name: /view members in #engineering/i }));
    expect(setChannelMembersOpenMock).toHaveBeenCalledWith(true);
  });

  it('shows edit/delete only for owners/creators via the actions menu', async () => {
    const user = userEvent.setup();
    authenticateWithChannel();
    render(<ChannelView slug="engineering" />);

    await user.click(screen.getByRole('button', { name: /channel actions menu/i }));
    expect(screen.getByRole('menuitem', { name: /edit channel/i })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: /delete #engineering/i })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: /leave #engineering/i })).toBeInTheDocument();
  });

  it('hides edit/delete for non-creator members', async () => {
    const user = userEvent.setup();
    sessionState.value = { status: 'authenticated', user: USER };
    channelQueryState.value = {
      status: 'ready',
      channel: { ...CHANNEL, createdById: 'u-9' },
    };
    shellRef.value = readyShell({
      currentWorkspace: { ...WORKSPACE, role: 'MEMBER' },
    });
    render(<ChannelView slug="engineering" />);

    await user.click(screen.getByRole('button', { name: /channel actions menu/i }));
    expect(screen.queryByRole('menuitem', { name: /edit channel/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('menuitem', { name: /delete #engineering/i })).not.toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: /leave #engineering/i })).toBeInTheDocument();
  });

  it('filters replies out of the root feed', () => {
    authenticateWithChannel();
    messagesState.value = {
      status: 'ready',
      messages: [
        {
          id: 'm-root',
          channelId: 'ch-1',
          authorId: 'u-2',
          body: 'Root message',
          createdAt: new Date('2026-09-06T12:00:00.000Z'),
          updatedAt: new Date('2026-09-06T12:00:00.000Z'),
          editedAt: null,
          deletedAt: null,
          parentMessageId: null,
          author: { id: 'u-2', name: 'Grace Hopper', image: null },
        },
        {
          id: 'm-reply',
          channelId: 'ch-1',
          authorId: 'u-1',
          body: 'Reply body',
          createdAt: new Date('2026-09-06T12:01:00.000Z'),
          updatedAt: new Date('2026-09-06T12:01:00.000Z'),
          editedAt: null,
          deletedAt: null,
          parentMessageId: 'm-root',
          author: { id: 'u-1', name: 'Ada Lovelace', image: null },
        },
      ],
      hasMore: false,
      nextCursor: null,
    };
    render(<ChannelView slug="engineering" />);

    expect(screen.getByText('Root message')).toBeInTheDocument();
    expect(screen.queryByText('Reply body')).not.toBeInTheDocument();
  });

  it('loads older messages when the feed has more history', async () => {
    const user = userEvent.setup();
    authenticateWithChannel();
    messagesState.value = {
      status: 'ready',
      messages: [
        {
          id: 'm-1',
          channelId: 'ch-1',
          authorId: 'u-1',
          body: 'Only page',
          createdAt: new Date('2026-09-06T12:00:00.000Z'),
          updatedAt: new Date('2026-09-06T12:00:00.000Z'),
          editedAt: null,
          deletedAt: null,
          parentMessageId: null,
          author: { id: 'u-1', name: 'Ada Lovelace', image: null },
        },
      ],
      hasMore: true,
      nextCursor: 'cursor-1',
    };
    render(<ChannelView slug="engineering" />);

    await user.click(screen.getByRole('button', { name: /load earlier messages/i }));
    expect(messagesLoadOlderMock).toHaveBeenCalledTimes(1);
  });

  it('sends a message through the composer pipeline', async () => {
    const user = userEvent.setup();
    authenticateWithChannel();
    render(<ChannelView slug="engineering" />);

    const composer = screen.getByPlaceholderText(/message #engineering/i);
    await user.type(composer, 'Hello team{Enter}');

    expect(messagesSendMock).toHaveBeenCalledWith('Hello team');
  });

  it('redirects unauthenticated visitors to sign-in', () => {
    sessionState.value = { status: 'unauthenticated' };
    shellRef.value = readyShell({ session: { status: 'unauthenticated' } });
    render(<ChannelView slug="engineering" />);

    const signIn = screen.getByRole('button', { name: /go to sign in/i });
    expect(signIn).toBeInTheDocument();
  });

  describe('thread deep link (?message=)', () => {
    const threadRoot = {
      id: 'm-thread-root',
      channelId: 'ch-1',
      authorId: 'u-2',
      body: 'Threaded root with replies',
      createdAt: new Date('2026-09-06T12:00:00.000Z'),
      updatedAt: new Date('2026-09-06T12:00:00.000Z'),
      editedAt: null,
      deletedAt: null,
      parentMessageId: null,
      replyCount: 3,
      latestReplyAt: new Date('2026-09-06T12:15:00.000Z'),
      author: { id: 'u-2', name: 'Grace Hopper', image: null },
    };

    beforeEach(() => {
      window.history.replaceState(null, '', '/app/channels/engineering');
    });

    it('opens the thread panel when ?message= points at a root with replies', async () => {
      window.history.replaceState(
        null,
        '',
        '/app/channels/engineering?message=m-thread-root',
      );
      authenticateWithChannel();
      messagesState.value = {
        status: 'ready',
        messages: [threadRoot],
        hasMore: false,
        nextCursor: null,
      };

      const { container } = render(<ChannelView slug="engineering" />);

      await waitFor(() => {
        expect(
          container.querySelector('[data-selected-thread-id="m-thread-root"]'),
        ).toBeInTheDocument();
      });
      expect(screen.getByRole('complementary', { name: /thread replies/i })).toBeInTheDocument();
      expect(
        screen.getAllByText('Threaded root with replies').length,
      ).toBeGreaterThanOrEqual(1);
      expect(new URLSearchParams(window.location.search).get('message')).toBeNull();
    });

    it('does not open the thread panel for a plain message without replies', async () => {
      window.history.replaceState(null, '', '/app/channels/engineering?message=m-plain');
      authenticateWithChannel();
      messagesState.value = {
        status: 'ready',
        messages: [
          {
            id: 'm-plain',
            channelId: 'ch-1',
            authorId: 'u-1',
            body: 'No replies here',
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

      const { container } = render(<ChannelView slug="engineering" />);

      await waitFor(() => {
        expect(new URLSearchParams(window.location.search).get('message')).toBeNull();
      });
      expect(container.querySelector('[data-selected-thread-id]')).toBeNull();
      expect(screen.queryByRole('complementary', { name: /thread replies/i })).toBeNull();
    });

    it('pages history when the deep-linked message is not in the first window', async () => {
      window.history.replaceState(
        null,
        '',
        '/app/channels/engineering?message=m-far-thread',
      );
      authenticateWithChannel();
      messagesState.value = {
        status: 'ready',
        messages: [
          {
            id: 'm-near',
            channelId: 'ch-1',
            authorId: 'u-1',
            body: 'Recent message',
            createdAt: new Date('2026-09-06T12:00:00.000Z'),
            updatedAt: new Date('2026-09-06T12:00:00.000Z'),
            editedAt: null,
            deletedAt: null,
            parentMessageId: null,
            replyCount: 0,
            author: { id: 'u-1', name: 'Ada Lovelace', image: null },
          },
        ],
        hasMore: true,
        nextCursor: 'cursor-1',
      };

      render(<ChannelView slug="engineering" />);

      await waitFor(() => {
        expect(messagesLoadOlderMock).toHaveBeenCalled();
      });
    });
  });
});
