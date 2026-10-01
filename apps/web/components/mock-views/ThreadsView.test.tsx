import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SessionState } from '../../lib/use-session-user';
import type { WorkspaceSummary } from '../../lib/workspaces';
import type { ThreadsState } from '../../lib/use-threads';
import type { ThreadListItem } from '../../lib/threads';
import { ThreadsView } from './ThreadsView';

const {
  shellRef,
  pushMock,
  threadsState,
  threadsRetryMock,
  threadsLoadMoreMock,
  isLoadingMoreRef,
  loadMoreErrorRef,
} = vi.hoisted(() => ({
  shellRef: { value: {} as Record<string, unknown> },
  pushMock: vi.fn(),
  threadsState: { value: { status: 'idle' } as ThreadsState },
  threadsRetryMock: vi.fn(),
  threadsLoadMoreMock: vi.fn(),
  isLoadingMoreRef: { value: false },
  loadMoreErrorRef: { value: null as string | null },
}));

vi.mock('../../lib/shell-context', () => ({
  useShell: () => shellRef.value,
}));

vi.mock('../../lib/mock-hooks/useRouter', () => ({
  useRouter: () => ({ push: pushMock, pathname: '/app/threads' }),
}));

vi.mock('../../lib/use-threads', () => ({
  useThreads: () => ({
    state: threadsState.value,
    retry: threadsRetryMock,
    loadMore: threadsLoadMoreMock,
    isLoadingMore: isLoadingMoreRef.value,
    loadMoreError: loadMoreErrorRef.value,
  }),
}));

const USER = {
  id: 'u-1',
  name: 'Ada Lovelace',
  email: 'ada@example.com',
  image: null,
  emailVerified: true,
};

const WORKSPACE: WorkspaceSummary = {
  id: 'ws-1',
  name: 'Acme Flow',
  slug: 'acme-flow',
  role: 'OWNER',
  createdAt: '2026-09-01T00:00:00.000Z',
  updatedAt: '2026-09-01T00:00:00.000Z',
};

function channelThread(overrides: Partial<ThreadListItem> = {}): ThreadListItem {
  return {
    id: 'root-1',
    body: 'Ship the release checklist',
    replyCount: 3,
    createdAt: new Date('2026-09-20T10:00:00.000Z'),
    latestReplyAt: new Date('2026-09-21T12:00:00.000Z'),
    author: { id: 'u-2', name: 'Grace Hopper', email: 'g@example.com', image: null },
    container: { type: 'channel', id: 'ch-1', name: 'general', slug: 'general' },
    latestReply: {
      id: 'reply-9',
      body: 'Almost done with the checklist',
      createdAt: new Date('2026-09-21T12:00:00.000Z'),
      author: { id: 'u-3', name: 'Linus', email: 'l@example.com', image: null },
    },
    ...overrides,
  };
}

function setShell(
  overrides: {
    session?: SessionState;
    currentWorkspace?: WorkspaceSummary | null;
  } = {},
) {
  shellRef.value = {
    session: overrides.session ?? ({ status: 'authenticated' } as SessionState),
    currentWorkspace:
      overrides.currentWorkspace === undefined ? WORKSPACE : overrides.currentWorkspace,
    currentUser: USER,
  };
}

beforeEach(() => {
  pushMock.mockReset();
  threadsRetryMock.mockReset();
  threadsLoadMoreMock.mockReset();
  isLoadingMoreRef.value = false;
  loadMoreErrorRef.value = null;
  threadsState.value = { status: 'loading' };
  setShell();
});

describe('ThreadsView (Audit 11)', () => {
  it('shows a loading status while the session is loading', () => {
    setShell({ session: { status: 'loading' } });
    threadsState.value = { status: 'loading' };
    render(<ThreadsView />);

    expect(screen.getByRole('status')).toHaveTextContent(/loading threads/i);
    expect(screen.queryByText(/no active threads/i)).not.toBeInTheDocument();
  });

  it('asks the user to sign in when unauthenticated and hides the list', async () => {
    const user = userEvent.setup();
    setShell({ session: { status: 'unauthenticated' } });
    threadsState.value = { status: 'unauthenticated' };
    render(<ThreadsView />);

    expect(screen.getByRole('heading', { name: /please sign in/i })).toBeInTheDocument();
    expect(screen.queryByText(/no active threads/i)).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /go to sign in/i }));
    expect(pushMock).toHaveBeenCalledWith('/sign-in');
  });

  it('surfaces the session error message when the session fetch fails', () => {
    setShell({ session: { status: 'error', message: 'Could not load session.' } });
    render(<ThreadsView />);

    expect(screen.getByRole('status')).toHaveTextContent('Could not load session.');
  });

  it('asks for a workspace when none is selected', () => {
    setShell({ currentWorkspace: null });
    threadsState.value = { status: 'idle' };
    render(<ThreadsView />);

    expect(screen.getByRole('status')).toHaveTextContent(/select a workspace/i);
  });

  it('renders the honest empty state when there are no threads', () => {
    threadsState.value = { status: 'ready', threads: [], hasMore: false, nextCursor: null };
    render(<ThreadsView />);

    expect(screen.getByText(/no active threads/i)).toBeInTheDocument();
    expect(screen.getByText(/replies to messages/i)).toBeInTheDocument();
  });

  it('shows a retry action when the threads request fails', async () => {
    const user = userEvent.setup();
    threadsState.value = { status: 'error', message: 'Could not load threads.' };
    render(<ThreadsView />);

    expect(screen.getByText(/couldn.t load threads/i)).toBeInTheDocument();
    expect(screen.getByText('Could not load threads.')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /try again/i }));
    expect(threadsRetryMock).toHaveBeenCalledTimes(1);
  });

  it('renders real thread cards with author, container, reply count, and latest reply', () => {
    threadsState.value = {
      status: 'ready',
      threads: [channelThread()],
      hasMore: false,
      nextCursor: null,
    };
    render(<ThreadsView />);

    expect(screen.getByText('#general')).toBeInTheDocument();
    expect(screen.getByText(/started by grace hopper/i)).toBeInTheDocument();
    expect(screen.getByText(/ship the release checklist/i)).toBeInTheDocument();
    expect(screen.getByText('3 replies')).toBeInTheDocument();
    expect(screen.getByText(/last activity/i)).toBeInTheDocument();
    expect(screen.getByText(/almost done with the checklist/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /open thread in #general/i })).toBeInTheDocument();
    expect(screen.queryByText(/alex chen/i)).not.toBeInTheDocument();
  });

  it('navigates to the channel with a message deep link for channel threads', async () => {
    const user = userEvent.setup();
    threadsState.value = {
      status: 'ready',
      threads: [channelThread()],
      hasMore: false,
      nextCursor: null,
    };
    render(<ThreadsView />);

    await user.click(screen.getByRole('button', { name: /open thread in #general/i }));
    expect(pushMock).toHaveBeenCalledWith('/app/channels/general?message=root-1');
  });

  it('navigates to the conversation with a message deep link for DM threads', async () => {
    const user = userEvent.setup();
    threadsState.value = {
      status: 'ready',
      threads: [
        channelThread({
          id: 'root-dm',
          container: { type: 'directMessage', id: 'dm-9', name: 'Direct message' },
        }),
      ],
      hasMore: false,
      nextCursor: null,
    };
    render(<ThreadsView />);

    await user.click(screen.getByRole('button', { name: /open thread in direct message/i }));
    expect(pushMock).toHaveBeenCalledWith('/app/dms/dm-9?message=root-dm');
  });

  it('opens a channel thread from the keyboard (Enter)', async () => {
    const user = userEvent.setup();
    threadsState.value = {
      status: 'ready',
      threads: [channelThread()],
      hasMore: false,
      nextCursor: null,
    };
    render(<ThreadsView />);

    const card = screen.getByRole('button', { name: /open thread in #general/i });
    card.focus();
    await user.keyboard('{Enter}');
    expect(pushMock).toHaveBeenCalledWith('/app/channels/general?message=root-1');
  });

  it('shows the header count only when threads are ready', () => {
    threadsState.value = { status: 'loading' };
    const { rerender } = render(<ThreadsView />);
    expect(screen.queryByText('1')).not.toBeInTheDocument();

    threadsState.value = {
      status: 'ready',
      threads: [channelThread()],
      hasMore: false,
      nextCursor: null,
    };
    rerender(<ThreadsView />);
    expect(screen.getByText('1')).toBeInTheDocument();
  });

  it('offers Load more with a visible load-more error when hasMore is true', async () => {
    const user = userEvent.setup();
    isLoadingMoreRef.value = false;
    loadMoreErrorRef.value = 'Could not load more threads.';
    threadsState.value = {
      status: 'ready',
      threads: [channelThread()],
      hasMore: true,
      nextCursor: 'cursor-1',
    };
    render(<ThreadsView />);

    expect(screen.getByRole('alert')).toHaveTextContent('Could not load more threads.');
    await user.click(screen.getByRole('button', { name: /load more/i }));
    expect(threadsLoadMoreMock).toHaveBeenCalledTimes(1);
  });

  it('disables Load more while a page is already loading', () => {
    isLoadingMoreRef.value = true;
    threadsState.value = {
      status: 'ready',
      threads: [channelThread()],
      hasMore: true,
      nextCursor: 'cursor-1',
    };
    render(<ThreadsView />);

    expect(screen.getByRole('button', { name: /loading/i })).toBeDisabled();
  });

  it('shows the loading status while threads are fetching', () => {
    threadsState.value = { status: 'loading' };
    render(<ThreadsView />);
    expect(screen.getByRole('status')).toHaveTextContent(/loading threads/i);
  });

  it('asks for sign-in when the threads request returns unauthenticated', async () => {
    const user = userEvent.setup();
    threadsState.value = { status: 'unauthenticated' };
    render(<ThreadsView />);
    expect(screen.getByRole('heading', { name: /please sign in/i })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /go to sign in/i }));
    expect(pushMock).toHaveBeenCalledWith('/sign-in');
  });

  it('renders plural reply label for a single reply', () => {
    threadsState.value = {
      status: 'ready',
      threads: [channelThread({ replyCount: 1 })],
      hasMore: false,
      nextCursor: null,
    };
    render(<ThreadsView />);
    expect(screen.getByText('1 reply')).toBeInTheDocument();
    expect(screen.queryByText(/1 replies/)).not.toBeInTheDocument();
  });

  it('hides empty state once data arrives', async () => {
    threadsState.value = { status: 'loading' };
    const { rerender } = render(<ThreadsView />);
    expect(screen.queryByText(/no active threads/i)).not.toBeInTheDocument();

    threadsState.value = {
      status: 'ready',
      threads: [channelThread()],
      hasMore: false,
      nextCursor: null,
    };
    rerender(<ThreadsView />);
    await waitFor(() =>
      expect(screen.getByText(/ship the release checklist/i)).toBeInTheDocument(),
    );
  });
});
