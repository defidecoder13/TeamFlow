/**
 * Notification API client tests (Phase 4H.7): URL serialization, response
 * guards, deep-link builders, and error mapping. The network is stubbed;
 * no backend required.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  fetchNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  notificationFromJson,
  searchNotificationUrl,
} from './notifications';

const API_BASE = 'http://localhost:4000';

const ITEM_JSON = {
  id: 'n-1',
  type: 'MENTION',
  workspaceId: 'ws-1',
  recipientUserId: 'u-1',
  actorUserId: 'u-2',
  actorName: 'Grace Hopper',
  actorImage: null,
  messageId: 'm-1',
  conversationId: null,
  channelId: 'ch-1',
  threadRootMessageId: null,
  channelName: 'general',
  conversationName: null,
  createdAt: '2026-09-06T12:00:00.000Z',
  readAt: null,
};

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('notificationFromJson', () => {
  it('parses valid items and normalizes dates', () => {
    const parsed = notificationFromJson(ITEM_JSON);
    expect(parsed?.createdAt).toEqual(new Date('2026-09-06T12:00:00.000Z'));
    expect(parsed?.readAt).toBeNull();
  });

  it('rejects malformed payloads without throwing', () => {
    expect(notificationFromJson(null)).toBeNull();
    expect(notificationFromJson({})).toBeNull();
    expect(notificationFromJson({ ...ITEM_JSON, type: 'REACTION' })).toBeNull();
    expect(notificationFromJson({ ...ITEM_JSON, id: '' })).toBeNull();
    expect(notificationFromJson({ ...ITEM_JSON, createdAt: 'not-a-date' })).toBeNull();
    expect(notificationFromJson({ ...ITEM_JSON, readAt: 'yesterday' })).toBeNull();
  });
});

describe('fetchNotifications', () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  it('serializes workspace, limit, cursor, and unreadOnly', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse(200, {
        notifications: [ITEM_JSON],
        pageInfo: { hasMore: true, nextCursor: 'cursor-1' },
      }),
    );
    vi.stubGlobal('fetch', fetchMock);
    const result = await fetchNotifications(API_BASE, 'ws-1', {
      limit: 20,
      cursor: 'cursor-0',
      unreadOnly: true,
    });
    expect(result.ok).toBe(true);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain('/api/workspaces/ws-1/notifications?');
    expect(url).toContain('limit=20');
    expect(url).toContain('cursor=cursor-0');
    expect(url).toContain('unreadOnly=true');
    expect(init.credentials).toBe('include');
  });

  it('serializes the backend type filter and combines it with unreadOnly', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        jsonResponse(200, { notifications: [], pageInfo: { hasMore: false, nextCursor: null } }),
      );
    vi.stubGlobal('fetch', fetchMock);
    await fetchNotifications(API_BASE, 'ws-1', { unreadOnly: true, type: 'THREAD_REPLY' });
    const [url] = fetchMock.mock.calls[0] as [string];
    expect(url).toContain('unreadOnly=true');
    expect(url).toContain('type=THREAD_REPLY');
  });

  it('omits unset options and maps error outcomes', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        jsonResponse(200, { notifications: [], pageInfo: { hasMore: false, nextCursor: null } }),
      );
    vi.stubGlobal('fetch', fetchMock);
    await fetchNotifications(API_BASE, 'ws-1');
    const [url] = fetchMock.mock.calls[0] as [string];
    expect(url.endsWith('/api/workspaces/ws-1/notifications')).toBe(true);

    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(401, {})));
    expect(await fetchNotifications(API_BASE, 'ws-1')).toEqual({
      ok: false,
      unauthenticated: true,
    });

    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(jsonResponse(404, { error: { message: 'Workspace not found.' } })),
    );
    expect(await fetchNotifications(API_BASE, 'ws-1')).toEqual({
      ok: false,
      kind: 'notFound',
      message: 'Workspace not found.',
    });

    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('down')));
    expect(await fetchNotifications(API_BASE, 'ws-1')).toEqual({
      ok: false,
      kind: 'error',
      message: 'Failed to load notifications.',
    });
  });

  it('rejects malformed bodies', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(200, { notifications: [{}] }));
    vi.stubGlobal('fetch', fetchMock);
    const result = await fetchNotifications(API_BASE, 'ws-1');
    expect(result.ok).toBe(false);
  });
});

describe('markNotificationRead / markAllNotificationsRead', () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  it('posts to the item endpoint and parses the row', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        jsonResponse(200, { notification: { ...ITEM_JSON, readAt: '2026-09-06T13:00:00.000Z' } }),
      );
    vi.stubGlobal('fetch', fetchMock);
    const result = await markNotificationRead(API_BASE, 'ws-1', 'n-1');
    expect(result.ok).toBe(true);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain('/api/workspaces/ws-1/notifications/n-1/read');
    expect(init.method).toBe('POST');
    if (result.ok) {
      expect(result.data.readAt).toEqual(new Date('2026-09-06T13:00:00.000Z'));
    }
  });

  it('posts read-all and parses the count', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(200, { updatedCount: 3 }));
    vi.stubGlobal('fetch', fetchMock);
    const result = await markAllNotificationsRead(API_BASE, 'ws-1');
    expect(result).toEqual({ ok: true, data: { updatedCount: 3 } });
    const [url] = fetchMock.mock.calls[0] as [string];
    expect(url).toContain('/api/workspaces/ws-1/notifications/read-all');
  });

  it('maps 401/404/network outcomes', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(401, {})));
    expect(await markNotificationRead(API_BASE, 'ws-1', 'n-1')).toEqual({
      ok: false,
      unauthenticated: true,
    });
    expect(await markAllNotificationsRead(API_BASE, 'ws-1')).toEqual({
      ok: false,
      unauthenticated: true,
    });

    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(404, {})));
    const missing = await markNotificationRead(API_BASE, 'ws-1', 'n-x');
    expect(missing.ok).toBe(false);
    if (!missing.ok && !('unauthenticated' in missing)) {
      expect(missing.kind).toBe('notFound');
    }

    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('down')));
    expect((await markAllNotificationsRead(API_BASE, 'ws-1')).ok).toBe(false);
  });
});

describe('searchNotificationUrl', () => {
  const base = {
    id: 'n-1',
    type: 'MENTION' as const,
    workspaceId: 'ws-1',
    recipientUserId: 'u-1',
    actorUserId: 'u-2',
    actorName: 'Grace Hopper',
    actorImage: null,
    conversationId: null,
    channelId: 'ch-1',
    threadRootMessageId: null,
    channelName: 'general',
    conversationName: null,
    createdAt: new Date('2026-09-06T12:00:00.000Z'),
    readAt: null,
  };

  it('links channel roots, DM roots, and thread replies', () => {
    expect(
      searchNotificationUrl({ ...base, messageId: 'm-1' }, new Map([['ch-1', 'general']])),
    ).toBe('/app/channels/general?message=m-1');
    expect(
      searchNotificationUrl(
        { ...base, messageId: 'm-2', threadRootMessageId: 'm-root', channelId: 'ch-1' },
        new Map([['ch-1', 'general']]),
      ),
    ).toBe('/app/channels/general?message=m-root&reply=m-2');
    expect(
      searchNotificationUrl(
        { ...base, messageId: 'm-3', channelId: null, conversationId: 'dm-1' },
        new Map(),
      ),
    ).toBe('/app/dms/dm-1?message=m-3');
    expect(
      searchNotificationUrl(
        {
          ...base,
          messageId: 'm-4',
          threadRootMessageId: 'm-root',
          channelId: null,
          conversationId: 'dm-2',
        },
        new Map(),
      ),
    ).toBe('/app/dms/dm-2?message=m-root&reply=m-4');
  });

  it('returns null when navigation is impossible', () => {
    // Deleted source: no message to locate.
    expect(
      searchNotificationUrl({ ...base, messageId: null }, new Map([['ch-1', 'general']])),
    ).toBeNull();
    // Unknown channel slug: never fabricate a route.
    expect(searchNotificationUrl({ ...base, messageId: 'm-1' }, new Map())).toBeNull();
    // No container at all.
    expect(
      searchNotificationUrl({ ...base, messageId: 'm-1', channelId: null }, new Map()),
    ).toBeNull();
  });
});
