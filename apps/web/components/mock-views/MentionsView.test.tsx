import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SessionState } from '../../lib/use-session-user';
import type { WorkspaceSummary } from '../../lib/workspaces';
import type { MentionsState } from '../../lib/use-mentions';
import type { MentionListItem } from '../../lib/workspace-mentions';
import { MentionsView } from './MentionsView';

const {
  shellRef,
  pushMock,
  mentionsState,
  mentionsRetryMock,
  mentionsLoadMoreMock,
  isLoadingMoreRef,
  loadMoreErrorRef,
} = vi.hoisted(() => ({
  shellRef: { value: {} as Record<string, unknown> },
  pushMock: vi.fn(),
  mentionsState: { value: { status: 'idle' } as MentionsState },
  mentionsRetryMock: vi.fn(),
  mentionsLoadMoreMock: vi.fn(),
  isLoadingMoreRef: { value: false },
  loadMoreErrorRef: { value: null as string | null },
}));

vi.mock('../../lib/shell-context', () => ({
  useShell: () => shellRef.value,
}));

vi.mock('../../lib/mock-hooks/useRouter', () => ({
  useRouter: () => ({ push: pushMock, pathname: '/app/mentions' }),
}));

vi.mock('../../lib/use-mentions', () => ({
  useMentions: () => ({
    state: mentionsState.value,
    retry: mentionsRetryMock,
    loadMore: mentionsLoadMoreMock,
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

function channelMention(overrides: Partial<MentionListItem> = {}): MentionListItem {
  return {
    id: 'msg-1',
    body: 'Hey @Ada Lovelace can you review the PR?',
    createdAt: new Date('2026-09-21T12:00:00.000Z'),
    parentMessageId: null,
    author: { id: 'u-2', name: 'Grace Hopper', email: 'g@example.com', image: null },
    container: { type: 'channel', id: 'ch-1', name: 'general', slug: 'general' },
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
  mentionsRetryMock.mockReset();
  mentionsLoadMoreMock.mockReset();
  isLoadingMoreRef.value = false;
  loadMoreErrorRef.value = null;
  mentionsState.value = { status: 'loading' };
  setShell();
});

describe('MentionsView (Audit 12)', () => {
  it('shows a loading status while the session is loading', () => {
    setShell({ session: { status: 'loading' } });
    mentionsState.value = { status: 'loading' };
    render(<MentionsView />);

    expect(screen.getByRole('status')).toHaveTextContent(/loading mentions/i);
    expect(screen.queryByText(/no mentions yet/i)).not.toBeInTheDocument();
  });

  it('asks the user to sign in when unauthenticated and hides the list', async () => {
    const user = userEvent.setup();
    setShell({ session: { status: 'unauthenticated' } });
    mentionsState.value = { status: 'unauthenticated' };
    render(<MentionsView />);

    expect(screen.getByRole('heading', { name: /please sign in/i })).toBeInTheDocument();
    expect(screen.queryByText(/no mentions yet/i)).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /go to sign in/i }));
    expect(pushMock).toHaveBeenCalledWith('/sign-in');
  });

  it('surfaces the session error message when the session fetch fails', () => {
    setShell({ session: { status: 'error', message: 'Could not load session.' } });
    render(<MentionsView />);

    expect(screen.getByRole('status')).toHaveTextContent('Could not load session.');
  });

  it('asks for a workspace when none is selected', () => {
    setShell({ currentWorkspace: null });
    mentionsState.value = { status: 'idle' };
    render(<MentionsView />);

    expect(screen.getByRole('status')).toHaveTextContent(/select a workspace/i);
  });

  it('renders the honest empty state with the current user first name', () => {
    mentionsState.value = { status: 'ready', mentions: [], hasMore: false, nextCursor: null };
    render(<MentionsView />);

    expect(screen.getByText(/no mentions yet/i)).toBeInTheDocument();
    expect(screen.getByText(/@ada/i)).toBeInTheDocument();
  });

  it('shows a retry action when the mentions request fails', async () => {
    const user = userEvent.setup();
    mentionsState.value = { status: 'error', message: 'Could not load mentions.' };
    render(<MentionsView />);

    expect(screen.getByText(/couldn.t load mentions/i)).toBeInTheDocument();
    expect(screen.getByText('Could not load mentions.')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /try again/i }));
    expect(mentionsRetryMock).toHaveBeenCalledTimes(1);
  });

  it('renders real mention cards with author, container, body, and thread label', () => {
    mentionsState.value = {
      status: 'ready',
      mentions: [channelMention()],
      hasMore: false,
      nextCursor: null,
    };
    render(<MentionsView />);

    expect(screen.getByText('#general')).toBeInTheDocument();
    expect(screen.getByText('Grace Hopper')).toBeInTheDocument();
    expect(screen.getByText(/can you review the pr/i)).toBeInTheDocument();
    expect(screen.getByText(/in channel feed/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /jump to message in #general/i })).toBeInTheDocument();
    expect(screen.queryByText(/alex chen/i)).not.toBeInTheDocument();
  });

  it('shows thread discussion label when parentMessageId is set', () => {
    mentionsState.value = {
      status: 'ready',
      mentions: [channelMention({ parentMessageId: 'root-9' })],
      hasMore: false,
      nextCursor: null,
    };
    render(<MentionsView />);

    expect(screen.getByText(/in thread discussion/i)).toBeInTheDocument();
    expect(screen.queryByText(/in channel feed/i)).not.toBeInTheDocument();
  });

  it('navigates to the channel with a message deep link for channel mentions', async () => {
    const user = userEvent.setup();
    mentionsState.value = {
      status: 'ready',
      mentions: [channelMention()],
      hasMore: false,
      nextCursor: null,
    };
    render(<MentionsView />);

    await user.click(screen.getByRole('button', { name: /jump to message in #general/i }));
    expect(pushMock).toHaveBeenCalledWith('/app/channels/general?message=msg-1');
  });

  it('navigates to the conversation with a message deep link for DM mentions', async () => {
    const user = userEvent.setup();
    mentionsState.value = {
      status: 'ready',
      mentions: [
        channelMention({
          id: 'msg-dm',
          container: { type: 'directMessage', id: 'dm-9', name: 'Bob' },
        }),
      ],
      hasMore: false,
      nextCursor: null,
    };
    render(<MentionsView />);

    await user.click(screen.getByRole('button', { name: /jump to message in bob/i }));
    expect(pushMock).toHaveBeenCalledWith('/app/dms/dm-9?message=msg-dm');
  });

  it('opens a mention from the keyboard (Enter)', async () => {
    const user = userEvent.setup();
    mentionsState.value = {
      status: 'ready',
      mentions: [channelMention()],
      hasMore: false,
      nextCursor: null,
    };
    render(<MentionsView />);

    const card = screen.getByRole('button', { name: /jump to message in #general/i });
    card.focus();
    await user.keyboard('{Enter}');
    expect(pushMock).toHaveBeenCalledWith('/app/channels/general?message=msg-1');
  });

  it('shows the header count only when mentions are ready', () => {
    mentionsState.value = { status: 'loading' };
    const { rerender } = render(<MentionsView />);
    expect(screen.queryByText('1')).not.toBeInTheDocument();

    mentionsState.value = {
      status: 'ready',
      mentions: [channelMention()],
      hasMore: false,
      nextCursor: null,
    };
    rerender(<MentionsView />);
    expect(screen.getByText('1')).toBeInTheDocument();
  });

  it('offers Load more with a visible load-more error when hasMore is true', async () => {
    const user = userEvent.setup();
    isLoadingMoreRef.value = false;
    loadMoreErrorRef.value = 'Could not load more mentions.';
    mentionsState.value = {
      status: 'ready',
      mentions: [channelMention()],
      hasMore: true,
      nextCursor: 'cursor-1',
    };
    render(<MentionsView />);

    expect(screen.getByRole('alert')).toHaveTextContent('Could not load more mentions.');
    await user.click(screen.getByRole('button', { name: /load more/i }));
    expect(mentionsLoadMoreMock).toHaveBeenCalledTimes(1);
  });

  it('disables Load more while a page is already loading', () => {
    isLoadingMoreRef.value = true;
    mentionsState.value = {
      status: 'ready',
      mentions: [channelMention()],
      hasMore: true,
      nextCursor: 'cursor-1',
    };
    render(<MentionsView />);

    expect(screen.getByRole('button', { name: /loading/i })).toBeDisabled();
  });

  it('shows the loading status while mentions are fetching', () => {
    mentionsState.value = { status: 'loading' };
    render(<MentionsView />);
    expect(screen.getByRole('status')).toHaveTextContent(/loading mentions/i);
  });

  it('asks for sign-in when the mentions request returns unauthenticated', async () => {
    const user = userEvent.setup();
    mentionsState.value = { status: 'unauthenticated' };
    render(<MentionsView />);
    expect(screen.getByRole('heading', { name: /please sign in/i })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /go to sign in/i }));
    expect(pushMock).toHaveBeenCalledWith('/sign-in');
  });

  it('hides empty state once data arrives', async () => {
    mentionsState.value = { status: 'loading' };
    const { rerender } = render(<MentionsView />);
    expect(screen.queryByText(/no mentions yet/i)).not.toBeInTheDocument();

    mentionsState.value = {
      status: 'ready',
      mentions: [channelMention()],
      hasMore: false,
      nextCursor: null,
    };
    rerender(<MentionsView />);
    await waitFor(() =>
      expect(screen.getByText(/can you review the pr/i)).toBeInTheDocument(),
    );
  });
});
