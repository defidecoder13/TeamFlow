import React, { useMemo, useState } from 'react';
import { useRouter } from '../../lib/mock-hooks/useRouter';
import { useShell } from '../../lib/shell-context';
import { useSearch } from '../../lib/use-search';
import {
  channelSearchResultUrl,
  messageSearchResultUrl,
  parseSearchParams,
  serializeSearchParams,
  type SearchResultType,
  type SearchFilters,
} from '../../lib/search';
import { Search, X, Filter } from 'lucide-react';

import {
  SearchEmptyQueryState,
  SearchErrorState,
  SearchLoadingState,
  SearchResultList,
  SearchNoResultsState,
} from '../search/SearchResults';

const TYPE_TABS: Array<{ id: SearchResultType; label: string }> = [
  { id: 'messages', label: 'Messages' },
  { id: 'channels', label: 'Channels' },
  { id: 'users', label: 'People' },
];

function serializeFilters(filters: SearchFilters): string {
  const qs = serializeSearchParams(filters);
  return qs ? `/app/search?${qs}` : '/app/search';
}

export const SearchView: React.FC = () => {
  const shell = useShell();
  const { searchParams, push } = useRouter();

  const filters = useMemo(() => parseSearchParams(searchParams), [searchParams]);
  const query = filters.q;
  const workspaceId = shell.currentWorkspace?.id ?? null;

  const channels = shell.channels;
  const memberOptions =
    shell.members.state.status === 'ready' ? shell.members.state.members : [];

  const [inputVal, setInputVal] = useState(query);

  const { state, loadMore, retry, isLoadingMore, loadMoreError } = useSearch(workspaceId, filters);

  const updateFilters = (patch: Partial<SearchFilters>) => {
    push(serializeFilters({ ...filters, ...patch }));
  };

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    updateFilters({ q: inputVal.trim() });
  };

  const handleClearSearch = () => {
    setInputVal('');
    push(serializeFilters({ ...filters, q: '' }));
  };

  const handleResetFilters = () => {
    updateFilters({ in: undefined, from: undefined });
  };

  const hasQuery = query.trim().length > 0;
  const resultCount = state.status === 'ready' ? state.response.results.length : 0;
  const hasMore =
    state.status === 'ready' && state.response.pageInfo.hasMore && Boolean(state.response.pageInfo.nextCursor);
  const activeFilters = Boolean(filters.in || filters.from);

  return (
    <main id="main-content" className="flex-1 overflow-y-auto bg-[#FAF9F8] p-4 sm:p-8">
      <div className="max-w-4xl mx-auto space-y-6">
        {/* Search header & input */}
        <div className="space-y-4">
          <h1 className="text-[26px] font-semibold text-[#171A21] tracking-tight">Search</h1>

          <form onSubmit={handleSearchSubmit} className="relative">
            <Search className="w-4 h-4 text-[#737782] absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="search"
              value={inputVal}
              onChange={(e) => setInputVal(e.target.value)}
              placeholder="Search across messages, channels, or teammates..."
              className="w-full pl-10 pr-24 py-2.5 text-[14px] bg-white border border-[#E4E2DF] hover:border-[#D2D0CC] focus:border-[#3157D5] focus:ring-2 focus:ring-[#EEF2FF] rounded-[10px] outline-none text-[#171A21] placeholder:text-[#737782] shadow-2xs transition-all"
            />
            <div className="absolute right-2.5 top-1/2 -translate-y-1/2 flex items-center gap-1.5">
              {inputVal && (
                <button
                  type="button"
                  onClick={handleClearSearch}
                  className="p-1 rounded-[6px] hover:bg-[#F1F0EE] text-[#737782] hover:text-[#171A21]"
                  title="Clear search"
                  aria-label="Clear search"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
              <button
                type="submit"
                className="px-3 py-1 bg-[#2E3440] text-white text-[12px] font-medium rounded-[6px] hover:bg-[#1E222A] active:scale-95 transition-all shadow-2xs"
              >
                Search
              </button>
            </div>
          </form>

          {/* Type filter pills — single pool per request (backend has no multi-type “all”). */}
          <div
            className="flex items-center gap-1.5 overflow-x-auto pb-1"
            role="tablist"
            aria-label="Search categories"
          >
            {TYPE_TABS.map((tab) => {
              const isSelected = filters.type === tab.id;
              return (
                <button
                  key={tab.id}
                  role="tab"
                  aria-selected={isSelected}
                  type="button"
                  onClick={() =>
                    updateFilters(
                      tab.id === 'messages'
                        ? { type: tab.id }
                        : { type: tab.id, in: undefined, from: undefined },
                    )
                  }
                  className={`px-3 py-1.5 text-[13px] font-medium rounded-[8px] border transition-colors whitespace-nowrap ${
                    isSelected
                      ? 'bg-white border-[#171A21] text-[#171A21] shadow-2xs font-semibold'
                      : 'bg-transparent border-[#E4E2DF] text-[#737782] hover:text-[#171A21] hover:bg-white'
                  }`}
                >
                  {tab.label}
                </button>
              );
            })}
          </div>

          {/* Grouped filter controls — message search only (users/channels APIs ignore in/from). */}
          <div className="flex flex-wrap items-center gap-3 p-3 bg-white border border-[#E4E2DF] rounded-[10px] text-[13px]">
            <div className="flex items-center gap-1.5 text-[#737782]">
              <Filter className="w-3.5 h-3.5" />
              <span className="font-semibold text-[11px] uppercase tracking-wider">Filters:</span>
            </div>

            {filters.type === 'messages' ? (
              <>
                <div className="flex items-center gap-1.5">
                  <label htmlFor="filter-channel" className="text-[#737782]">
                    In:
                  </label>
                  <select
                    id="filter-channel"
                    value={filters.in ?? ''}
                    onChange={(e) => updateFilters({ in: e.target.value || undefined })}
                    className="px-2 py-1 bg-[#F6F5F3] border border-[#E4E2DF] rounded-[6px] text-[#171A21] text-[12px] outline-none"
                  >
                    <option value="">Anywhere</option>
                    {channels.map((c) => (
                      <option key={c.id} value={`channel:${c.slug}`}>
                        #{c.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="flex items-center gap-1.5">
                  <label htmlFor="filter-author" className="text-[#737782]">
                    From:
                  </label>
                  <select
                    id="filter-author"
                    value={filters.from ?? ''}
                    onChange={(e) => updateFilters({ from: e.target.value || undefined })}
                    className="px-2 py-1 bg-[#F6F5F3] border border-[#E4E2DF] rounded-[6px] text-[#171A21] text-[12px] outline-none"
                  >
                    <option value="">Anyone</option>
                    {memberOptions.map((m) => (
                      <option key={m.user.id} value={m.user.id}>
                        {m.user.name}
                      </option>
                    ))}
                  </select>
                </div>

                {activeFilters && (
                  <button
                    type="button"
                    onClick={handleResetFilters}
                    className="text-[12px] text-[#3157D5] hover:underline ml-auto"
                  >
                    Reset filters
                  </button>
                )}
              </>
            ) : (
              <span className="text-[12px] text-[#737782]">
                Conversation and author filters apply to messages only.
              </span>
            )}
          </div>
        </div>

        {/* Results count announcer */}
        <div className="flex items-center justify-between text-[13px] text-[#737782] border-b border-[#E4E2DF] pb-2">
          <span role="status" aria-live="polite">
            {!hasQuery
              ? 'Enter a search term'
              : state.status === 'loading'
                ? 'Searching…'
                : state.status === 'ready'
                  ? resultCount === 0
                    ? 'No results found'
                    : `${resultCount} result${resultCount === 1 ? '' : 's'} found`
                  : state.status === 'error' || state.status === 'unauthenticated'
                    ? 'Search unavailable'
                    : ''}
            {hasQuery && state.status === 'ready' && resultCount > 0 && (
              <span>
                {' '}
                for{' '}
                <strong className="text-[#171A21]">&quot;{query}&quot;</strong>
              </span>
            )}
          </span>
          {state.status === 'ready' && resultCount > 0 && (
            <span className="text-[12px] tabular-nums">{resultCount} result{resultCount === 1 ? '' : 's'}</span>
          )}
        </div>

        {/* State panels / results */}
        {!workspaceId ? (
          <div className="bg-white border border-[#E4E2DF] rounded-[12px] p-8 text-center space-y-3">
            <div className="w-12 h-12 rounded-full bg-[#F6F5F3] text-[#737782] flex items-center justify-center mx-auto">
              <Search className="w-6 h-6" />
            </div>
            <h2 className="text-[16px] font-semibold text-[#171A21]">No workspace selected</h2>
            <p className="text-[13px] text-[#4F5360] max-w-sm mx-auto">
              Choose a workspace to search its messages, channels, and members.
            </p>
          </div>
        ) : !hasQuery || state.status === 'idle' ? (
          <SearchEmptyQueryState />
        ) : state.status === 'loading' ? (
          <SearchLoadingState />
        ) : state.status === 'unauthenticated' ? (
          <SearchErrorState
            message="Your session has expired. Sign in again to search."
            actionLabel="Go to sign in"
            onRetry={() => push('/sign-in')}
          />
        ) : state.status === 'error' ? (
          <SearchErrorState message={state.message} onRetry={retry} />
        ) : resultCount === 0 ? (
          <SearchNoResultsState query={query} hasFilters={activeFilters} onClear={handleClearSearch} />
        ) : (
          <div className="space-y-3">
            <SearchResultList
              response={state.response}
              onOpenMessage={(result) => {
                const url = messageSearchResultUrl(result);
                if (url) push(url);
              }}
              onOpenChannel={(result) => {
                const url = channelSearchResultUrl(result);
                if (url) push(url);
              }}
            />

            {loadMoreError && (
              <div
                role="alert"
                className="p-3 bg-white border border-red-200 rounded-[10px] text-[13px] text-red-700 flex items-center justify-between gap-3"
              >
                <span>{loadMoreError}</span>
                <button
                  type="button"
                  onClick={loadMore}
                  className="text-[12px] font-medium text-[#3157D5] hover:underline"
                >
                  Retry
                </button>
              </div>
            )}

            {hasMore && (
              <div className="pt-2 text-center">
                <button
                  type="button"
                  onClick={loadMore}
                  disabled={isLoadingMore}
                  className="px-4 py-2 text-[13px] font-medium bg-white border border-[#E4E2DF] hover:bg-[#F1F0EE] text-[#171A21] rounded-[8px] transition-colors shadow-2xs active:scale-[0.98] disabled:opacity-60"
                >
                  {isLoadingMore ? 'Loading…' : 'Load more results'}
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </main>
  );
};
