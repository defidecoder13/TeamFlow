'use client';

import type {
  ChannelSearchResult,
  MatchOffset,
  MessageSearchResult,
  SearchResponse,
  UserSearchResult,
} from '../../lib/search';
import { channelSearchResultUrl } from '../../lib/search';
import { UserAvatar } from '../app/UserAvatar';
import { formatMessageTime } from '../app/message-utils';
import { SearchIcon, ThreadsIcon } from '../app/icons';
import { ArrowRight } from 'lucide-react';

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
      <mark key={index} className="rounded bg-[#EEF2FF] px-1 font-medium text-[#3157D5]">
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
        className="flex w-full items-start justify-between gap-4 rounded-[12px] border border-[#E4E2DF] bg-white p-4 text-left shadow-2xs transition-all duration-150 ease-out hover:border-[#D2D0CC] hover:shadow-xs focus-visible:border-[#3157D5] focus-visible:outline-2 focus-visible:outline-[#3157D5] group motion-reduce:transition-none cursor-pointer"
      >
        <div className="flex items-start gap-3 min-w-0">
          <div className="shrink-0 pt-0.5">
            <UserAvatar name={result.author.name} image={result.author.image} size="md" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex min-w-0 items-baseline gap-2 flex-wrap">
              <span
                className="truncate text-[14px] font-semibold text-[#171A21] group-hover:text-[#3157D5] transition-colors"
                title={result.author.name}
              >
                {result.author.name}
              </span>
              <span className="flex min-w-0 shrink items-center gap-1 text-[11px] font-normal tabular-nums text-[#737782]">
                <span className="shrink-0">{formatMessageTime(new Date(result.createdAt))}</span>
                <span aria-hidden="true" className="shrink-0">
                  ·
                </span>
                <LocationLabel result={result} />
              </span>
            </div>
            <p className="mt-1 break-words text-[13px] leading-relaxed text-[#4F5360] whitespace-pre-wrap">
              <HighlightedSnippet snippet={result.snippet} matchOffsets={result.matchOffsets} />
            </p>
            {isReply && (
              <p className="mt-1.5 inline-flex items-center gap-1 text-[11px] font-medium text-[#737782]">
                <ThreadsIcon className="h-3 w-3" aria-hidden="true" />
                <span>Reply in thread</span>
              </p>
            )}
          </div>
        </div>
        <ArrowRight className="w-4 h-4 text-[#737782] group-hover:text-[#3157D5] group-hover:translate-x-0.5 transition-all shrink-0 mt-1" />
      </button>
    </li>
  );
}

export function UserSearchResultItem({ result }: { result: UserSearchResult }) {
  return (
    <li className="flex items-center gap-3 px-4 py-3 rounded-[12px] border border-[#E4E2DF] bg-white shadow-2xs">
      <UserAvatar name={result.name} image={result.image} size="md" />
      <span className="truncate text-[14px] font-medium text-[#171A21]" title={result.name}>
        {result.name}
      </span>
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
  const body = (
    <>
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[8px] bg-[#EEF2FF] text-[13px] font-semibold text-[#3157D5]">
        {result.kind === 'channel' ? '#' : '◈'}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[14px] font-semibold text-[#171A21] group-hover:text-[#3157D5] transition-colors" title={label}>
          {label}
        </span>
        {result.kind === 'group_dm' && (
          <span className="block text-[11px] text-[#737782]">Group message</span>
        )}
      </span>
    </>
  );
  // A channel result without a slug has no safe destination
  // (channelSearchResultUrl returns null). Render it as static content like
  // the intentionally non-navigable user rows — never a dead button.
  if (!channelSearchResultUrl(result)) {
    return (
      <li>
        <div className="flex w-full items-center gap-3 rounded-[12px] border border-[#E4E2DF] bg-white px-4 py-3 shadow-2xs">
          {body}
        </div>
      </li>
    );
  }
  return (
    <li>
      <button
        type="button"
        onClick={() => onOpen(result)}
        aria-label={`Open ${label}`}
        className="flex w-full items-center justify-between gap-3 rounded-[12px] border border-[#E4E2DF] bg-white px-4 py-3 text-left shadow-2xs transition-all duration-150 ease-out hover:border-[#D2D0CC] hover:shadow-xs focus-visible:border-[#3157D5] focus-visible:outline-2 focus-visible:outline-[#3157D5] group motion-reduce:transition-none cursor-pointer"
      >
        <div className="flex items-center gap-3 min-w-0 flex-1">
          {body}
        </div>
        <ArrowRight className="w-4 h-4 text-[#737782] group-hover:text-[#3157D5] group-hover:translate-x-0.5 transition-all shrink-0" />
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
    <ul className="flex flex-col gap-2.5" aria-label="Search results">
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
  // Single announcement via the label; pulse blocks are hidden.
  return (
    <div className="flex flex-col gap-2.5" role="status" aria-label="Loading search results">
      {[0, 1, 2].map((index) => (
        <div
          key={index}
          aria-hidden="true"
          className="flex animate-pulse items-start gap-3 p-4 bg-white border border-[#E4E2DF] rounded-[12px]"
        >
          <div className="h-8 w-8 shrink-0 rounded-full bg-[#ECEAE7]" />
          <div className="flex-1 space-y-2">
            <div className="h-3 w-1/3 rounded bg-[#ECEAE7]" />
            <div className="h-3 w-full rounded bg-[#F6F5F3]" />
          </div>
        </div>
      ))}
    </div>
  );
}

export function SearchEmptyQueryState() {
  return (
    <div className="bg-white border border-[#E4E2DF] rounded-[12px] p-8 text-center space-y-2">
      <div className="w-12 h-12 rounded-full bg-[#F6F5F3] text-[#737782] flex items-center justify-center mx-auto mb-2">
        <SearchIcon className="h-6 w-6" aria-hidden="true" />
      </div>
      <p className="text-[15px] font-semibold text-[#171A21]">Search your workspace</p>
      <p className="max-w-sm mx-auto text-[13px] leading-relaxed text-[#737782]">
        Enter a keyword above to search messages, people, and channels. Use filters to narrow by
        author, conversation, date, or thread.
      </p>
    </div>
  );
}

export function SearchNoResultsState({
  query,
  hasFilters,
  onClear,
}: {
  query: string;
  hasFilters: boolean;
  /** Omitted when there is nothing to clear (e.g. no workspace). */
  onClear?: () => void;
}) {
  return (
    <div
      className="bg-white border border-[#E4E2DF] rounded-[12px] p-8 text-center space-y-3"
      role="status"
    >
      <div className="w-12 h-12 rounded-full bg-[#F6F5F3] text-[#737782] flex items-center justify-center mx-auto">
        <SearchIcon className="h-6 w-6" aria-hidden="true" />
      </div>
      <h2 className="text-[16px] font-semibold text-[#171A21]">
        {query ? (
          <>
            No results for &ldquo;<span className="font-semibold text-[#171A21]">{query}</span>&rdquo;.
          </>
        ) : (
          'No results found.'
        )}
      </h2>
      <p className="max-w-sm mx-auto text-[13px] leading-relaxed text-[#4F5360]">
        Try another keyword, check your spelling
        {hasFilters ? ', or clear the search to broaden it.' : '.'}
      </p>
      {onClear ? (
        <div className="pt-2">
          <button
            type="button"
            onClick={onClear}
            className="px-4 py-2 bg-[#2E3440] text-white text-[13px] font-medium rounded-[8px] hover:bg-[#1E222A] transition-colors shadow-2xs focus-visible:outline-2 focus-visible:outline-[#3157D5]"
          >
            Clear search
          </button>
        </div>
      ) : null}
    </div>
  );
}

export function SearchErrorState({
  message,
  onRetry,
  actionLabel = 'Try again',
}: {
  message: string;
  onRetry: () => void;
  actionLabel?: string;
}) {
  return (
    <div
      className="bg-white border border-red-200 rounded-[12px] p-8 text-center space-y-3"
      role="alert"
    >
      <p className="text-[15px] font-semibold text-red-700">Search failed</p>
      <p className="max-w-sm mx-auto text-[13px] leading-relaxed text-[#4F5360]">{message}</p>
      <button
        type="button"
        onClick={onRetry}
        className="rounded-[8px] bg-[#2E3440] px-4 py-2 text-[13px] font-medium text-white hover:bg-[#1E222A] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#3157D5] active:scale-[0.98] motion-reduce:active:scale-100 shadow-2xs"
      >
        {actionLabel}
      </button>
    </div>
  );
}
