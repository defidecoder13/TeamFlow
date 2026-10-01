/**
 * Notification API client (Phase 4H.7).
 *
 * Thin layer over the 4H.5 notification endpoints. Consumes the established
 * response envelope (`{ notifications, pageInfo }`); identity always resolves
 * server-side from session cookies. No rendering, no state here.
 */

import type { ApiResult } from './messages';
import { authedFetch } from './session-token';

export type NotificationType = 'MENTION' | 'DM_MESSAGE' | 'GROUP_MESSAGE' | 'THREAD_REPLY';

export interface NotificationItem {
  id: string;
  type: NotificationType;
  workspaceId: string;
  recipientUserId: string;
  actorUserId: string;
  actorName: string;
  actorImage: string | null;
  messageId: string | null;
  conversationId: string | null;
  channelId: string | null;
  threadRootMessageId: string | null;
  channelName: string | null;
  conversationName: string | null;
  createdAt: Date;
  readAt: Date | null;
}

export interface NotificationPageInfo {
  nextCursor: string | null;
  hasMore: boolean;
}

export interface NotificationPage {
  notifications: NotificationItem[];
  pageInfo: NotificationPageInfo;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isDateString(value: unknown): value is string {
  return typeof value === 'string' && !Number.isNaN(Date.parse(value));
}

function isNotificationType(value: unknown): value is NotificationType {
  return (
    value === 'MENTION' ||
    value === 'DM_MESSAGE' ||
    value === 'GROUP_MESSAGE' ||
    value === 'THREAD_REPLY'
  );
}

function isNotificationItem(value: unknown): value is Omit<
  NotificationItem,
  'createdAt' | 'readAt'
> & {
  createdAt: string;
  readAt: string | null;
} {
  if (!isRecord(value)) {
    return false;
  }
  const stringOrNull = (field: string): boolean =>
    value[field] === null || typeof value[field] === 'string';
  return (
    typeof value.id === 'string' &&
    value.id.length > 0 &&
    isNotificationType(value.type) &&
    typeof value.workspaceId === 'string' &&
    typeof value.recipientUserId === 'string' &&
    typeof value.actorUserId === 'string' &&
    typeof value.actorName === 'string' &&
    (typeof value.actorImage === 'string' || value.actorImage === null) &&
    (typeof value.messageId === 'string' || value.messageId === null) &&
    (typeof value.conversationId === 'string' || value.conversationId === null) &&
    (typeof value.channelId === 'string' || value.channelId === null) &&
    (typeof value.threadRootMessageId === 'string' || value.threadRootMessageId === null) &&
    stringOrNull('channelName') &&
    stringOrNull('conversationName') &&
    isDateString(value.createdAt) &&
    (value.readAt === null || isDateString(value.readAt))
  );
}

export function notificationFromJson(value: unknown): NotificationItem | null {
  if (!isNotificationItem(value)) {
    return null;
  }
  return {
    ...value,
    createdAt: new Date(value.createdAt),
    readAt: value.readAt === null ? null : new Date(value.readAt),
  };
}

function errorMessage(fallback: string): (res: Response) => Promise<string> {
  return async (res: Response) => {
    try {
      const json: unknown = await res.json();
      if (isRecord(json) && isRecord(json.error) && typeof json.error.message === 'string') {
        return json.error.message;
      }
    } catch {
      // Fall through to the fallback message.
    }
    return fallback;
  };
}

const listErrorMessage = errorMessage('Failed to load notifications.');
const readErrorMessage = errorMessage('Failed to mark notification as read.');

async function getJson(res: Response): Promise<unknown> {
  try {
    return await res.json();
  } catch {
    return null;
  }
}

export interface NotificationListOptions {
  limit?: number;
  cursor?: string;
  unreadOnly?: boolean;
  type?: NotificationType;
  signal?: AbortSignal;
}

/**
 * Popover filter state. Mirrors the backend list parameters exactly —
 * `unreadOnly` and `type` combine server-side. No client-side filtering.
 */
export interface NotificationFilter {
  unreadOnly: boolean;
  type?: NotificationType;
}

export const DEFAULT_NOTIFICATION_FILTER: NotificationFilter = { unreadOnly: false };

/** Backend-supported types only — never invented categories. */
export const NOTIFICATION_TYPE_FILTERS: Array<{ value: NotificationType; label: string }> = [
  { value: 'MENTION', label: 'Mentions' },
  { value: 'DM_MESSAGE', label: 'Direct messages' },
  { value: 'GROUP_MESSAGE', label: 'Group messages' },
  { value: 'THREAD_REPLY', label: 'Thread replies' },
];

export function notificationFilterKey(filter: NotificationFilter): string {
  return `${filter.unreadOnly ? 'unread' : 'all'}:${filter.type ?? ''}`;
}

/** Whether a realtime item belongs in a filtered list. */
export function matchesNotificationFilter(
  item: Pick<NotificationItem, 'readAt' | 'type'>,
  filter: NotificationFilter,
): boolean {
  if (filter.unreadOnly && item.readAt !== null) return false;
  if (filter.type !== undefined && item.type !== filter.type) return false;
  return true;
}

// ---------------------------------------------------------------------------
// Deep links: channel/DM/thread navigation for notifications.
// Reuses the search deep-link URL/state conventions:
// roots link with ?message=<id>, replies add &reply=<replyId>.
// Returns null when navigation is impossible (deleted source, unknown
// channel slug) — callers render history without a link, never a dead URL.
// ---------------------------------------------------------------------------

export function searchNotificationUrl(
  item: Pick<
    NotificationItem,
    'messageId' | 'threadRootMessageId' | 'channelId' | 'conversationId'
  >,
  channelSlugById: Map<string, string>,
): string | null {
  if (item.threadRootMessageId && item.messageId) {
    if (item.channelId) {
      const slug = channelSlugById.get(item.channelId);
      if (!slug) {
        return null;
      }
      return `/app/channels/${encodeURIComponent(slug)}?message=${encodeURIComponent(item.threadRootMessageId)}&reply=${encodeURIComponent(item.messageId)}`;
    }
    if (item.conversationId) {
      return `/app/dms/${encodeURIComponent(item.conversationId)}?message=${encodeURIComponent(item.threadRootMessageId)}&reply=${encodeURIComponent(item.messageId)}`;
    }
    return null;
  }
  if (item.messageId && item.channelId) {
    const slug = channelSlugById.get(item.channelId);
    if (!slug) {
      return null;
    }
    return `/app/channels/${encodeURIComponent(slug)}?message=${encodeURIComponent(item.messageId)}`;
  }
  if (item.messageId && item.conversationId) {
    return `/app/dms/${encodeURIComponent(item.conversationId)}?message=${encodeURIComponent(item.messageId)}`;
  }
  return null;
}

/**
 * Fetch one page of the caller's notifications in a workspace. Server order
 * (createdAt DESC, id DESC) is preserved verbatim — never re-sorted here.
 */
export async function fetchNotifications(
  apiBase: string,
  workspaceId: string,
  options?: NotificationListOptions,
): Promise<ApiResult<NotificationPage>> {
  const params = new URLSearchParams();
  if (options?.limit && options.limit > 0) {
    params.set('limit', String(options.limit));
  }
  if (options?.cursor) {
    params.set('cursor', options.cursor);
  }
  if (options?.unreadOnly) {
    params.set('unreadOnly', 'true');
  }
  if (options?.type) {
    params.set('type', options.type);
  }
  const query = params.toString();
  const url =
    `${apiBase}/api/workspaces/${encodeURIComponent(workspaceId)}/notifications` +
    (query ? `?${query}` : '');
  let res: Response;
  try {
    res = await authedFetch(url, {
      method: 'GET',
      headers: { Accept: 'application/json' },
      credentials: 'include',
      signal: options?.signal,
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw error;
    }
    return { ok: false, kind: 'error', message: 'Failed to load notifications.' };
  }
  if (res.status === 401) {
    return { ok: false, unauthenticated: true };
  }
  if (res.status === 404) {
    return { ok: false, kind: 'notFound', message: await listErrorMessage(res) };
  }
  if (!res.ok) {
    return { ok: false, kind: 'error', message: await listErrorMessage(res) };
  }
  const json = await getJson(res);
  if (
    !isRecord(json) ||
    !Array.isArray(json.notifications) ||
    !isRecord(json.pageInfo) ||
    typeof json.pageInfo.hasMore !== 'boolean' ||
    (json.pageInfo.nextCursor !== null && typeof json.pageInfo.nextCursor !== 'string')
  ) {
    return { ok: false, kind: 'error', message: 'Failed to load notifications.' };
  }
  const notifications: NotificationItem[] = [];
  for (const item of json.notifications) {
    const parsed = notificationFromJson(item);
    if (!parsed) {
      return { ok: false, kind: 'error', message: 'Failed to load notifications.' };
    }
    notifications.push(parsed);
  }
  return {
    ok: true,
    data: {
      notifications,
      pageInfo: { hasMore: json.pageInfo.hasMore, nextCursor: json.pageInfo.nextCursor },
    },
  };
}

/** Mark one notification read. Idempotent server-side; returns the row. */
export async function markNotificationRead(
  apiBase: string,
  workspaceId: string,
  notificationId: string,
): Promise<ApiResult<NotificationItem>> {
  let res: Response;
  try {
    res = await authedFetch(
      `${apiBase}/api/workspaces/${encodeURIComponent(workspaceId)}/notifications/${encodeURIComponent(notificationId)}/read`,
      { method: 'POST', headers: { Accept: 'application/json' }, credentials: 'include' },
    );
  } catch {
    return { ok: false, kind: 'error', message: 'Failed to mark notification as read.' };
  }
  if (res.status === 401) {
    return { ok: false, unauthenticated: true };
  }
  if (res.status === 404) {
    return { ok: false, kind: 'notFound', message: await readErrorMessage(res) };
  }
  if (!res.ok) {
    return { ok: false, kind: 'error', message: await readErrorMessage(res) };
  }
  const json = await getJson(res);
  if (!isRecord(json)) {
    return { ok: false, kind: 'error', message: 'Failed to mark notification as read.' };
  }
  const parsed = notificationFromJson(json.notification);
  if (!parsed) {
    return { ok: false, kind: 'error', message: 'Failed to mark notification as read.' };
  }
  return { ok: true, data: parsed };
}

/** Mark all unread notifications read in a workspace. Returns the count. */
export async function markAllNotificationsRead(
  apiBase: string,
  workspaceId: string,
): Promise<ApiResult<{ updatedCount: number }>> {
  let res: Response;
  try {
    res = await authedFetch(
      `${apiBase}/api/workspaces/${encodeURIComponent(workspaceId)}/notifications/read-all`,
      { method: 'POST', headers: { Accept: 'application/json' }, credentials: 'include' },
    );
  } catch {
    return { ok: false, kind: 'error', message: 'Failed to mark all as read.' };
  }
  if (res.status === 401) {
    return { ok: false, unauthenticated: true };
  }
  if (res.status === 404) {
    return { ok: false, kind: 'error', message: await readErrorMessage(res) };
  }
  if (!res.ok) {
    return { ok: false, kind: 'error', message: await readErrorMessage(res) };
  }
  const json = await getJson(res);
  if (!isRecord(json) || typeof json.updatedCount !== 'number') {
    return { ok: false, kind: 'error', message: 'Failed to mark all as read.' };
  }
  return { ok: true, data: { updatedCount: json.updatedCount } };
}
