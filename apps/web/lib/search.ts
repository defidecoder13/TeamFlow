/**
 * Search API client (Phase 4G.4).
 *
 * Thin layer over `GET /api/workspaces/:workspaceId/search`. Mirrors the
 * 4G.3 backend contract: `type` selects the result pool (messages, users,
 * channels); filters narrow it; `cursor` pages it. Identity comes from
 * session cookies — no client-supplied audience is sent.
 */

import type { ApiResult } from './messages';
import { authedFetch } from './session-token';

export type SearchResultType = 'messages' | 'users' | 'channels';
export type SearchThreadFilter = 'include' | 'only' | 'exclude';

export interface SearchAuthor {
  id: string;
  name: string;
  image: string | null;
}

export interface MessageSearchContainer {
  kind: 'channel' | 'dm';
  channelId?: string;
  channelSlug?: string;
  channelName?: string;
  conversationId?: string;
  conversationName?: string | null;
  conversationType?: 'DIRECT' | 'GROUP';
  peer?: SearchAuthor | null;
}

export interface MatchOffset {
  start: number;
  length: number;
}

export interface MessageSearchResult {
  id: string;
  container: MessageSearchContainer;
  author: SearchAuthor;
  snippet: string;
  matchOffsets: MatchOffset[];
  parentMessageId: string | null;
  threadRootId?: string;
  replyCount: number;
  createdAt: Date;
  updatedAt: Date;
  score: number;
}

export interface UserSearchResult {
  id: string;
  name: string;
  image: string | null;
  score: number;
}

export interface ChannelSearchResult {
  kind: 'channel' | 'group_dm';
  id: string;
  slug?: string;
  name: string | null;
  description?: string | null;
  channelType?: 'PUBLIC' | 'PRIVATE';
  conversationType?: 'DIRECT' | 'GROUP';
  score: number;
}

export interface SearchPageInfo {
  hasMore: boolean;
  nextCursor: string | null;
}

export interface MessageSearchResponse {
  type: 'messages';
  results: MessageSearchResult[];
  pageInfo: SearchPageInfo;
}

export interface UserSearchResponse {
  type: 'users';
  results: UserSearchResult[];
  pageInfo: SearchPageInfo;
}

export interface ChannelSearchResponse {
  type: 'channels';
  results: ChannelSearchResult[];
  pageInfo: SearchPageInfo;
}

export type SearchResponse = MessageSearchResponse | UserSearchResponse | ChannelSearchResponse;

export interface SearchFilters {
  q: string;
  type: SearchResultType;
  in?: string;
  from?: string;
  after?: string;
  before?: string;
  thread: SearchThreadFilter;
}

export const DEFAULT_SEARCH_FILTERS: SearchFilters = {
  q: '',
  type: 'messages',
  thread: 'include',
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}

function isDateString(value: unknown): value is string {
  return typeof value === 'string' && !Number.isNaN(Date.parse(value));
}

function isSearchAuthor(value: unknown): value is SearchAuthor {
  return (
    isRecord(value) &&
    isNonEmptyString(value.id) &&
    typeof value.name === 'string' &&
    (typeof value.image === 'string' || value.image === null)
  );
}

/**
 * Rebuild the allowlisted author shape so unexpected backend fields (email,
 * roles, metadata) can never flow into typed results, even if present.
 */
function normalizeAuthor(value: SearchAuthor): SearchAuthor {
  return { id: value.id, name: value.name, image: value.image };
}

function isMatchOffset(value: unknown): value is MatchOffset {
  return (
    isRecord(value) &&
    typeof value.start === 'number' &&
    Number.isInteger(value.start) &&
    value.start >= 0 &&
    typeof value.length === 'number' &&
    Number.isInteger(value.length) &&
    value.length > 0
  );
}

function messageContainerFromJson(value: unknown): MessageSearchContainer | null {
  if (!isRecord(value) || (value.kind !== 'channel' && value.kind !== 'dm')) {
    return null;
  }
  if (value.kind === 'channel') {
    if (!isNonEmptyString(value.channelId)) {
      return null;
    }
    return {
      kind: 'channel',
      channelId: value.channelId,
      channelSlug: typeof value.channelSlug === 'string' ? value.channelSlug : undefined,
      channelName: typeof value.channelName === 'string' ? value.channelName : undefined,
    };
  }
  if (!isNonEmptyString(value.conversationId)) {
    return null;
  }
  const peer = value.peer === null || value.peer === undefined ? null : value.peer;
  if (peer !== null && !isSearchAuthor(peer)) {
    return null;
  }
  const conversationType = value.conversationType;
  if (
    conversationType !== undefined &&
    conversationType !== null &&
    conversationType !== 'DIRECT' &&
    conversationType !== 'GROUP'
  ) {
    return null;
  }
  return {
    kind: 'dm',
    conversationId: value.conversationId,
    conversationName: typeof value.conversationName === 'string' ? value.conversationName : null,
    conversationType: (conversationType ?? undefined) as 'DIRECT' | 'GROUP' | undefined,
    peer: peer === null ? null : normalizeAuthor(peer),
  };
}

function messageSearchResultFromJson(value: unknown): MessageSearchResult | null {
  if (!isRecord(value)) {
    return null;
  }
  if (!isNonEmptyString(value.id)) {
    return null;
  }
  const container = messageContainerFromJson(value.container);
  if (!container) {
    return null;
  }
  if (!isSearchAuthor(value.author)) {
    return null;
  }
  if (typeof value.snippet !== 'string') {
    return null;
  }
  if (!Array.isArray(value.matchOffsets) || !value.matchOffsets.every(isMatchOffset)) {
    return null;
  }
  if (value.parentMessageId !== null && !isNonEmptyString(value.parentMessageId)) {
    return null;
  }
  if (
    value.threadRootId !== undefined &&
    value.threadRootId !== null &&
    !isNonEmptyString(value.threadRootId)
  ) {
    return null;
  }
  if (typeof value.replyCount !== 'number' || typeof value.score !== 'number') {
    return null;
  }
  if (!isDateString(value.createdAt) || !isDateString(value.updatedAt)) {
    return null;
  }
  return {
    id: value.id,
    container,
    author: normalizeAuthor(value.author),
    snippet: value.snippet,
    matchOffsets: value.matchOffsets,
    parentMessageId: value.parentMessageId,
    threadRootId: value.threadRootId ?? undefined,
    replyCount: value.replyCount,
    createdAt: new Date(value.createdAt),
    updatedAt: new Date(value.updatedAt),
    score: value.score,
  };
}

function userSearchResultFromJson(value: unknown): UserSearchResult | null {
  if (!isRecord(value)) {
    return null;
  }
  if (!isNonEmptyString(value.id) || typeof value.name !== 'string') {
    return null;
  }
  if (typeof value.image !== 'string' && value.image !== null) {
    return null;
  }
  if (typeof value.score !== 'number') {
    return null;
  }
  return { id: value.id, name: value.name, image: value.image, score: value.score };
}

function channelSearchResultFromJson(value: unknown): ChannelSearchResult | null {
  if (!isRecord(value)) {
    return null;
  }
  if (value.kind !== 'channel' && value.kind !== 'group_dm') {
    return null;
  }
  if (!isNonEmptyString(value.id) || typeof value.score !== 'number') {
    return null;
  }
  if (value.name !== null && typeof value.name !== 'string') {
    return null;
  }
  return {
    kind: value.kind,
    id: value.id,
    slug: typeof value.slug === 'string' ? value.slug : undefined,
    name: value.name,
    description: typeof value.description === 'string' ? value.description : undefined,
    channelType:
      value.channelType === 'PUBLIC' || value.channelType === 'PRIVATE'
        ? value.channelType
        : undefined,
    conversationType:
      value.conversationType === 'DIRECT' || value.conversationType === 'GROUP'
        ? value.conversationType
        : undefined,
    score: value.score,
  };
}

function pageInfoFromJson(value: unknown): SearchPageInfo | null {
  if (!isRecord(value)) {
    return null;
  }
  if (typeof value.hasMore !== 'boolean') {
    return null;
  }
  if (value.nextCursor !== null && typeof value.nextCursor !== 'string') {
    return null;
  }
  return { hasMore: value.hasMore, nextCursor: value.nextCursor };
}

export function searchResponseFromJson(value: unknown): SearchResponse | null {
  if (!isRecord(value) || !isRecord(value.pageInfo)) {
    return null;
  }
  const pageInfo = pageInfoFromJson(value.pageInfo);
  if (!pageInfo || !Array.isArray(value.results)) {
    return null;
  }
  if (value.type === 'messages') {
    const results: MessageSearchResult[] = [];
    for (const item of value.results) {
      const parsed = messageSearchResultFromJson(item);
      if (!parsed) {
        return null;
      }
      results.push(parsed);
    }
    return { type: 'messages', results, pageInfo };
  }
  if (value.type === 'users') {
    const results: UserSearchResult[] = [];
    for (const item of value.results) {
      const parsed = userSearchResultFromJson(item);
      if (!parsed) {
        return null;
      }
      results.push(parsed);
    }
    return { type: 'users', results, pageInfo };
  }
  if (value.type === 'channels') {
    const results: ChannelSearchResult[] = [];
    for (const item of value.results) {
      const parsed = channelSearchResultFromJson(item);
      if (!parsed) {
        return null;
      }
      results.push(parsed);
    }
    return { type: 'channels', results, pageInfo };
  }
  return null;
}

export interface SearchRequestOptions {
  in?: string;
  from?: string;
  after?: string;
  before?: string;
  thread?: SearchThreadFilter;
  limit?: number;
  cursor?: string;
  signal?: AbortSignal;
}

function backendErrorMessage(json: unknown): string | null {
  if (isRecord(json) && isRecord(json.error) && typeof json.error.message === 'string') {
    return json.error.message;
  }
  return null;
}

export type AbortedSearch = { ok: false; kind: 'aborted' };

export type SearchFetchResult = ApiResult<SearchResponse> | AbortedSearch;

/** Narrow helper: the aborted variant shares the failure shape, so `in` checks alone cannot exclude it. */
export function isAbortedSearch(result: SearchFetchResult): result is AbortedSearch {
  return !result.ok && result.kind === 'aborted';
}

/**
 * Run a workspace search. The backend validates everything; the client only
 * serializes the documented parameters. Aborted requests resolve as a
 * distinct `aborted` failure so callers can ignore stale responses.
 */
export async function searchWorkspace(
  apiBase: string,
  workspaceId: string,
  q: string,
  type: SearchResultType,
  options?: SearchRequestOptions,
): Promise<SearchFetchResult> {
  const params = new URLSearchParams();
  params.set('q', q);
  params.set('type', type);
  if (options?.in) {
    params.set('in', options.in);
  }
  if (options?.from) {
    params.set('from', options.from);
  }
  if (options?.after) {
    params.set('after', options.after);
  }
  if (options?.before) {
    params.set('before', options.before);
  }
  if (options?.thread) {
    params.set('thread', options.thread);
  }
  if (options?.limit && options.limit > 0) {
    params.set('limit', String(options.limit));
  }
  if (options?.cursor) {
    params.set('cursor', options.cursor);
  }
  let res: Response;
  try {
    res = await authedFetch(
      `${apiBase}/api/workspaces/${encodeURIComponent(workspaceId)}/search?${params.toString()}`,
      {
        method: 'GET',
        headers: { Accept: 'application/json' },
        credentials: 'include',
        signal: options?.signal,
      },
    );
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      return { ok: false, kind: 'aborted' };
    }
    return {
      ok: false,
      kind: 'error',
      message: 'Search failed. Check your connection and try again.',
    };
  }
  if (res.status === 401) {
    return { ok: false, unauthenticated: true };
  }
  let json: unknown = null;
  try {
    json = await res.json();
  } catch {
    json = null;
  }
  if (res.status === 404) {
    return {
      ok: false,
      kind: 'notFound',
      message: backendErrorMessage(json) ?? 'Search target not found.',
    };
  }
  if (res.status === 400) {
    return {
      ok: false,
      kind: 'validation',
      message: backendErrorMessage(json) ?? 'Invalid search request.',
    };
  }
  if (!res.ok) {
    return {
      ok: false,
      kind: 'error',
      message: backendErrorMessage(json) ?? 'Search failed. Try again.',
    };
  }
  const parsed = searchResponseFromJson(json);
  if (!parsed || parsed.type !== type) {
    return { ok: false, kind: 'error', message: 'Search failed. Try again.' };
  }
  return { ok: true, data: parsed };
}

// ---------------------------------------------------------------------------
// URL contract: /app/search?q=...&type=...&in=...&from=...&after=...&before=...&thread=...
// The URL is the source of truth for shareable search state.
// ---------------------------------------------------------------------------

function parseResultType(value: string | null): SearchResultType {
  return value === 'users' || value === 'channels' ? value : 'messages';
}

function parseThreadFilter(value: string | null): SearchThreadFilter {
  return value === 'only' || value === 'exclude' ? value : 'include';
}

export function parseSearchParams(searchParams: URLSearchParams): SearchFilters {
  const get = (key: string): string | undefined => {
    const value = searchParams.get(key)?.trim();
    return value ? value : undefined;
  };
  return {
    q: get('q') ?? '',
    type: parseResultType(searchParams.get('type')),
    in: get('in'),
    from: get('from'),
    after: get('after'),
    before: get('before'),
    thread: parseThreadFilter(searchParams.get('thread')),
  };
}

export function serializeSearchParams(filters: SearchFilters): string {
  const params = new URLSearchParams();
  if (filters.q.trim()) {
    params.set('q', filters.q.trim());
  }
  if (filters.type !== 'messages') {
    params.set('type', filters.type);
  }
  if (filters.in?.trim()) {
    params.set('in', filters.in.trim());
  }
  if (filters.from?.trim()) {
    params.set('from', filters.from.trim());
  }
  if (filters.after?.trim()) {
    params.set('after', filters.after.trim());
  }
  if (filters.before?.trim()) {
    params.set('before', filters.before.trim());
  }
  if (filters.thread !== 'include') {
    params.set('thread', filters.thread);
  }
  return params.toString();
}

/** Convert a YYYY-MM-DD date input to a day-boundary ISO timestamp. */
export function dateInputToISO(dateInput: string, endOfDay: boolean): string | undefined {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateInput)) {
    return undefined;
  }
  const iso = endOfDay ? `${dateInput}T23:59:59.999Z` : `${dateInput}T00:00:00.000Z`;
  return Number.isNaN(Date.parse(iso)) ? undefined : iso;
}

/** Display an ISO timestamp filter back in a YYYY-MM-DD date input. */
export function isoToDateInput(iso: string | undefined): string {
  if (!iso) {
    return '';
  }
  const time = Date.parse(iso);
  if (Number.isNaN(time)) {
    return '';
  }
  return new Date(time).toISOString().slice(0, 10);
}

// ---------------------------------------------------------------------------
// Deep links: channel/DM/thread navigation for search results.
// Roots link with `?message=<rootId>`; replies add `&reply=<replyId>` so the
// conversation opens the thread panel with the reply highlighted.
// ---------------------------------------------------------------------------

export function messageSearchResultUrl(result: MessageSearchResult): string | null {
  if (result.container.kind === 'channel') {
    if (!result.container.channelSlug) {
      return null;
    }
    const base = `/app/channels/${encodeURIComponent(result.container.channelSlug)}`;
    if (result.threadRootId) {
      return `${base}?message=${encodeURIComponent(result.threadRootId)}&reply=${encodeURIComponent(result.id)}`;
    }
    return `${base}?message=${encodeURIComponent(result.id)}`;
  }
  if (!result.container.conversationId) {
    return null;
  }
  const base = `/app/dms/${encodeURIComponent(result.container.conversationId)}`;
  if (result.threadRootId) {
    return `${base}?message=${encodeURIComponent(result.threadRootId)}&reply=${encodeURIComponent(result.id)}`;
  }
  return `${base}?message=${encodeURIComponent(result.id)}`;
}

export function channelSearchResultUrl(result: ChannelSearchResult): string | null {
  if (result.kind === 'channel') {
    return result.slug ? `/app/channels/${encodeURIComponent(result.slug)}` : null;
  }
  return `/app/dms/${encodeURIComponent(result.id)}`;
}
