/**
 * Search client tests (Phase 4G.4): URL contract round-trips, deep-link URL
 * builders, response guards, and fetch serialization/error mapping.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  channelSearchResultUrl,
  dateInputToISO,
  isoToDateInput,
  messageSearchResultUrl,
  parseSearchParams,
  searchResponseFromJson,
  searchWorkspace,
  serializeSearchParams,
  type ChannelSearchResult,
  type MessageSearchResult,
} from './search';

const API_BASE = 'http://localhost:4000';

const MESSAGE_JSON = {
  type: 'messages',
  results: [
    {
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
      createdAt: '2026-09-06T12:00:00.000Z',
      updatedAt: '2026-09-06T12:00:00.000Z',
      score: 0.9,
    },
  ],
  pageInfo: { hasMore: true, nextCursor: 'cursor-1' },
};

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('parseSearchParams / serializeSearchParams', () => {
  it('round-trips every documented filter', () => {
    const filters = {
      q: 'database migration',
      type: 'messages' as const,
      in: 'channel:general',
      from: 'u-1',
      after: '2026-09-01T00:00:00.000Z',
      before: '2026-09-09T23:59:59.999Z',
      thread: 'only' as const,
    };
    const parsed = parseSearchParams(new URLSearchParams(serializeSearchParams(filters)));
    expect(parsed).toEqual(filters);
  });

  it('applies defaults and drops empties', () => {
    expect(parseSearchParams(new URLSearchParams(''))).toEqual({
      q: '',
      type: 'messages',
      in: undefined,
      from: undefined,
      after: undefined,
      before: undefined,
      thread: 'include',
    });
    expect(serializeSearchParams({ q: '  ', type: 'messages', thread: 'include' })).toBe('');
    expect(
      parseSearchParams(new URLSearchParams('type=bogus&thread=sometimes&q=hi')),
    ).toMatchObject({ q: 'hi', type: 'messages', thread: 'include' });
  });
});

describe('date input helpers', () => {
  it('converts day boundaries and back', () => {
    expect(dateInputToISO('2026-09-01', false)).toBe('2026-09-01T00:00:00.000Z');
    expect(dateInputToISO('2026-09-09', true)).toBe('2026-09-09T23:59:59.999Z');
    expect(dateInputToISO('not-a-date', false)).toBeUndefined();
    expect(isoToDateInput('2026-09-01T00:00:00.000Z')).toBe('2026-09-01');
    expect(isoToDateInput(undefined)).toBe('');
    expect(isoToDateInput('bogus')).toBe('');
  });
});

describe('deep-link URL builders', () => {
  const base: MessageSearchResult = {
    id: 'm-1',
    container: {
      kind: 'channel',
      channelId: 'ch-1',
      channelSlug: 'general',
      channelName: 'General',
    },
    author: { id: 'u-1', name: 'Ada', image: null },
    snippet: 'hi',
    matchOffsets: [],
    parentMessageId: null,
    replyCount: 0,
    createdAt: new Date('2026-09-06T12:00:00.000Z'),
    updatedAt: new Date('2026-09-06T12:00:00.000Z'),
    score: 1,
  };

  it('links roots and replies to channels and DMs', () => {
    expect(messageSearchResultUrl(base)).toBe('/app/channels/general?message=m-1');
    expect(
      messageSearchResultUrl({ ...base, parentMessageId: 'root-1', threadRootId: 'root-1' }),
    ).toBe('/app/channels/general?message=root-1&reply=m-1');
    const dm = {
      ...base,
      container: { kind: 'dm' as const, conversationId: 'dm-1', conversationName: null },
    };
    expect(messageSearchResultUrl(dm)).toBe('/app/dms/dm-1?message=m-1');
    expect(
      messageSearchResultUrl({ ...dm, parentMessageId: 'root-9', threadRootId: 'root-9' }),
    ).toBe('/app/dms/dm-1?message=root-9&reply=m-1');
  });

  it('returns null when the destination cannot be resolved', () => {
    expect(messageSearchResultUrl({ ...base, container: { kind: 'channel' } })).toBeNull();
    expect(
      messageSearchResultUrl({ ...base, container: { kind: 'dm', conversationName: null } }),
    ).toBeNull();
  });

  it('links directory results to existing routes', () => {
    const channel: ChannelSearchResult = {
      kind: 'channel',
      id: 'ch-1',
      slug: 'general',
      name: 'General',
      score: 1,
    };
    expect(channelSearchResultUrl(channel)).toBe('/app/channels/general');
    expect(channelSearchResultUrl({ ...channel, slug: undefined })).toBeNull();
    const group: ChannelSearchResult = { kind: 'group_dm', id: 'dm-9', name: 'Crew', score: 1 };
    expect(channelSearchResultUrl(group)).toBe('/app/dms/dm-9');
  });
});

describe('searchResponseFromJson', () => {
  it('parses message responses and normalizes dates', () => {
    const parsed = searchResponseFromJson(MESSAGE_JSON);
    expect(parsed?.type).toBe('messages');
    if (parsed?.type === 'messages') {
      expect(parsed.results[0].createdAt).toEqual(new Date('2026-09-06T12:00:00.000Z'));
      expect(parsed.results[0].matchOffsets).toEqual([{ start: 6, length: 8 }]);
      expect(parsed.pageInfo).toEqual({ hasMore: true, nextCursor: 'cursor-1' });
    }
  });

  it('rejects malformed payloads without throwing', () => {
    expect(searchResponseFromJson(null)).toBeNull();
    expect(searchResponseFromJson({})).toBeNull();
    expect(searchResponseFromJson({ ...MESSAGE_JSON, type: 'everything' })).toBeNull();
    expect(
      searchResponseFromJson({
        ...MESSAGE_JSON,
        results: [{ ...MESSAGE_JSON.results[0], author: { id: 'u-1' } }],
      }),
    ).toBeNull();
    expect(
      searchResponseFromJson({
        ...MESSAGE_JSON,
        results: [{ ...MESSAGE_JSON.results[0], matchOffsets: [{ start: -1, length: 2 }] }],
      }),
    ).toBeNull();
  });

  it('never accepts author email fields into the typed result', () => {
    const withEmail = {
      ...MESSAGE_JSON,
      results: [
        {
          ...MESSAGE_JSON.results[0],
          author: { id: 'u-1', name: 'Ada', email: 'a@x.io', image: null },
        },
      ],
    };
    const parsed = searchResponseFromJson(withEmail);
    if (parsed?.type === 'messages') {
      expect('email' in parsed.results[0].author).toBe(false);
    } else {
      throw new Error('expected messages response');
    }
  });
});

describe('searchWorkspace', () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  it('serializes filters and parses the response', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(200, MESSAGE_JSON));
    vi.stubGlobal('fetch', fetchMock);
    const result = await searchWorkspace(API_BASE, 'ws-1', 'database', 'messages', {
      in: 'channel:general',
      from: 'u-1',
      after: '2026-09-01T00:00:00.000Z',
      before: '2026-09-09T23:59:59.999Z',
      thread: 'only',
      limit: 20,
      cursor: 'cursor-0',
    });
    expect(result.ok).toBe(true);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain('/api/workspaces/ws-1/search?');
    expect(url).toContain('q=database');
    expect(url).toContain('in=channel%3Ageneral');
    expect(url).toContain('thread=only');
    expect(url).toContain('cursor=cursor-0');
    expect(init.credentials).toBe('include');
  });

  it('maps 401/404/400/network outcomes to the ApiResult convention', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(401, {})));
    expect(await searchWorkspace(API_BASE, 'ws-1', 'hi', 'messages')).toEqual({
      ok: false,
      unauthenticated: true,
    });

    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(jsonResponse(404, { error: { message: 'Workspace not found.' } })),
    );
    expect(await searchWorkspace(API_BASE, 'ws-1', 'hi', 'messages')).toEqual({
      ok: false,
      kind: 'notFound',
      message: 'Workspace not found.',
    });

    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(jsonResponse(400, { error: { message: 'Enter a search term.' } })),
    );
    expect(await searchWorkspace(API_BASE, 'ws-1', '', 'messages')).toEqual({
      ok: false,
      kind: 'validation',
      message: 'Enter a search term.',
    });

    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('down')));
    expect(await searchWorkspace(API_BASE, 'ws-1', 'hi', 'messages')).toEqual({
      ok: false,
      kind: 'error',
      message: 'Search failed. Check your connection and try again.',
    });
  });

  it('rejects type-mismatched and malformed bodies', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(jsonResponse(200, { ...MESSAGE_JSON, type: 'users' }));
    vi.stubGlobal('fetch', fetchMock);
    const mismatched = await searchWorkspace(API_BASE, 'ws-1', 'hi', 'messages');
    expect(mismatched.ok).toBe(false);

    fetchMock.mockResolvedValue(jsonResponse(200, { type: 'messages', results: [], pageInfo: {} }));
    const malformed = await searchWorkspace(API_BASE, 'ws-1', 'hi', 'messages');
    expect(malformed.ok).toBe(false);
  });

  it('surfaces aborts distinctly so stale responses are ignored', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new DOMException('aborted', 'AbortError')));
    expect(await searchWorkspace(API_BASE, 'ws-1', 'hi', 'messages')).toEqual({
      ok: false,
      kind: 'aborted',
    });
  });
});
