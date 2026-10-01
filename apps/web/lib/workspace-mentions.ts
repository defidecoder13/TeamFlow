/**
 * Workspace mentions API client (Audit 12).
 *
 * Thin layer over `GET /api/workspaces/:workspaceId/mentions`. Identity and
 * membership resolve server-side from session cookies and the URL; the
 * client never supplies a user or workspace for authorization.
 */

import type { ApiResult } from './messages';

export interface MentionAuthor {
  id: string;
  name: string;
  email: string;
  image: string | null;
}

export interface MentionContainer {
  type: 'channel' | 'directMessage';
  id: string;
  name: string;
  slug?: string;
}

export interface MentionListItem {
  id: string;
  body: string;
  createdAt: Date;
  parentMessageId: string | null;
  author: MentionAuthor;
  container: MentionContainer;
}

export interface MentionPageInfo {
  nextCursor: string | null;
  hasMore: boolean;
}

export interface MentionPage {
  mentions: MentionListItem[];
  pageInfo: MentionPageInfo;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isDateString(value: unknown): value is string {
  return typeof value === 'string' && !Number.isNaN(Date.parse(value));
}

function isAuthor(value: unknown): value is MentionAuthor {
  if (!isRecord(value)) return false;
  return (
    typeof value.id === 'string' &&
    value.id.length > 0 &&
    typeof value.name === 'string' &&
    typeof value.email === 'string' &&
    (value.image === null || typeof value.image === 'string')
  );
}

function isContainer(value: unknown): value is MentionContainer {
  if (!isRecord(value)) return false;
  if (value.type !== 'channel' && value.type !== 'directMessage') return false;
  if (typeof value.id !== 'string' || value.id.length === 0) return false;
  if (typeof value.name !== 'string') return false;
  if (value.slug !== undefined && typeof value.slug !== 'string') return false;
  return true;
}

function isMentionListItem(value: unknown): value is MentionListItem {
  if (!isRecord(value)) return false;
  if (typeof value.id !== 'string' || value.id.length === 0) return false;
  if (typeof value.body !== 'string') return false;
  if (!isDateString(value.createdAt)) return false;
  if (value.parentMessageId !== null && typeof value.parentMessageId !== 'string') return false;
  if (!isAuthor(value.author)) return false;
  if (!isContainer(value.container)) return false;
  return true;
}

function isMentionPage(value: unknown): value is MentionPage {
  if (!isRecord(value)) return false;
  if (!Array.isArray(value.mentions)) return false;
  if (!value.mentions.every(isMentionListItem)) return false;
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

function normalizePage(page: MentionPage): MentionPage {
  return {
    ...page,
    mentions: page.mentions.map((m) => ({
      ...m,
      createdAt: new Date(m.createdAt),
    })),
  };
}

export async function fetchWorkspaceMentions(
  apiBase: string,
  workspaceId: string,
  options?: { limit?: number; cursor?: string },
): Promise<ApiResult<MentionPage>> {
  const params = new URLSearchParams();
  if (options?.limit && options.limit > 0) {
    params.set('limit', String(options.limit));
  }
  if (options?.cursor) {
    params.set('cursor', options.cursor);
  }
  const query = params.toString();
  const url = `/api/workspaces/${encodeURIComponent(workspaceId)}/mentions${query ? `?${query}` : ''}`;

  let res: Response;
  try {
    res = await fetch(`${apiBase}${url}`, {
      method: 'GET',
      headers: { Accept: 'application/json' },
      credentials: 'include',
    });
  } catch {
    return { ok: false, kind: 'error', message: 'Failed to load mentions' };
  }
  if (res.status === 401) {
    return { ok: false, unauthenticated: true };
  }
  if (res.status === 404) {
    return { ok: false, kind: 'notFound', message: 'Workspace not found' };
  }
  if (res.status === 403) {
    return {
      ok: false,
      kind: 'forbidden',
      message: 'You do not have permission to view mentions',
    };
  }
  if (!res.ok) {
    let body = '';
    try {
      body = await res.text();
    } catch {
      // ignore
    }
    return { ok: false, kind: 'error', message: body || 'Failed to load mentions' };
  }

  let json: unknown;
  try {
    json = await res.json();
  } catch {
    return { ok: false, kind: 'error', message: 'Failed to load mentions' };
  }
  if (!isMentionPage(json)) {
    return { ok: false, kind: 'error', message: 'Failed to load mentions' };
  }
  return { ok: true, data: normalizePage(json) };
}
