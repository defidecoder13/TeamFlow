/**
 * Threads API client (Audit 11).
 *
 * Thin layer over `GET /api/workspaces/:workspaceId/threads`. Identity and
 * membership resolve server-side from session cookies and the URL; the
 * client never supplies a user or workspace for authorization.
 */

import type { ApiResult } from './messages';

export interface ThreadAuthor {
  id: string;
  name: string;
  email: string;
  image: string | null;
}

export interface ThreadContainer {
  type: 'channel' | 'directMessage';
  id: string;
  name: string;
  slug?: string;
}

export interface ThreadPreview {
  id: string;
  body: string;
  createdAt: Date;
  author: ThreadAuthor;
}

export interface ThreadListItem {
  id: string;
  body: string;
  replyCount: number;
  createdAt: Date;
  latestReplyAt: Date | null;
  author: ThreadAuthor;
  container: ThreadContainer;
  latestReply: ThreadPreview | null;
}

export interface ThreadPageInfo {
  nextCursor: string | null;
  hasMore: boolean;
}

export interface ThreadPage {
  threads: ThreadListItem[];
  pageInfo: ThreadPageInfo;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isDateString(value: unknown): value is string {
  return typeof value === 'string' && !Number.isNaN(Date.parse(value));
}

function isAuthor(value: unknown): value is ThreadAuthor {
  if (!isRecord(value)) return false;
  return (
    typeof value.id === 'string' &&
    value.id.length > 0 &&
    typeof value.name === 'string' &&
    typeof value.email === 'string' &&
    (value.image === null || typeof value.image === 'string')
  );
}

function isContainer(value: unknown): value is ThreadContainer {
  if (!isRecord(value)) return false;
  if (value.type !== 'channel' && value.type !== 'directMessage') return false;
  if (typeof value.id !== 'string' || value.id.length === 0) return false;
  if (typeof value.name !== 'string') return false;
  if (value.slug !== undefined && typeof value.slug !== 'string') return false;
  return true;
}

function isPreview(value: unknown): value is ThreadPreview {
  if (!isRecord(value)) return false;
  return (
    typeof value.id === 'string' &&
    value.id.length > 0 &&
    typeof value.body === 'string' &&
    isDateString(value.createdAt) &&
    isAuthor(value.author)
  );
}

function isThreadListItem(value: unknown): value is ThreadListItem {
  if (!isRecord(value)) return false;
  if (typeof value.id !== 'string' || value.id.length === 0) return false;
  if (typeof value.body !== 'string') return false;
  if (typeof value.replyCount !== 'number' || value.replyCount < 0) return false;
  if (!isDateString(value.createdAt)) return false;
  if (value.latestReplyAt !== null && !isDateString(value.latestReplyAt)) return false;
  if (!isAuthor(value.author)) return false;
  if (!isContainer(value.container)) return false;
  if (value.latestReply !== null && !isPreview(value.latestReply)) return false;
  return true;
}

function isThreadPage(value: unknown): value is ThreadPage {
  if (!isRecord(value)) return false;
  if (!Array.isArray(value.threads)) return false;
  if (!value.threads.every(isThreadListItem)) return false;
  if (!isRecord(value.pageInfo)) return false;
  if (typeof value.pageInfo.hasMore !== 'boolean') return false;
  if (
    value.pageInfo.nextCursor !== null &&
    typeof value.pageInfo.nextCursor !== 'string'
  ) {
    return false;
  }
  return true;
}

function normalizePage(page: ThreadPage): ThreadPage {
  return {
    ...page,
    threads: page.threads.map((t) => ({
      ...t,
      createdAt: new Date(t.createdAt),
      latestReplyAt: t.latestReplyAt ? new Date(t.latestReplyAt) : null,
      latestReply: t.latestReply
        ? { ...t.latestReply, createdAt: new Date(t.latestReply.createdAt) }
        : null,
    })),
  };
}

export async function fetchWorkspaceThreads(
  apiBase: string,
  workspaceId: string,
  options?: { limit?: number; cursor?: string },
): Promise<ApiResult<ThreadPage>> {
  const params = new URLSearchParams();
  if (options?.limit && options.limit > 0) {
    params.set('limit', String(options.limit));
  }
  if (options?.cursor) {
    params.set('cursor', options.cursor);
  }
  const query = params.toString();
  const url = `/api/workspaces/${encodeURIComponent(workspaceId)}/threads${query ? `?${query}` : ''}`;

  let res: Response;
  try {
    res = await fetch(`${apiBase}${url}`, {
      method: 'GET',
      headers: { Accept: 'application/json' },
      credentials: 'include',
    });
  } catch {
    return { ok: false, kind: 'error', message: 'Failed to load threads' };
  }
  if (res.status === 401) {
    return { ok: false, unauthenticated: true };
  }
  if (res.status === 404) {
    return { ok: false, kind: 'notFound', message: 'Workspace not found' };
  }
  if (res.status === 403) {
    return { ok: false, kind: 'forbidden', message: 'You do not have permission to view threads' };
  }
  if (!res.ok) {
    let body = '';
    try {
      body = await res.text();
    } catch {
      // ignore
    }
    return { ok: false, kind: 'error', message: body || 'Failed to load threads' };
  }

  let json: unknown;
  try {
    json = await res.json();
  } catch {
    return { ok: false, kind: 'error', message: 'Failed to load threads' };
  }
  if (!isThreadPage(json)) {
    return { ok: false, kind: 'error', message: 'Failed to load threads' };
  }
  return { ok: true, data: normalizePage(json) };
}
