import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SessionState } from '../../../../lib/use-session-user';
import type { WorkspacesState } from '../../../../lib/use-workspaces';
import type { WorkspaceChannelState } from '../../../../lib/use-workspace-channel';
import type { MessagesState } from '../../../../lib/use-messages';
import ChannelPage from './page';

const {
  replaceMock,
  sessionState,
  workspacesState,
  channelState,
  messagesState,
  isLoadingOlderState,
  loadOlderErrorState,
  editMock,
  loadOlderMock,
  removeMock,
  sendMock,
} = vi.hoisted(() => ({
  replaceMock: vi.fn(),
  sessionState: { value: { status: 'loading' } as SessionState },
  workspacesState: { value: { status: 'idle' } as WorkspacesState },
  channelState: { value: { status: 'loading' } as WorkspaceChannelState },
  messagesState: {
    value: { status: 'ready', messages: [], hasMore: false, nextCursor: null } as MessagesState,
  },
  isLoadingOlderState: { value: false },
  loadOlderErrorState: { value: null as string | null },
  editMock: vi.fn().mockResolvedValue({ ok: true }),
  loadOlderMock: vi.fn(),
  removeMock: vi.fn().mockResolvedValue({ ok: true }),
  sendMock: vi.fn().mockResolvedValue({ ok: true }),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: replaceMock, push: vi.fn(), refresh: vi.fn() }),
  useParams: () => ({ slug: 'engineering' }),
  usePathname: () => '/app/channels/engineering',
}));

vi.mock('../../../../lib/use-session-user', () => ({
  useSessionUser: () => sessionState.value,
}));

vi.mock('../../../../lib/use-workspaces', () => ({
  useWorkspaces: () => ({
    state: workspacesState.value,
    retry: vi.fn(),
    addWorkspace: vi.fn(),
  }),
}));

vi.mock('../../../../lib/use-workspace-channel', () => ({
  useWorkspaceChannel: () => ({ state: channelState.value, retry: vi.fn(), setChannel: vi.fn() }),
}));

vi.mock('../../../../lib/use-workspace-channels', () => ({
  useWorkspaceChannels: () => ({
    state: { status: 'ready', channels: [] },
    retry: vi.fn(),
    addChannel: vi.fn(),
    updateChannelState: vi.fn(),
  }),
}));

vi.mock('../../../../lib/auth-client', () => ({
  getAuthClient: () => ({ signOut: vi.fn() }),
}));

vi.mock('../../../../lib/use-messages', () => ({
  useMessages: () => ({
    state: messagesState.value,
    retry: vi.fn(),
    loadOlder: loadOlderMock,
    send: sendMock,
    edit: editMock,
    remove: removeMock,
    normalizeMessages: vi.fn((msgs) => msgs),
    isLoadingOlder: isLoadingOlderState.value,
    loadOlderError: loadOlderErrorState.value,
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
  type: 'PUBLIC' as const,
  createdAt: '2026-09-06T00:00:00.000Z',
  updatedAt: '2026-09-06T00:00:00.000Z',
};

function authenticateWithChannel() {
  sessionState.value = { status: 'authenticated', user: USER };
  workspacesState.value = { status: 'ready', workspaces: [WORKSPACE], current: WORKSPACE };
  channelState.value = { status: 'ready', channel: CHANNEL };
}

beforeEach(() => {
  replaceMock.mockReset();
  window.history.replaceState(null, '', '/app/channels/engineering');
  sendMock.mockReset();
  sendMock.mockResolvedValue({ ok: true });
  editMock.mockReset();
  editMock.mockResolvedValue({ ok: true });
  removeMock.mockReset();
  removeMock.mockResolvedValue({ ok: true });
  loadOlderMock.mockReset();
  sessionState.value = { status: 'loading' };
  workspacesState.value = { status: 'idle' };
  channelState.value = { status: 'loading' };
  messagesState.value = { status: 'ready', messages: [], hasMore: false, nextCursor: null };
  isLoadingOlderState.value = false;
  loadOlderErrorState.value = null;
});

describe('/app/channels/[slug]', () => {
  it('renders channel metadata and the empty conversation state within the application shell', () => {
    authenticateWithChannel();
    render(<ChannelPage />);

    // AppShell chrome
    expect(screen.getByRole('navigation', { name: 'Workspaces' })).toBeInTheDocument();
    expect(screen.getByRole('navigation', { name: 'Primary' })).toBeInTheDocument();
    expect(screen.getByRole('navigation', { name: 'Breadcrumb' })).toBeInTheDocument();
    expect(screen.getAllByText('Real Workspace').length).toBeGreaterThanOrEqual(1);

    // Channel header and conversation
    expect(screen.getByRole('heading', { name: 'Engineering' })).toBeInTheDocument();
    expect(screen.getByText('Public')).toBeInTheDocument();
    expect(screen.getByText('Build things')).toBeInTheDocument();
    expect(screen.getByText(/welcome to engineering/i)).toBeInTheDocument();
    expect(screen.getByText(/start the conversation/i)).toBeInTheDocument();
  });

  it('shows no fake messages, members, or activity', () => {
    authenticateWithChannel();
    render(<ChannelPage />);

    expect(screen.queryByText(/john|acme|10:34 AM|replies/i)).not.toBeInTheDocument();
  });

  it('renders loading state and never renders not-found while channel request is pending', () => {
    sessionState.value = { status: 'authenticated', user: USER };
    workspacesState.value = { status: 'ready', workspaces: [WORKSPACE], current: WORKSPACE };
    channelState.value = { status: 'loading' };
    render(<ChannelPage />);

    expect(screen.getByText(/loading channel/i)).toBeInTheDocument();
    expect(screen.queryByText(/channel not found/i)).not.toBeInTheDocument();
  });

  it('handles inaccessible channels without leaking existence only after definitive not-found', () => {
    sessionState.value = { status: 'authenticated', user: USER };
    workspacesState.value = { status: 'ready', workspaces: [WORKSPACE], current: WORKSPACE };
    channelState.value = { status: 'notFound' };
    render(<ChannelPage />);

    expect(screen.getByText(/channel not found/i)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Return to conversations/i })).toHaveAttribute(
      'href',
      '/app',
    );
    expect(screen.queryByText(/loading channel/i)).not.toBeInTheDocument();
  });

  it('renders no dead channel-management action for owners or members', () => {
    authenticateWithChannel();
    const { unmount } = render(<ChannelPage />);
    expect(screen.queryByText('Edit channel')).not.toBeInTheDocument();
    unmount();

    sessionState.value = { status: 'authenticated', user: USER };
    workspacesState.value = {
      status: 'ready',
      workspaces: [{ ...WORKSPACE, role: 'MEMBER' as const }],
      current: { ...WORKSPACE, role: 'MEMBER' as const },
    };
    channelState.value = { status: 'ready', channel: CHANNEL };
    render(<ChannelPage />);
    expect(screen.queryByText('Edit channel')).not.toBeInTheDocument();
  });

  it('redirects unauthenticated visitors to sign-in', () => {
    sessionState.value = { status: 'unauthenticated' };
    render(<ChannelPage />);

    expect(screen.getByText(/session expired/i)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /sign in/i })).toHaveAttribute('href', '/sign-in');
  });

  it('preserves the route slug for refresh-safe rendering', () => {
    authenticateWithChannel();
    render(<ChannelPage />);

    expect(screen.getByRole('heading', { name: 'Engineering' })).toBeInTheDocument();
    expect(screen.getByText(/welcome to engineering/i)).toBeInTheDocument();
  });

  it('sends a message from the composer on Enter', async () => {
    const user = userEvent.setup();
    authenticateWithChannel();
    render(<ChannelPage />);

    const composer = screen.getByPlaceholderText(/message engineering/i);
    await user.type(composer, 'Hello team{enter}');

    expect(sendMock).toHaveBeenCalledWith('Hello team');
  });

  it('creates a newline on Shift+Enter instead of sending', async () => {
    const user = userEvent.setup();
    authenticateWithChannel();
    render(<ChannelPage />);

    const composer = screen.getByPlaceholderText(/message engineering/i);
    await user.type(composer, 'line one{shift>}{enter}{/shift}line two');

    expect(sendMock).not.toHaveBeenCalled();
    expect((composer as HTMLTextAreaElement).value).toContain('line one');
  });

  it('shows edit and delete actions only on the current user messages', async () => {
    const user = userEvent.setup();
    authenticateWithChannel();
    messagesState.value = {
      status: 'ready',
      messages: [
        {
          id: 'm-own',
          channelId: 'ch-1',
          authorId: 'u-1',
          body: 'My message',
          createdAt: new Date('2026-09-06T12:00:00.000Z'),
          updatedAt: new Date('2026-09-06T12:00:00.000Z'),
          editedAt: null,
          deletedAt: null,
          author: { id: 'u-1', name: 'Ada Lovelace', image: null },
        },
        {
          id: 'm-theirs',
          channelId: 'ch-1',
          authorId: 'u-2',
          body: 'Their message',
          createdAt: new Date('2026-09-06T12:01:00.000Z'),
          updatedAt: new Date('2026-09-06T12:01:00.000Z'),
          editedAt: null,
          deletedAt: null,
          author: { id: 'u-2', name: 'Grace Hopper', image: null },
        },
      ],
      hasMore: false,
      nextCursor: null,
    };
    render(<ChannelPage />);

    expect(screen.getByText('Grace Hopper')).toBeInTheDocument();
    const menus = screen.getAllByRole('button', { name: /message actions/i });
    expect(menus).toHaveLength(1);

    await user.click(menus[0]!);
    await user.click(screen.getByRole('menuitem', { name: 'Edit' }));
    expect(screen.getByDisplayValue('My message')).toBeInTheDocument();

    await user.clear(screen.getByDisplayValue('My message'));
    await user.type(screen.getByPlaceholderText('Edit message…'), 'My message edited');
    await user.click(screen.getByRole('button', { name: /^save$/i }));

    expect(editMock).toHaveBeenCalledWith('m-own', 'My message edited');
  });

  it('deletes an own message from the actions menu', async () => {
    const user = userEvent.setup();
    authenticateWithChannel();
    messagesState.value = {
      status: 'ready',
      messages: [
        {
          id: 'm-own',
          channelId: 'ch-1',
          authorId: 'u-1',
          body: 'My message',
          createdAt: new Date('2026-09-06T12:00:00.000Z'),
          updatedAt: new Date('2026-09-06T12:00:00.000Z'),
          editedAt: null,
          deletedAt: null,
          author: { id: 'u-1', name: 'Ada Lovelace', image: null },
        },
      ],
      hasMore: false,
      nextCursor: null,
    };
    render(<ChannelPage />);

    await user.click(screen.getByRole('button', { name: /message actions/i }));
    await user.click(screen.getByRole('menuitem', { name: 'Delete' }));

    // Clicking Delete must NOT immediately call the API
    expect(removeMock).not.toHaveBeenCalled();
    expect(screen.getByRole('alertdialog', { name: /delete message\?/i })).toBeInTheDocument();

    // Canceling leaves message intact and does not call API
    await user.click(screen.getByRole('button', { name: /cancel/i }));
    expect(removeMock).not.toHaveBeenCalled();
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();

    // Confirming calls the remove API
    await user.click(screen.getByRole('button', { name: /message actions/i }));
    await user.click(screen.getByRole('menuitem', { name: 'Delete' }));
    await user.click(screen.getByRole('button', { name: /^delete$/i }));

    expect(removeMock).toHaveBeenCalledWith('m-own');
  });

  it('loads older messages on demand when more history exists', async () => {
    const user = userEvent.setup();
    authenticateWithChannel();
    messagesState.value = {
      status: 'ready',
      messages: [
        {
          id: 'm-own',
          channelId: 'ch-1',
          authorId: 'u-1',
          body: 'My message',
          createdAt: new Date('2026-09-06T12:00:00.000Z'),
          updatedAt: new Date('2026-09-06T12:00:00.000Z'),
          editedAt: null,
          deletedAt: null,
          author: { id: 'u-1', name: 'Ada Lovelace', image: null },
        },
      ],
      hasMore: true,
      nextCursor: 'cursor-1',
    };
    render(<ChannelPage />);

    await user.click(screen.getByRole('button', { name: /load older messages/i }));
    expect(loadOlderMock).toHaveBeenCalledTimes(1);
  });

  it('renders start-of-conversation banner when all history is loaded', () => {
    authenticateWithChannel();
    messagesState.value = {
      status: 'ready',
      messages: [
        {
          id: 'm-own',
          channelId: 'ch-1',
          authorId: 'u-1',
          body: 'First message ever',
          createdAt: new Date('2026-09-06T12:00:00.000Z'),
          updatedAt: new Date('2026-09-06T12:00:00.000Z'),
          editedAt: null,
          deletedAt: null,
          author: { id: 'u-1', name: 'Ada Lovelace', image: null },
        },
      ],
      hasMore: false,
      nextCursor: null,
    };
    render(<ChannelPage />);

    expect(screen.getByTestId('channel-start-banner')).toBeInTheDocument();
    expect(screen.getByText('Welcome to #Engineering')).toBeInTheDocument();
    expect(screen.getByText('This is the start of the #Engineering channel.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /load older messages/i })).not.toBeInTheDocument();
  });

  it('shows loading spinner when older messages are being fetched', () => {
    authenticateWithChannel();
    messagesState.value = {
      status: 'ready',
      messages: [
        {
          id: 'm-own',
          channelId: 'ch-1',
          authorId: 'u-1',
          body: 'My message',
          createdAt: new Date('2026-09-06T12:00:00.000Z'),
          updatedAt: new Date('2026-09-06T12:00:00.000Z'),
          editedAt: null,
          deletedAt: null,
          author: { id: 'u-1', name: 'Ada Lovelace', image: null },
        },
      ],
      hasMore: true,
      nextCursor: 'cursor-1',
    };
    isLoadingOlderState.value = true;
    render(<ChannelPage />);

    expect(screen.getByText(/loading older messages…/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /load older messages/i })).not.toBeInTheDocument();
  });

  it('shows error and retry button when loading older messages fails', async () => {
    const user = userEvent.setup();
    authenticateWithChannel();
    messagesState.value = {
      status: 'ready',
      messages: [
        {
          id: 'm-own',
          channelId: 'ch-1',
          authorId: 'u-1',
          body: 'My message',
          createdAt: new Date('2026-09-06T12:00:00.000Z'),
          updatedAt: new Date('2026-09-06T12:00:00.000Z'),
          editedAt: null,
          deletedAt: null,
          author: { id: 'u-1', name: 'Ada Lovelace', image: null },
        },
      ],
      hasMore: true,
      nextCursor: 'cursor-1',
    };
    loadOlderErrorState.value = 'Failed to load older messages. Please retry.';
    render(<ChannelPage />);

    expect(screen.getByText('Failed to load older messages. Please retry.')).toBeInTheDocument();
    const retryBtn = screen.getByRole('button', { name: /^retry$/i });
    expect(retryBtn).toBeInTheDocument();

    await user.click(retryBtn);
    expect(loadOlderMock).toHaveBeenCalledTimes(1);
  });

  it('keeps editor open with error message when edit fails', async () => {
    const user = userEvent.setup();
    authenticateWithChannel();
    editMock.mockResolvedValueOnce({ ok: false, error: 'Network error updating message' });

    messagesState.value = {
      status: 'ready',
      messages: [
        {
          id: 'm-own',
          channelId: 'ch-1',
          authorId: 'u-1',
          body: 'Original content',
          createdAt: new Date('2026-09-06T12:00:00.000Z'),
          updatedAt: new Date('2026-09-06T12:00:00.000Z'),
          editedAt: null,
          deletedAt: null,
          author: { id: 'u-1', name: 'Ada Lovelace', image: null },
        },
      ],
      hasMore: false,
      nextCursor: null,
    };
    render(<ChannelPage />);

    await user.click(screen.getByRole('button', { name: /message actions/i }));
    await user.click(screen.getByRole('menuitem', { name: 'Edit' }));

    const textarea = screen.getByPlaceholderText('Edit message…');
    await user.clear(textarea);
    await user.type(textarea, 'Failed edit');
    await user.click(screen.getByRole('button', { name: /^save$/i }));

    expect(editMock).toHaveBeenCalledWith('m-own', 'Failed edit');
    // Editor should still be open
    expect(screen.getByPlaceholderText('Edit message…')).toBeInTheDocument();
    // Error should be visible
    expect(screen.getByText('Network error updating message')).toBeInTheDocument();
  });

  it('displays error in dialog and keeps message intact when delete fails', async () => {
    const user = userEvent.setup();
    authenticateWithChannel();
    removeMock.mockResolvedValueOnce({ ok: false, error: 'Cannot delete right now' });

    messagesState.value = {
      status: 'ready',
      messages: [
        {
          id: 'm-own',
          channelId: 'ch-1',
          authorId: 'u-1',
          body: 'Keep this message',
          createdAt: new Date('2026-09-06T12:00:00.000Z'),
          updatedAt: new Date('2026-09-06T12:00:00.000Z'),
          editedAt: null,
          deletedAt: null,
          author: { id: 'u-1', name: 'Ada Lovelace', image: null },
        },
      ],
      hasMore: false,
      nextCursor: null,
    };
    render(<ChannelPage />);

    await user.click(screen.getByRole('button', { name: /message actions/i }));
    await user.click(screen.getByRole('menuitem', { name: 'Delete' }));
    await user.click(screen.getByRole('button', { name: /^delete$/i }));

    expect(removeMock).toHaveBeenCalledWith('m-own');
    // Dialog should still be open with error
    expect(screen.getByRole('alertdialog')).toBeInTheDocument();
    expect(screen.getByText('Cannot delete right now')).toBeInTheDocument();
    // Original message still visible
    expect(screen.getByText('Keep this message')).toBeInTheDocument();
  });

  describe('Phase 4D.2 - Thread Selection in ChannelPage', () => {
    it('selects thread root message when clicking "Reply in thread" without removing channel messages', async () => {
      const user = userEvent.setup();
      authenticateWithChannel();

      messagesState.value = {
        status: 'ready',
        messages: [
          {
            id: 'm-root-1',
            channelId: 'ch-1',
            authorId: 'u-2',
            body: 'First root message',
            createdAt: new Date('2026-09-06T12:00:00.000Z'),
            updatedAt: new Date('2026-09-06T12:00:00.000Z'),
            editedAt: null,
            deletedAt: null,
            replyCount: 0,
            latestReplyAt: null,
            author: { id: 'u-2', name: 'Grace Hopper', image: null },
          },
          {
            id: 'm-root-2',
            channelId: 'ch-1',
            authorId: 'u-1',
            body: 'Second root message',
            createdAt: new Date('2026-09-06T12:01:00.000Z'),
            updatedAt: new Date('2026-09-06T12:01:00.000Z'),
            editedAt: null,
            deletedAt: null,
            replyCount: 0,
            latestReplyAt: null,
            author: { id: 'u-1', name: 'Ada Lovelace', image: null },
          },
        ],
        hasMore: false,
        nextCursor: null,
      };

      const { container } = render(<ChannelPage />);

      // Initially no thread is selected
      expect(container.querySelector('[data-selected-thread-id]')).toBeNull();

      // Click "Reply in thread" on the first message
      const replyButtons = screen.getAllByRole('button', { name: /reply in thread/i });
      expect(replyButtons).toHaveLength(2);
      await user.click(replyButtons[0]);

      // Thread root is now selected
      expect(container.querySelector('[data-selected-thread-id="m-root-1"]')).toBeInTheDocument();

      // All channel messages are preserved in the list, and ThreadPanel displays the root message
      expect(screen.getAllByText('First root message')).toHaveLength(2);
      expect(screen.getByText('Second root message')).toBeInTheDocument();
      expect(screen.getByRole('region', { name: /thread panel/i })).toBeInTheDocument();
    });

    it('selects thread root message when clicking thread summary', async () => {
      const user = userEvent.setup();
      authenticateWithChannel();

      messagesState.value = {
        status: 'ready',
        messages: [
          {
            id: 'm-thread-root',
            channelId: 'ch-1',
            authorId: 'u-2',
            body: 'Discussion starter',
            createdAt: new Date('2026-09-06T12:00:00.000Z'),
            updatedAt: new Date('2026-09-06T12:00:00.000Z'),
            editedAt: null,
            deletedAt: null,
            replyCount: 3,
            latestReplyAt: new Date('2026-09-06T12:15:00.000Z'),
            author: { id: 'u-2', name: 'Grace Hopper', image: null },
          },
        ],
        hasMore: false,
        nextCursor: null,
      };

      const { container } = render(<ChannelPage />);

      const threadSummaryBtn = screen.getByRole('button', { name: /view thread, 3 replies/i });
      expect(threadSummaryBtn).toBeInTheDocument();

      await user.click(threadSummaryBtn);

      expect(
        container.querySelector('[data-selected-thread-id="m-thread-root"]'),
      ).toBeInTheDocument();
      expect(screen.getAllByText('Discussion starter')).toHaveLength(2);
      expect(screen.getByRole('region', { name: /thread panel/i })).toBeInTheDocument();
    });

    it('closes thread panel when clicking the close button', async () => {
      const user = userEvent.setup();
      authenticateWithChannel();

      messagesState.value = {
        status: 'ready',
        messages: [
          {
            id: 'm-thread-root',
            channelId: 'ch-1',
            authorId: 'u-2',
            body: 'Discussion starter',
            createdAt: new Date('2026-09-06T12:00:00.000Z'),
            updatedAt: new Date('2026-09-06T12:00:00.000Z'),
            editedAt: null,
            deletedAt: null,
            replyCount: 3,
            latestReplyAt: new Date('2026-09-06T12:15:00.000Z'),
            author: { id: 'u-2', name: 'Grace Hopper', image: null },
          },
        ],
        hasMore: false,
        nextCursor: null,
      };

      const { container } = render(<ChannelPage />);

      const threadSummaryBtn = screen.getByRole('button', { name: /view thread, 3 replies/i });
      await user.click(threadSummaryBtn);

      expect(screen.getByRole('region', { name: /thread panel/i })).toBeInTheDocument();

      const closeButton = screen.getByRole('button', { name: /close thread/i });
      await user.click(closeButton);

      expect(screen.queryByRole('region', { name: /thread panel/i })).toBeNull();
      expect(container.querySelector('[data-selected-thread-id]')).toBeNull();
    });
  });

  describe('search deep links', () => {
    const linkedMessages = [
      {
        id: 'm-own',
        channelId: 'ch-1',
        authorId: 'u-1',
        body: 'My message',
        createdAt: new Date('2026-09-06T12:00:00.000Z'),
        updatedAt: new Date('2026-09-06T12:00:00.000Z'),
        editedAt: null,
        deletedAt: null,
        author: { id: 'u-1', name: 'Ada Lovelace', image: null },
      },
      {
        id: 'm-theirs',
        channelId: 'ch-1',
        authorId: 'u-2',
        body: 'Their message',
        createdAt: new Date('2026-09-06T12:01:00.000Z'),
        updatedAt: new Date('2026-09-06T12:01:00.000Z'),
        editedAt: null,
        deletedAt: null,
        author: { id: 'u-2', name: 'Grace Hopper', image: null },
      },
    ];

    function authenticateWithMessages() {
      authenticateWithChannel();
      messagesState.value = {
        status: 'ready',
        messages: linkedMessages,
        hasMore: false,
        nextCursor: null,
      };
    }

    it('highlights a loaded target and consumes the params', async () => {
      authenticateWithMessages();
      window.history.replaceState(null, '', '/app/channels/engineering?message=m-theirs');
      const { container } = render(<ChannelPage />);

      await waitFor(() => {
        const row = container.querySelector('[data-message-id="m-theirs"]');
        expect(row?.className).toContain('ring-amber-300');
      });
      expect(window.location.search).toBe('');
      // The other row stays unhighlighted.
      expect(container.querySelector('[data-message-id="m-own"]')?.className).not.toContain(
        'ring-amber-300',
      );
    });

    it('opens the thread panel for reply links', async () => {
      authenticateWithMessages();
      window.history.replaceState(null, '', '/app/channels/engineering?message=m-own&reply=r-9');
      const { container } = render(<ChannelPage />);

      await waitFor(() => {
        expect(container.querySelector('[data-selected-thread-id="m-own"]')).not.toBeNull();
      });
      expect(window.location.search).toBe('');
    });

    it('fails gracefully for missing targets and consumes the params', async () => {
      authenticateWithMessages();
      window.history.replaceState(null, '', '/app/channels/engineering?message=m-gone');
      const { container } = render(<ChannelPage />);

      await waitFor(() => {
        expect(window.location.search).toBe('');
      });
      expect(container.querySelector('.ring-amber-300')).toBeNull();
      expect(container.querySelector('[data-selected-thread-id]')).toBeNull();
    });

    it('ignores a lone reply param without crashing', async () => {
      authenticateWithMessages();
      window.history.replaceState(null, '', '/app/channels/engineering?reply=r-9');
      const { container } = render(<ChannelPage />);

      await waitFor(() => {
        expect(window.location.search).toBe('');
      });
      expect(container.querySelector('[data-selected-thread-id]')).toBeNull();
    });
  });
});
