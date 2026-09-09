'use client';

import type {
  ChannelSearchResult,
  MatchOffset,
  MessageSearchResult,
  SearchResponse,
  UserSearchResult,
} from '../../lib/search';
import { UserAvatar } from '../app/UserAvatar';
import { formatMessageTime } from '../app/message-utils';
import { SearchIcon, ThreadsIcon } from '../app/icons';

/**
 * Safe highlight renderer: matchOffsets are backend-provided UTF-16
 * code-unit ranges into `snippet`. Offsets that fall outside the string or
 * overlap are clamped/skipped defensively — never `dangerouslySetInnerHTML`.
 */
export function HighlightedSnippet({
  snippet,
  matchOffsets,
}: {
  snippet: string;
  matchOffsets: MatchOffset[];
}) {
  const ranges = [...matchOffsets]
    .filter(
      (range) =>
        Number.isInteger(range.start) &&
        Number.isInteger(range.length) &&
        range.start >= 0 &&
        range.length > 0 &&
        range.start < snippet.length,
    )
    .map((range) => ({
      start: range.start,
      end: Math.min(snippet.length, range.start + range.length),
    }))
    .filter((range) => range.end > range.start)
    .sort((a, b) => a.start - b.start);

  const merged: Array<{ start: number; end: number }> = [];
  for (const range of ranges) {
    const last = merged[merged.length - 1];
    if (last && range.start <= last.end) {
      last.end = Math.max(last.end, range.end);
    } else {
      merged.push({ ...range });
    }
  }

  if (merged.length === 0) {
    return <>{snippet}</>;
  }
  const parts: React.ReactNode[] = [];
  let cursor = 0;
  merged.forEach((range, index) => {
    if (range.start > cursor) {
      parts.push(snippet.slice(cursor, range.start));
    }
    parts.push(
      <mark key={index} className="rounded-sm bg-amber-200/70 px-px text-inherit">
        {snippet.slice(range.start, range.end)}
      </mark>,
    );
    cursor = range.end;
  });
  if (cursor < snippet.length) {
    parts.push(snippet.slice(cursor));
  }
  return <>{parts}</>;
}

function LocationLabel({ result }: { result: MessageSearchResult }) {
  const { container } = result;
  if (container.kind === 'channel') {
    return (
      <span className="truncate">
        #{container.channelName ?? container.channelSlug ?? 'channel'}
      </span>
    );
  }
  const label =
    container.conversationType === 'GROUP'
      ? (container.conversationName ?? 'Group message')
      : (container.peer?.name ?? container.conversationName ?? 'Direct message');
  return <span className="truncate">{label}</span>;
}

export function MessageSearchResultItem({
  result,
  onOpen,
}: {
  result: MessageSearchResult;
  onOpen: (result: MessageSearchResult) => void;
}) {
  const isReply = result.parentMessageId !== null;
  return (
    <li>
      <button
        type="button"
        onClick={() => onOpen(result)}
        aria-label={`${isReply ? 'Thread reply' : 'Message'} from ${result.author.name}, ${new Date(result.createdAt).toLocaleString()}`}
        className="flex w-full items-start gap-3 rounded-xl border border-transparent px-3 py-3 text-left transition-colors hover:border-stone-200 hover:bg-stone-50 focus:border-stone-300 focus:bg-stone-50 focus:outline-none"
      >
        <div className="shrink-0 pt-0.5">
          <UserAvatar name={result.author.name} image={result.author.image} size="md" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-baseline gap-2">
            <span className="truncate text-[13px] font-semibold text-stone-900">
              {result.author.name}
            </span>
            <span className="flex min-w-0 shrink items-center gap-1 text-[11px] font-normal text-stone-400">
              <span className="shrink-0">{formatMessageTime(new Date(result.createdAt))}</span>
              <span aria-hidden="true" className="shrink-0">
                ·
              </span>
              <LocationLabel result={result} />
            </span>
          </div>
          <p className="mt-0.5 break-words text-[14px] leading-relaxed text-stone-800 whitespace-pre-wrap">
            <HighlightedSnippet snippet={result.snippet} matchOffsets={result.matchOffsets} />
          </p>
          {isReply && (
            <p className="mt-1 inline-flex items-center gap-1 text-[11px] font-medium text-stone-500">
              <ThreadsIcon className="h-3 w-3" aria-hidden="true" />
              <span>Reply in thread</span>
            </p>
          )}
        </div>
      </button>
    </li>
  );
}

export function UserSearchResultItem({ result }: { result: UserSearchResult }) {
  return (
    <li className="flex items-center gap-3 px-3 py-2.5">
      <UserAvatar name={result.name} image={result.image} size="md" />
      <span className="truncate text-[14px] font-medium text-stone-900">{result.name}</span>
    </li>
  );
}

export function ChannelSearchResultItem({
  result,
  onOpen,
}: {
  result: ChannelSearchResult;
  onOpen: (result: ChannelSearchResult) => void;
}) {
  const label =
    result.kind === 'channel' ? `#${result.name ?? 'channel'}` : (result.name ?? 'Group message');
  return (
    <li>
      <button
        type="button"
        onClick={() => onOpen(result)}
        aria-label={`Open ${label}`}
        className="flex w-full items-center gap-3 rounded-xl border border-transparent px-3 py-2.5 text-left transition-colors hover:border-stone-200 hover:bg-stone-50 focus:border-stone-300 focus:bg-stone-50 focus:outline-none"
      >
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-stone-100 text-[13px] font-semibold text-stone-500">
          {result.kind === 'channel' ? '#' : '◈'}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[14px] font-medium text-stone-900">{label}</span>
          {result.kind === 'group_dm' && (
            <span className="block text-[11px] text-stone-400">Group message</span>
          )}
        </span>
      </button>
    </li>
  );
}

export function SearchResultList({
  response,
  onOpenMessage,
  onOpenChannel,
}: {
  response: SearchResponse;
  onOpenMessage: (result: MessageSearchResult) => void;
  onOpenChannel: (result: ChannelSearchResult) => void;
}) {
  if (response.results.length === 0) {
    return null;
  }
  return (
    <ul className="flex flex-col gap-1" aria-label="Search results">
      {response.type === 'messages' &&
        response.results.map((result) => (
          <MessageSearchResultItem key={result.id} result={result} onOpen={onOpenMessage} />
        ))}
      {response.type === 'users' &&
        response.results.map((result) => <UserSearchResultItem key={result.id} result={result} />)}
      {response.type === 'channels' &&
        response.results.map((result) => (
          <ChannelSearchResultItem key={result.id} result={result} onOpen={onOpenChannel} />
        ))}
    </ul>
  );
}

export function SearchLoadingState() {
  return (
    <div className="flex flex-col gap-2" role="status" aria-label="Loading search results">
      {[0, 1, 2].map((index) => (
        <div key={index} className="flex animate-pulse items-start gap-3 px-3 py-3">
          <div className="h-8 w-8 shrink-0 rounded-full bg-stone-200" />
          <div className="flex-1 space-y-2">
            <div className="h-3 w-1/3 rounded bg-stone-200" />
            <div className="h-3 w-full rounded bg-stone-100" />
          </div>
        </div>
      ))}
      <span className="sr-only">Loading search results…</span>
    </div>
  );
}

export function SearchEmptyQueryState() {
  return (
    <div className="flex min-h-[240px] flex-col items-center justify-center gap-2 px-6 py-12 text-center">
      <SearchIcon className="h-6 w-6 text-stone-300" aria-hidden="true" />
      <p className="text-[14px] font-medium text-stone-700">Search your workspace</p>
      <p className="max-w-sm text-[13px] leading-relaxed text-stone-500">
        Enter a keyword above to search messages, people, and channels. Use filters to narrow by
        author, conversation, date, or thread.
      </p>
    </div>
  );
}

export function SearchNoResultsState({ hasFilters }: { hasFilters: boolean }) {
  return (
    <div
      className="flex min-h-[240px] flex-col items-center justify-center gap-2 px-6 py-12 text-center"
      role="status"
    >
      <p className="text-[14px] font-medium text-stone-700">No results found</p>
      <p className="max-w-sm text-[13px] leading-relaxed text-stone-500">
        Try another keyword, check your spelling
        {hasFilters ? ', or remove a filter to broaden the search.' : '.'}
      </p>
    </div>
  );
}

export function SearchErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div
      className="flex min-h-[240px] flex-col items-center justify-center gap-3 px-6 py-12 text-center"
      role="alert"
    >
      <p className="text-[14px] font-medium text-stone-700">Search failed</p>
      <p className="max-w-sm text-[13px] leading-relaxed text-stone-500">{message}</p>
      <button
        type="button"
        onClick={onRetry}
        className="rounded-lg bg-stone-900 px-4 py-2 text-[13px] font-medium text-white transition-colors hover:bg-stone-700 focus:outline-none focus:ring-2 focus:ring-stone-400"
      >
        Retry
      </button>
    </div>
  );
}
