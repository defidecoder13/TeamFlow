/**
 * Workspace search page (Phase 4G.4).
 *
 * URL-driven: `/app/search?q=...&type=...&in=...&from=...&after=...&before=...`
 * is the source of truth, so searches survive refresh, back/forward, and
 * shared links. Results reuse the 4G.3 contract; message clicks deep-link to
 * the conversation with `?message=` (+ `&reply=` for thread replies).
 */

'use client';

import { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { AppShell } from '../../../components/app/AppShell';
import { AppShellSkeleton } from '../../../components/app/AppShellSkeleton';
import { SearchIcon } from '../../../components/app/icons';
import {
  SearchEmptyQueryState,
  SearchErrorState,
  SearchLoadingState,
  SearchNoResultsState,
  SearchResultList,
} from '../../../components/search/SearchResults';
import { SearchFilters, type FilterSelection } from '../../../components/search/SearchFilters';
import { useSessionUser } from '../../../lib/use-session-user';
import { useWorkspaces } from '../../../lib/use-workspaces';
import { useWorkspaceMembers } from '../../../lib/use-workspace-members';
import { useWorkspaceChannels } from '../../../lib/use-workspace-channels';
import { useDirectConversations } from '../../../lib/use-direct-conversations';
import { useSearch } from '../../../lib/use-search';
import {
  channelSearchResultUrl,
  dateInputToISO,
  isoToDateInput,
  messageSearchResultUrl,
  parseSearchParams,
  serializeSearchParams,
  type ChannelSearchResult,
  type MessageSearchResult,
  type SearchFilters as SearchFilterValues,
} from '../../../lib/search';

function conversationLabel(
  type: 'DIRECT' | 'GROUP',
  name: string | null | undefined,
  peerName: string | null | undefined,
): string {
  if (type === 'GROUP') {
    return name?.trim() || 'Group message';
  }
  return peerName?.trim() || name?.trim() || 'Direct message';
}

function SearchPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const session = useSessionUser();
  const workspaces = useWorkspaces(session.status === 'authenticated');

  const workspace = workspaces.state.status === 'ready' ? workspaces.state.current : null;
  const workspaceId = workspace?.id ?? null;
  const userId = session.status === 'authenticated' ? session.user.id : null;

  const membersState = useWorkspaceMembers(workspaceId);
  const channelsState = useWorkspaceChannels(workspaceId);
  const conversationsState = useDirectConversations(workspaceId, userId);

  const filters: SearchFilterValues = useMemo(
    () => parseSearchParams(searchParams),
    [searchParams],
  );

  const [input, setInput] = useState(filters.q);
  useEffect(() => {
    setInput(filters.q);
  }, [filters.q]);

  const { state, loadMore, retry, isLoadingMore, loadMoreError } = useSearch(workspaceId, filters);

  const memberOptions = useMemo(() => {
    if (membersState.state.status !== 'ready') {
      return [];
    }
    return membersState.state.members.map((member) => ({
      value: member.user.id,
      label: member.user.name,
    }));
  }, [membersState]);

  const inOptions = useMemo(() => {
    const options: Array<{ value: string; label: string }> = [];
    if (channelsState.state.status === 'ready') {
      for (const channel of channelsState.state.channels) {
        options.push({ value: `channel:${channel.slug}`, label: `#${channel.name}` });
      }
    }
    if (conversationsState.state.status === 'ready') {
      for (const conversation of conversationsState.state.conversations) {
        options.push({
          value: `dm:${conversation.id}`,
          label: conversationLabel(conversation.type, conversation.name, conversation.peer?.name),
        });
      }
    }
    return options;
  }, [channelsState, conversationsState]);

  const commitFilters = useCallback(
    (next: SearchFilterValues) => {
      const query = serializeSearchParams(next);
      router.push(query ? `/app/search?${query}` : '/app/search');
    },
    [router],
  );

  const handleSubmit = useCallback(
    (event: React.FormEvent) => {
      event.preventDefault();
      commitFilters({ ...filters, q: input });
    },
    [commitFilters, filters, input],
  );

  const handleFilterChange = useCallback(
    (patch: Partial<FilterSelection>) => {
      const next: SearchFilterValues = {
        ...filters,
        type: patch.type ?? filters.type,
        in: patch.in ?? filters.in,
        from: patch.from ?? filters.from,
        thread: patch.thread ?? filters.thread,
      };
      if (patch.afterInput !== undefined) {
        next.after = patch.afterInput ? dateInputToISO(patch.afterInput, false) : undefined;
      }
      if (patch.beforeInput !== undefined) {
        next.before = patch.beforeInput ? dateInputToISO(patch.beforeInput, true) : undefined;
      }
      if (patch.type && patch.type !== 'messages') {
        // Message-only filters do not apply to directory pools.
        next.in = undefined;
        next.from = undefined;
        next.after = undefined;
        next.before = undefined;
        next.thread = 'include';
      }
      commitFilters(next);
    },
    [commitFilters, filters],
  );

  const handleOpenMessage = useCallback(
    (result: MessageSearchResult) => {
      const url = messageSearchResultUrl(result);
      if (url) {
        router.push(url);
      }
    },
    [router],
  );

  const handleOpenChannel = useCallback(
    (result: ChannelSearchResult) => {
      const url = channelSearchResultUrl(result);
      if (url) {
        router.push(url);
      }
    },
    [router],
  );

  const signedOut =
    session.status === 'unauthenticated' || workspaces.state.status === 'unauthenticated';
  useEffect(() => {
    if (signedOut) {
      router.replace('/sign-in');
    }
  }, [signedOut, router]);

  if (
    session.status === 'loading' ||
    workspaces.state.status === 'loading' ||
    workspaces.state.status === 'idle'
  ) {
    return <AppShellSkeleton />;
  }
  if (session.status === 'error') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-white px-6">
        <div className="w-full max-w-sm rounded-xl border border-stone-200 bg-white p-6 text-center">
          <p className="text-sm text-stone-600">{session.message}</p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="mt-4 rounded-lg bg-stone-900 px-4 py-2 text-sm font-medium text-white"
          >
            Try again
          </button>
        </div>
      </div>
    );
  }
  if (signedOut) {
    return (
      <p role="status" className="p-8 text-sm text-stone-500">
        Redirecting to sign-in…
      </p>
    );
  }
  if (session.status !== 'authenticated') {
    return <AppShellSkeleton />;
  }
  if (workspaces.state.status === 'error') {
    return (
      <AppShell user={session.user} workspaceName={null} workspaceId={null} location="Search">
        <SearchErrorState message={workspaces.state.message} onRetry={workspaces.retry} />
      </AppShell>
    );
  }
  if (!workspace) {
    return (
      <AppShell user={session.user} workspaceName={null} workspaceId={null} location="Search">
        <SearchNoResultsState hasFilters={false} />
      </AppShell>
    );
  }

  const selection: FilterSelection = {
    type: filters.type,
    in: filters.in,
    from: filters.from,
    afterInput: isoToDateInput(filters.after),
    beforeInput: isoToDateInput(filters.before),
    thread: filters.thread,
  };
  const hasActiveFilters = Boolean(
    filters.in || filters.from || filters.after || filters.before || filters.thread !== 'include',
  );

  return (
    <AppShell
      user={session.user}
      workspaceName={workspace.name}
      workspaceId={workspace.id}
      location="Search"
    >
      <div className="flex flex-col gap-4">
        <form onSubmit={handleSubmit} role="search" aria-label="Workspace search">
          <label htmlFor="workspace-search-input" className="sr-only">
            Search messages, people, and channels
          </label>
          <div className="flex items-center gap-2 rounded-xl border border-stone-200 bg-white px-3 shadow-[0_1px_2px_rgba(0,0,0,0.04)] focus-within:border-stone-400">
            <SearchIcon className="h-4 w-4 shrink-0 text-stone-400" aria-hidden="true" />
            <input
              id="workspace-search-input"
              type="search"
              value={input}
              onChange={(event) => setInput(event.target.value)}
              placeholder="Search messages, people, and channels…"
              autoComplete="off"
              autoFocus
              className="h-10 min-w-0 flex-1 bg-transparent text-[14px] text-stone-900 placeholder:text-stone-400 focus:outline-none"
            />
            {input && (
              <button
                type="button"
                onClick={() => {
                  setInput('');
                  commitFilters({ ...filters, q: '' });
                }}
                aria-label="Clear search"
                className="shrink-0 rounded px-1 text-[12px] font-medium text-stone-400 hover:text-stone-700 focus:outline-none focus:ring-1 focus:ring-stone-400"
              >
                Clear
              </button>
            )}
            <button
              type="submit"
              className="shrink-0 rounded-lg bg-stone-900 px-3 py-1.5 text-[13px] font-medium text-white transition-colors hover:bg-stone-700 focus:outline-none focus:ring-2 focus:ring-stone-400"
            >
              Search
            </button>
          </div>
        </form>

        <SearchFilters
          selection={selection}
          memberOptions={memberOptions}
          inOptions={inOptions}
          onChange={handleFilterChange}
        />

        {state.status === 'idle' && <SearchEmptyQueryState />}
        {state.status === 'loading' && <SearchLoadingState />}
        {state.status === 'unauthenticated' && (
          <SearchErrorState
            message="Session expired. Please sign in again."
            onRetry={() => router.replace('/sign-in')}
          />
        )}
        {state.status === 'error' && <SearchErrorState message={state.message} onRetry={retry} />}
        {state.status === 'ready' &&
          (state.response.results.length === 0 ? (
            <SearchNoResultsState hasFilters={hasActiveFilters} />
          ) : (
            <div className="flex flex-col gap-3">
              <p role="status" className="px-1 text-[12px] text-stone-500">
                {state.response.results.length} result
                {state.response.results.length === 1 ? '' : 's'}
                {state.response.pageInfo.hasMore ? ' (more available below)' : ''}
              </p>
              <SearchResultList
                response={state.response}
                onOpenMessage={handleOpenMessage}
                onOpenChannel={handleOpenChannel}
              />
              {state.response.pageInfo.hasMore && (
                <div className="flex flex-col items-center gap-2 py-2">
                  <button
                    type="button"
                    onClick={loadMore}
                    disabled={isLoadingMore}
                    className="rounded-lg border border-stone-200 bg-white px-4 py-2 text-[13px] font-medium text-stone-700 transition-colors hover:bg-stone-50 focus:outline-none focus:ring-2 focus:ring-stone-400 disabled:cursor-wait disabled:opacity-60"
                  >
                    {isLoadingMore ? 'Loading…' : 'Load more results'}
                  </button>
                  {loadMoreError && (
                    <div className="flex items-center gap-2 text-[12px] text-red-700" role="alert">
                      <span>{loadMoreError}</span>
                      <button
                        type="button"
                        onClick={loadMore}
                        className="font-medium underline hover:text-red-900"
                      >
                        Retry
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
      </div>
    </AppShell>
  );
}

export default function SearchPage() {
  return (
    <Suspense fallback={<AppShellSkeleton />}>
      <SearchPageInner />
    </Suspense>
  );
}
