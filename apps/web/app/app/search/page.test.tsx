/**
 * Search page tests (Phase 4G.4): URL-driven state, filter commits, result
 * rendering, deep-link navigation, pagination, and state panels. Hooks and
 * navigation are mocked; assertions target behavior.
 */
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SessionUser } from '../../../lib/auth-guard';
import type { SearchState } from '../../../lib/use-search';
import type { MessageSearchResult } from '../../../lib/search';
import SearchPage from './page';

const {
  pushMock,
  replaceMock,
  queryString,
  sessionState,
  workspacesState,
  membersState,
  channelsState,
  conversationsState,
  searchState,
  loadMoreMock,
  retryMock,
  isLoadingMoreState,
  loadMoreErrorState,
} = vi.hoisted(() => ({
  pushMock: vi.fn(),
  replaceMock: vi.fn(),
  queryString: { value: '' },
  sessionState: { value: { status: 'loading' } as { status: string; user?: SessionUser } },
  workspacesState: {
    value: { status: 'idle' } as { status: string; current?: unknown; workspaces?: unknown[] },
  },
  membersState: { value: { status: 'idle' } as { status: string; members?: unknown[] } },
  channelsState: { value: { status: 'idle' } as { status: string; channels?: unknown[] } },
  conversationsState: {
    value: { status: 'idle' } as { status: string; conversations?: unknown[] },
  },
  searchState: { value: { status: 'idle' } as SearchState },
  loadMoreMock: vi.fn(),
  retryMock: vi.fn(),
  isLoadingMoreState: { value: false },
  loadMoreErrorState: { value: null as string | null },
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: pushMock, replace: replaceMock, refresh: vi.fn() }),
  useParams: () => ({}),
  usePathname: () => '/app/search',
  useSearchParams: () => new URLSearchParams(queryString.value),
}));

vi.mock('../../../lib/use-session-user', () => ({
  useSessionUser: () => sessionState.value,
}));

vi.mock('../../../lib/use-workspaces', () => ({
  useWorkspaces: () => ({ state: workspacesState.value, retry: vi.fn(), addWorkspace: vi.fn() }),
}));

vi.mock('../../../lib/use-workspace-members', () => ({
  useWorkspaceMembers: () => ({ state: membersState.value, retry: vi.fn() }),
}));

vi.mock('../../../lib/use-workspace-channels', () => ({
  useWorkspaceChannels: () => ({
    state: channelsState.value,
    retry: vi.fn(),
    addChannel: vi.fn(),
    updateChannelState: vi.fn(),
  }),
}));

vi.mock('../../../lib/use-direct-conversations', () => ({
  useDirectConversations: () => ({
    state: conversationsState.value,
    retry: vi.fn(),
    addConversation: vi.fn(),
    markConversationLocallyRead: vi.fn(),
  }),
}));

vi.mock('../../../lib/use-search', () => ({
  useSearch: () => ({
    state: searchState.value,
    loadMore: loadMoreMock,
    retry: retryMock,
    isLoadingMore: isLoadingMoreState.value,
    loadMoreError: loadMoreErrorState.value,
  }),
}));

vi.mock('../../../lib/auth-client', () => ({
  getAuthClient: () => ({ signOut: vi.fn() }),
}));

const USER: SessionUser = {
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
  role: 'MEMBER' as const,
  createdAt: '2026-09-06T00:00:00.000Z',
  updatedAt: '2026-09-06T00:00:00.000Z',
};

function messageResult(overrides: Partial<MessageSearchResult> = {}): MessageSearchResult {
  return {
    id: 'm-1',
    container: {
      kind: 'channel',
      channelId: 'ch-1',
      channelSlug: 'general',
      channelName: 'General',
    },
    author: { id: 'u-2', name: 'Grace Hopper', image: null },
    snippet: 'hello database world',
    matchOffsets: [{ start: 6, length: 8 }],
    parentMessageId: null,
    replyCount: 0,
    createdAt: new Date('2026-09-06T12:00:00.000Z'),
    updatedAt: new Date('2026-09-06T12:00:00.000Z'),
    score: 0.9,
    ...overrides,
  };
}

function authenticate() {
  sessionState.value = { status: 'authenticated', user: USER };
  workspacesState.value = { status: 'ready', workspaces: [WORKSPACE], current: WORKSPACE };
  membersState.value = {
    status: 'ready',
    members: [{ id: 'mem-1', user: { id: 'u-2', name: 'Grace Hopper', image: null } }],
  };
  channelsState.value = {
    status: 'ready',
    channels: [{ id: 'ch-1', slug: 'general', name: 'General', type: 'PUBLIC' }],
  };
  conversationsState.value = { status: 'ready', conversations: [] };
}

beforeEach(() => {
  pushMock.mockReset();
  replaceMock.mockReset();
  loadMoreMock.mockReset();
  retryMock.mockReset();
  queryString.value = '';
  sessionState.value = { status: 'loading' };
  workspacesState.value = { status: 'idle' };
  membersState.value = { status: 'idle' };
  channelsState.value = { status: 'idle' };
  conversationsState.value = { status: 'idle' };
  searchState.value = { status: 'idle' };
  isLoadingMoreState.value = false;
  loadMoreErrorState.value = null;
});

describe('/app/search', () => {
  it('explains that a query is required when empty', () => {
    authenticate();
    render(<SearchPage />);
    expect(screen.getByText('Search your workspace')).toBeInTheDocument();
    expect(screen.getByLabelText('Search messages, people, and channels')).toBeInTheDocument();
  });

  it('submits the query into the URL on Search', async () => {
    authenticate();
    render(<SearchPage />);
    const input = screen.getByLabelText('Search messages, people, and channels');
    await userEvent.type(input, 'database');
    fireEvent.click(screen.getByRole('button', { name: 'Search' }));
    expect(pushMock).toHaveBeenCalledWith('/app/search?q=database');
  });

  it('treats whitespace-only queries as empty', async () => {
    authenticate();
    render(<SearchPage />);
    const input = screen.getByLabelText('Search messages, people, and channels');
    await userEvent.type(input, '   ');
    fireEvent.click(screen.getByRole('button', { name: 'Search' }));
    expect(pushMock).toHaveBeenCalledWith('/app/search');
  });

  it('reflects the URL query in the input after navigation', () => {
    authenticate();
    queryString.value = 'q=database&thread=only';
    render(<SearchPage />);
    expect(screen.getByLabelText('Search messages, people, and channels')).toHaveValue('database');
  });

  it('renders message results with count and navigates on click', () => {
    authenticate();
    queryString.value = 'q=database';
    searchState.value = {
      status: 'ready',
      response: {
        type: 'messages',
        results: [messageResult()],
        pageInfo: { hasMore: false, nextCursor: null },
      },
    };
    render(<SearchPage />);
    expect(screen.getByText('1 result')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Message from Grace Hopper/ }));
    expect(pushMock).toHaveBeenCalledWith('/app/channels/general?message=m-1');
  });

  it('deep-links thread replies with the root and reply ids', () => {
    authenticate();
    queryString.value = 'q=database&thread=only';
    searchState.value = {
      status: 'ready',
      response: {
        type: 'messages',
        results: [messageResult({ id: 'r-1', parentMessageId: 'root-1', threadRootId: 'root-1' })],
        pageInfo: { hasMore: false, nextCursor: null },
      },
    };
    render(<SearchPage />);
    expect(screen.getByText('Reply in thread')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Thread reply from/ }));
    expect(pushMock).toHaveBeenCalledWith('/app/channels/general?message=root-1&reply=r-1');
  });

  it('deep-links DM results to the conversation', () => {
    authenticate();
    queryString.value = 'q=hello';
    searchState.value = {
      status: 'ready',
      response: {
        type: 'messages',
        results: [
          messageResult({
            container: {
              kind: 'dm',
              conversationId: 'dm-7',
              conversationName: null,
              peer: { id: 'u-2', name: 'Grace Hopper', image: null },
            },
          }),
        ],
        pageInfo: { hasMore: false, nextCursor: null },
      },
    };
    render(<SearchPage />);
    fireEvent.click(screen.getByRole('button', { name: /Message from Grace Hopper/ }));
    expect(pushMock).toHaveBeenCalledWith('/app/dms/dm-7?message=m-1');
  });

  it('commits filter changes to the URL and strips message filters for directory pools', async () => {
    authenticate();
    queryString.value = 'q=database&in=channel%3Ageneral&from=u-2&thread=only';
    render(<SearchPage />);
    fireEvent.click(screen.getByRole('button', { name: 'People' }));
    expect(pushMock).toHaveBeenCalledWith('/app/search?q=database&type=users');
  });

  it('preserves sibling filters when changing one filter', () => {
    authenticate();
    queryString.value =
      'q=database&in=channel%3Ageneral&from=u-2&after=2026-09-01&before=2026-09-09';
    render(<SearchPage />);
    fireEvent.change(screen.getByLabelText('Thread replies'), { target: { value: 'only' } });
    const pushed = pushMock.mock.calls[0][0] as string;
    expect(pushed).toContain('q=database');
    expect(pushed).toContain('in=channel%3Ageneral');
    expect(pushed).toContain('from=u-2');
    expect(pushed).toContain('after=2026-09-01');
    expect(pushed).toContain('before=2026-09-09');
    expect(pushed).toContain('thread=only');
  });

  it('restores state from the URL on back/forward navigation', () => {
    authenticate();
    queryString.value = 'q=database&thread=only';
    const { rerender } = render(<SearchPage />);
    expect(screen.getByLabelText('Search messages, people, and channels')).toHaveValue('database');
    expect(screen.getByLabelText('Thread replies')).toHaveValue('only');

    queryString.value = 'q=hello&from=u-2';
    rerender(<SearchPage />);
    expect(screen.getByLabelText('Search messages, people, and channels')).toHaveValue('hello');
    expect(screen.getByLabelText('Filter by author')).toHaveValue('u-2');
  });

  it('converts date inputs to day-boundary ISO filters', () => {
    authenticate();
    queryString.value = 'q=database';
    const { rerender } = render(<SearchPage />);
    fireEvent.change(screen.getByLabelText('After date'), { target: { value: '2026-09-01' } });
    expect(pushMock).toHaveBeenCalledWith(
      '/app/search?q=database&after=2026-09-01T00%3A00%3A00.000Z',
    );
    // Simulate the navigation the router would perform, then set Before.
    queryString.value = 'q=database&after=2026-09-01T00%3A00%3A00.000Z';
    rerender(<SearchPage />);
    fireEvent.change(screen.getByLabelText('Before date'), { target: { value: '2026-09-09' } });
    expect(pushMock).toHaveBeenCalledWith(
      '/app/search?q=database&after=2026-09-01T00%3A00%3A00.000Z&before=2026-09-09T23%3A59%3A59.999Z',
    );
  });

  it('loads more pages and surfaces load-more errors with retry', () => {
    authenticate();
    queryString.value = 'q=database';
    searchState.value = {
      status: 'ready',
      response: {
        type: 'messages',
        results: [messageResult()],
        pageInfo: { hasMore: true, nextCursor: 'cursor-1' },
      },
    };
    loadMoreErrorState.value = 'Oops';
    render(<SearchPage />);
    expect(screen.getByText('(more available below)', { exact: false })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Load more results' }));
    expect(loadMoreMock).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('alert')).toHaveTextContent('Oops');
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(loadMoreMock).toHaveBeenCalledTimes(2);
  });

  it('shows loading, no-result, and error states with retry', () => {
    authenticate();
    queryString.value = 'q=database';
    searchState.value = { status: 'loading' };
    const { unmount } = render(<SearchPage />);
    expect(screen.getByLabelText('Loading search results')).toBeInTheDocument();
    unmount();

    searchState.value = {
      status: 'ready',
      response: { type: 'messages', results: [], pageInfo: { hasMore: false, nextCursor: null } },
    };
    const second = render(<SearchPage />);
    expect(screen.getByText('No results found')).toBeInTheDocument();
    second.unmount();

    searchState.value = { status: 'error', message: 'Search failed. Try again.' };
    render(<SearchPage />);
    expect(screen.getByRole('alert')).toHaveTextContent('Search failed. Try again.');
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(retryMock).toHaveBeenCalledTimes(1);
  });

  it('redirects unauthenticated visitors to sign-in', () => {
    sessionState.value = { status: 'unauthenticated' };
    render(<SearchPage />);
    expect(replaceMock).toHaveBeenCalledWith('/sign-in');
  });
});
