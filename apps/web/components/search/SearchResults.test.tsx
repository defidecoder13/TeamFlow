/**
 * Search result component tests (Phase 4G.4): safe highlighting, per-type
 * rendering, thread badges, and state panels. Asserts behavior, not
 * mere existence.
 */
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import {
  HighlightedSnippet,
  MessageSearchResultItem,
  ChannelSearchResultItem,
  SearchErrorState,
  SearchNoResultsState,
  SearchResultList,
  UserSearchResultItem,
} from './SearchResults';
import type { ChannelSearchResult, MessageSearchResult, UserSearchResult } from '../../lib/search';

function messageResult(overrides: Partial<MessageSearchResult> = {}): MessageSearchResult {
  return {
    id: 'm-1',
    container: {
      kind: 'channel',
      channelId: 'ch-1',
      channelSlug: 'general',
      channelName: 'General',
    },
    author: { id: 'u-1', name: 'Ada Lovelace', image: null },
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

describe('HighlightedSnippet', () => {
  it('wraps matches in mark elements without raw HTML', () => {
    const { container } = render(
      <HighlightedSnippet
        snippet="hello database world"
        matchOffsets={[{ start: 6, length: 8 }]}
      />,
    );
    const marks = container.querySelectorAll('mark');
    expect(marks).toHaveLength(1);
    expect(marks[0].textContent).toBe('database');
    expect(container.innerHTML).not.toContain('<script>');
  });

  it('renders hostile snippet text inertly', () => {
    const { container } = render(
      <HighlightedSnippet
        snippet="<script>alert(1)</script> database"
        matchOffsets={[{ start: 26, length: 8 }]}
      />,
    );
    expect(container.querySelector('mark')?.textContent).toBe('database');
    expect(document.querySelector('script')).toBeNull();
  });

  it('clamps out-of-range offsets instead of crashing', () => {
    const { container } = render(
      <HighlightedSnippet
        snippet="short"
        matchOffsets={[
          { start: 100, length: 5 },
          { start: 0, length: 200 },
        ]}
      />,
    );
    expect(container.textContent).toBe('short');
    expect(container.querySelectorAll('mark')).toHaveLength(1);
  });

  it('merges overlapping offsets into a single highlight', () => {
    const { container } = render(
      <HighlightedSnippet
        snippet="database base"
        matchOffsets={[
          { start: 0, length: 8 },
          { start: 4, length: 8 },
        ]}
      />,
    );
    const marks = container.querySelectorAll('mark');
    expect(marks).toHaveLength(1);
    expect(marks[0].textContent).toBe('database bas');
  });
});

describe('MessageSearchResultItem', () => {
  it('renders author, snippet, location, and opens on click', () => {
    const onOpen = vi.fn();
    render(<MessageSearchResultItem result={messageResult()} onOpen={onOpen} />);
    expect(screen.getByText('Ada Lovelace')).toBeInTheDocument();
    expect(screen.getByText('#General', { exact: false })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button'));
    expect(onOpen).toHaveBeenCalledTimes(1);
  });

  it('marks thread replies distinctly from root messages', () => {
    const onOpen = vi.fn();
    const { rerender } = render(
      <MessageSearchResultItem result={messageResult()} onOpen={onOpen} />,
    );
    expect(screen.queryByText('Reply in thread')).not.toBeInTheDocument();
    rerender(
      <MessageSearchResultItem
        result={messageResult({ parentMessageId: 'root-1', threadRootId: 'root-1' })}
        onOpen={onOpen}
      />,
    );
    expect(screen.getByText('Reply in thread')).toBeInTheDocument();
  });

  it('labels DM locations from peer or group names', () => {
    const onOpen = vi.fn();
    const { rerender } = render(
      <MessageSearchResultItem
        result={messageResult({
          container: {
            kind: 'dm',
            conversationId: 'dm-1',
            conversationName: null,
            peer: { id: 'u-2', name: 'Grace Hopper', image: null },
          },
        })}
        onOpen={onOpen}
      />,
    );
    expect(screen.getByText('Grace Hopper', { exact: false })).toBeInTheDocument();
    rerender(
      <MessageSearchResultItem
        result={messageResult({
          container: {
            kind: 'dm',
            conversationId: 'dm-2',
            conversationName: 'Crew',
            conversationType: 'GROUP',
          },
        })}
        onOpen={onOpen}
      />,
    );
    expect(screen.getByText('Crew', { exact: false })).toBeInTheDocument();
  });
});

describe('directory items', () => {
  it('renders users without actions and channels with navigation', () => {
    const user: UserSearchResult = { id: 'u-9', name: 'Ada Lovelace', image: null, score: 1 };
    render(<UserSearchResultItem result={user} />);
    expect(screen.getByText('Ada Lovelace')).toBeInTheDocument();

    const onOpen = vi.fn();
    const channel: ChannelSearchResult = {
      kind: 'channel',
      id: 'ch-1',
      slug: 'general',
      name: 'General',
      score: 1,
    };
    render(<ChannelSearchResultItem result={channel} onOpen={onOpen} />);
    fireEvent.click(screen.getByRole('button', { name: 'Open #General' }));
    expect(onOpen).toHaveBeenCalledWith(channel);

    const group: ChannelSearchResult = { kind: 'group_dm', id: 'dm-9', name: 'Crew', score: 1 };
    render(<ChannelSearchResultItem result={group} onOpen={onOpen} />);
    expect(screen.getByText('Group message')).toBeInTheDocument();
  });
});

describe('SearchResultList', () => {
  it('dispatches each pool to its renderer', () => {
    const onOpenMessage = vi.fn();
    const onOpenChannel = vi.fn();
    render(
      <SearchResultList
        response={{
          type: 'messages',
          results: [messageResult()],
          pageInfo: { hasMore: false, nextCursor: null },
        }}
        onOpenMessage={onOpenMessage}
        onOpenChannel={onOpenChannel}
      />,
    );
    expect(screen.getByRole('list', { name: 'Search results' })).toBeInTheDocument();
    expect(screen.getByText('Ada Lovelace')).toBeInTheDocument();
  });
});

describe('state panels', () => {
  it('guides no-result searches and retries errors accessibly', () => {
    const { rerender } = render(<SearchNoResultsState hasFilters={true} />);
    expect(screen.getByRole('status')).toHaveTextContent('remove a filter');

    const onRetry = vi.fn();
    rerender(<SearchErrorState message="boom" onRetry={onRetry} />);
    expect(screen.getByRole('alert')).toHaveTextContent('boom');
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });
});
