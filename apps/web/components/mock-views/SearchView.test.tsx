import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SearchFilters, SearchResponse, MessageSearchResult } from '../../lib/search';
import { SearchView } from './SearchView';

const {
  pushMock,
  searchParamsRef,
  searchState,
  searchLoadMoreMock,
  searchRetryMock,
  isLoadingMoreRef,
  loadMoreErrorRef,
} = vi.hoisted(() => ({
  pushMock: vi.fn(),
  searchParamsRef: { value: new URLSearchParams() },
  searchState: { value: { status: 'idle' } as import('../../lib/use-search').SearchState },
  searchLoadMoreMock: vi.fn(),
  searchRetryMock: vi.fn(),
  isLoadingMoreRef: { value: false },
  loadMoreErrorRef: { value: null as string | null },
}));

vi.mock('../../lib/mock-hooks/useRouter', () => ({
  useRouter: () => ({
    push: pushMock,
    pathname: '/app/search',
    searchParams: searchParamsRef.value,
  }),
}));

const shellRef: { value: Record<string, unknown> } = { value: {} };

vi.mock('../../lib/shell-context', () => ({
  useShell: () => shellRef.value,
}));

vi.mock('../../lib/use-search', () => ({
  useSearch: () => ({
    state: searchState.value,
    loadMore: searchLoadMoreMock,
    retry: searchRetryMock,
    isLoadingMore: isLoadingMoreRef.value,
    loadMoreError: loadMoreErrorRef.value,
  }),
}));

function messageResult(id: string, snippet = 'hello database world'): MessageSearchResult {
  return {
    id,
    container: {
      kind: 'channel',
      channelId: 'ch-1',
      channelSlug: 'general',
      channelName: 'General',
    },
    author: { id: 'u-1', name: 'Ada Lovelace', image: null },
    snippet,
    matchOffsets: [{ start: 6, length: 8 }],
    parentMessageId: null,
    replyCount: 0,
    createdAt: new Date('2026-09-06T12:00:00.000Z'),
    updatedAt: new Date('2026-09-06T12:00:00.000Z'),
    score: 0.9,
  };
}

function readyMessages(
  ids: string[],
  pageInfo = { hasMore: false, nextCursor: null as string | null },
): SearchResponse {
  return {
    type: 'messages',
    results: ids.map((id) => messageResult(id)),
    pageInfo,
  };
}

function setQuery(q: string, type: SearchFilters['type'] = 'messages') {
  const params = new URLSearchParams();
  if (q) params.set('q', q);
  if (type !== 'messages') params.set('type', type);
  searchParamsRef.value = params;
}

function setShell(overrides: Record<string, unknown> = {}) {
  shellRef.value = {
    currentWorkspace: { id: 'ws-1', name: 'Acme', slug: 'acme', role: 'OWNER' },
    channels: [
      { id: 'ch-1', name: 'general', slug: 'general', type: 'PUBLIC' },
      { id: 'ch-2', name: 'eng', slug: 'engineering', type: 'PRIVATE' },
    ],
    members: {
      state: {
        status: 'ready',
        members: [
          {
            id: 'm-1',
            role: 'OWNER',
            createdAt: '2026-01-01',
            user: { id: 'u-1', name: 'Ada Lovelace', email: 'ada@example.com', image: null },
          },
        ],
      },
    },
    ...overrides,
  };
}

describe('SearchView', () => {
  beforeEach(() => {
    pushMock.mockReset();
    searchLoadMoreMock.mockReset();
    searchRetryMock.mockReset();
    searchParamsRef.value = new URLSearchParams();
    searchState.value = { status: 'idle' };
    isLoadingMoreRef.value = false;
    loadMoreErrorRef.value = null;
    setShell();
  });

  it('prompts for a query when none is present', () => {
    render(<SearchView />);
    expect(screen.getByText('Search your workspace')).toBeInTheDocument();
    expect(screen.getByText('Enter a search term')).toBeInTheDocument();
  });

  it('shows a no-workspace state when the shell has no current workspace', () => {
    setShell({ currentWorkspace: null });
    render(<SearchView />);
    expect(screen.getByText('No workspace selected')).toBeInTheDocument();
  });

  it('renders ready message results with the query announcer', () => {
    setQuery('database');
    searchState.value = { status: 'ready', response: readyMessages(['m-1', 'm-2']) };
    render(<SearchView />);
    expect(screen.getByText(/2 results found/)).toBeInTheDocument();
    expect(screen.getByRole('list', { name: 'Search results' })).toBeInTheDocument();
    expect(screen.getAllByText('Ada Lovelace').length).toBeGreaterThanOrEqual(1);
  });

  it('shows the loading skeleton while searching', () => {
    setQuery('database');
    searchState.value = { status: 'loading' };
    render(<SearchView />);
    expect(screen.getByRole('status', { name: 'Loading search results' })).toBeInTheDocument();
    expect(screen.getByText('Searching…')).toBeInTheDocument();
  });

  it('shows an error panel with retry', async () => {
    const user = userEvent.setup();
    setQuery('database');
    searchState.value = { status: 'error', message: 'Search failed. Try again.' };
    render(<SearchView />);
    expect(screen.getByRole('alert')).toHaveTextContent('Search failed. Try again.');
    await user.click(screen.getByRole('button', { name: 'Try again' }));
    expect(searchRetryMock).toHaveBeenCalledTimes(1);
  });

  it('maps unauthenticated to an error panel', async () => {
    const user = userEvent.setup();
    setQuery('database');
    searchState.value = { status: 'unauthenticated' };
    render(<SearchView />);
    expect(screen.getByRole('alert')).toHaveTextContent(/session has expired/i);

    await user.click(screen.getByRole('button', { name: /go to sign in/i }));
    expect(pushMock).toHaveBeenCalledWith('/sign-in');
  });

  it('shows the empty-results panel for a successful empty page', () => {
    setQuery('zzzz');
    searchState.value = { status: 'ready', response: readyMessages([]) };
    render(<SearchView />);
    expect(screen.getByText(/No results for/)).toBeInTheDocument();
    expect(screen.getByText('No results found')).toBeInTheDocument();
  });

  it('submits the form and pushes the query into the URL', async () => {
    const user = userEvent.setup();
    render(<SearchView />);
    await user.type(screen.getByRole('searchbox'), 'ship it');
    await user.click(screen.getByRole('button', { name: 'Search' }));
    expect(pushMock).toHaveBeenCalledWith('/app/search?q=ship+it');
  });

  it('pushes type and clears message-only filters when switching pool', async () => {
    const user = userEvent.setup();
    searchParamsRef.value = new URLSearchParams('q=hi&type=messages&in=channel%3Ageneral&from=u-1');
    render(<SearchView />);
    await user.click(screen.getByRole('tab', { name: 'Channels' }));
    expect(pushMock).toHaveBeenCalledWith('/app/search?q=hi&type=channels');
  });

  it('offers channel scopes as in:channel:<slug> values', () => {
    searchParamsRef.value = new URLSearchParams('q=hi&type=messages');
    render(<SearchView />);
    const select = screen.getByLabelText('In:');
    expect(select).toBeInTheDocument();
    expect(screen.getByRole('option', { name: '#general' })).toHaveValue('channel:general');
    expect(screen.getByRole('option', { name: '#eng' })).toHaveValue('channel:engineering');
  });

  it('shows author options from workspace members for message search', () => {
    searchParamsRef.value = new URLSearchParams('q=hi&type=messages');
    render(<SearchView />);
    expect(screen.getByLabelText('From:')).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Ada Lovelace' })).toHaveValue('u-1');
  });

  it('hides message-only filters on the channels pool', () => {
    searchParamsRef.value = new URLSearchParams('q=hi&type=channels');
    render(<SearchView />);
    expect(screen.queryByLabelText('From:')).not.toBeInTheDocument();
    expect(screen.getByText(/filters apply to messages only/i)).toBeInTheDocument();
  });

  it('loads the next cursor page from the button', async () => {
    const user = userEvent.setup();
    setQuery('database');
    searchState.value = {
      status: 'ready',
      response: readyMessages(['m-1'], { hasMore: true, nextCursor: 'cursor-1' }),
    };
    render(<SearchView />);
    await user.click(screen.getByRole('button', { name: 'Load more results' }));
    expect(searchLoadMoreMock).toHaveBeenCalledTimes(1);
  });

  it('surfaces load-more failures without dropping the first page', () => {
    setQuery('database');
    searchState.value = {
      status: 'ready',
      response: readyMessages(['m-1'], { hasMore: true, nextCursor: 'cursor-1' }),
    };
    loadMoreErrorRef.value = 'Oops';
    render(<SearchView />);
    expect(screen.getByRole('alert')).toHaveTextContent('Oops');
    expect(screen.getByRole('list', { name: 'Search results' })).toBeInTheDocument();
  });

  it('navigates a message result to its deep link', async () => {
    const user = userEvent.setup();
    setQuery('database');
    searchState.value = { status: 'ready', response: readyMessages(['m-1']) };
    render(<SearchView />);
    await user.click(screen.getByRole('button', { name: /Message from Ada Lovelace/ }));
    expect(pushMock).toHaveBeenCalledWith('/app/channels/general?message=m-1');
  });
});
