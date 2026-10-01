/**
 * Workspace drafts API client (Audit 13).
 *
 * Thin layer over `GET/PUT/DELETE /api/workspaces/:workspaceId/drafts`.
 * Identity and membership resolve server-side from session cookies and the
 * URL; the client never supplies a user or workspace for authorization.
 */

import type { ApiResult, Message } from './messages';

export type DraftTargetKind = 'CHANNEL' | 'DIRECT_MESSAGE' | 'THREAD';

export interface DraftContainer {
  type: 'channel' | 'directMessage' | 'thread';
  id: string;
  name: string;
  slug?: string;
}

export interface DraftListItem {
  id: string;
  body: string;
  targetKind: DraftTargetKind;
  targetId: string;
  createdAt: Date;
  updatedAt: Date;
  container: DraftContainer;
}

export interface DraftListPage {
  drafts: DraftListItem[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isDateString(value: unknown): value is string {
  return typeof value === 'string' && !Number.isNaN(Date.parse(value));
}

function isTargetKind(value: unknown): value is DraftTargetKind {
  return value === 'CHANNEL' || value === 'DIRECT_MESSAGE' || value === 'THREAD';
}

function isContainer(value: unknown): value is DraftContainer {
  if (!isRecord(value)) return false;
  if (
    value.type !== 'channel' &&
    value.type !== 'directMessage' &&
    value.type !== 'thread'
  ) {
    return false;
  }
  if (typeof value.id !== 'string' || value.id.length === 0) return false;
  if (typeof value.name !== 'string') return false;
  if (value.slug !== undefined && typeof value.slug !== 'string') return false;
  return true;
}

function isDraftListItem(value: unknown): value is DraftListItem {
  if (!isRecord(value)) return false;
  if (typeof value.id !== 'string' || value.id.length === 0) return false;
  if (typeof value.body !== 'string') return false;
  if (!isTargetKind(value.targetKind)) return false;
  if (typeof value.targetId !== 'string' || value.targetId.length === 0) return false;
  if (!isDateString(value.createdAt)) return false;
  if (!isDateString(value.updatedAt)) return false;
  if (!isContainer(value.container)) return false;
  return true;
}

function isDraftListPage(value: unknown): value is DraftListPage {
  if (!isRecord(value)) return false;
  if (!Array.isArray(value.drafts)) return false;
  return value.drafts.every(isDraftListItem);
}

function normalizePage(page: DraftListPage): DraftListPage {
  return {
    drafts: page.drafts.map((d) => ({
      ...d,
      createdAt: new Date(d.createdAt),
      updatedAt: new Date(d.updatedAt),
    })),
  };
}

function authError(message: string): ApiResult<never> {
  return { ok: false, kind: 'error', message };
}

async function readJson(res: Response, fallback: string): Promise<unknown | undefined> {
  if (res.status === 401) return { __unauthenticated: true };
  if (!res.ok) {
    let body = '';
    try {
      body = await res.text();
    } catch {
      // ignore
    }
    if (res.status === 404) {
      return { __notFound: true, message: body || 'Workspace not found' };
    }
    if (res.status === 403) {
      return { __forbidden: true, message: body || 'Not permitted' };
    }
    return authError(body || fallback);
  }
  try {
    return await res.json();
  } catch {
    return authError(fallback);
  }
}

export async function fetchWorkspaceDrafts(
  apiBase: string,
  workspaceId: string,
): Promise<ApiResult<DraftListPage>> {
  const url = `/api/workspaces/${encodeURIComponent(workspaceId)}/drafts`;
  let res: Response;
  try {
    res = await fetch(`${apiBase}${url}`, {
      method: 'GET',
      headers: { Accept: 'application/json' },
      credentials: 'include',
    });
  } catch {
    return authError('Failed to load drafts');
  }
  const json = await readJson(res, 'Failed to load drafts');
  if (json === undefined) return authError('Failed to load drafts');
  if (typeof json === 'object' && json !== null) {
    if ('__unauthenticated' in json) return { ok: false, unauthenticated: true };
    if ('__notFound' in json) {
      return {
        ok: false,
        kind: 'notFound',
        message: String((json as { message?: unknown }).message ?? 'Workspace not found'),
      };
    }
    if ('__forbidden' in json) {
      return {
        ok: false,
        kind: 'forbidden',
        message: String((json as { message?: unknown }).message ?? 'Not permitted'),
      };
    }
    if ('ok' in json && (json as { ok?: unknown }).ok === false) {
      return json as ApiResult<never>;
    }
  }
  if (!isDraftListPage(json)) {
    return authError('Failed to load drafts');
  }
  return { ok: true, data: normalizePage(json) };
}

export interface SaveDraftInput {
  targetKind: DraftTargetKind;
  targetId: string;
  body: string;
}

export type SaveDraftResult =
  | { ok: true; draft: DraftListItem | null }
  | { ok: false; unauthenticated?: true; kind?: string; message: string };

export async function saveWorkspaceDraft(
  apiBase: string,
  workspaceId: string,
  input: SaveDraftInput,
): Promise<SaveDraftResult> {
  const url = `/api/workspaces/${encodeURIComponent(workspaceId)}/drafts`;
  let res: Response;
  try {
    res = await fetch(`${apiBase}${url}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      credentials: 'include',
      body: JSON.stringify(input),
    });
  } catch {
    return { ok: false, message: 'Failed to save draft' };
  }
  if (res.status === 401) {
    return { ok: false, unauthenticated: true, message: 'Sign in to save drafts' };
  }
  if (!res.ok) {
    let body = '';
    try {
      body = await res.text();
    } catch {
      // ignore
    }
    return { ok: false, message: body || 'Failed to save draft' };
  }
  let json: unknown;
  try {
    json = await res.json();
  } catch {
    return { ok: false, message: 'Failed to save draft' };
  }
  if (!isRecord(json)) {
    return { ok: false, message: 'Failed to save draft' };
  }
  const draft = json.draft;
  if (draft === null) {
    return { ok: true, draft: null };
  }
  if (!isDraftListItem(draft)) {
    return { ok: false, message: 'Failed to save draft' };
  }
  const [normalized] = normalizePage({ drafts: [draft] }).drafts;
  return { ok: true, draft: normalized ?? null };
}

export type DeleteDraftResult =
  | { ok: true }
  | { ok: false; unauthenticated?: true; message: string };

export async function deleteWorkspaceDraft(
  apiBase: string,
  workspaceId: string,
  draftId: string,
): Promise<DeleteDraftResult> {
  const url = `/api/workspaces/${encodeURIComponent(workspaceId)}/drafts/${encodeURIComponent(draftId)}`;
  let res: Response;
  try {
    res = await fetch(`${apiBase}${url}`, {
      method: 'DELETE',
      headers: { Accept: 'application/json' },
      credentials: 'include',
    });
  } catch {
    return { ok: false, message: 'Failed to discard draft' };
  }
  if (res.status === 401) {
    return { ok: false, unauthenticated: true, message: 'Sign in to manage drafts' };
  }
  if (res.status === 204 || res.ok) {
    return { ok: true };
  }
  return { ok: false, message: 'Failed to discard draft' };
}

// Re-export so callers that only import drafts don't need messages.
export type { Message };
