/**
 * Workspace members API client (Phase 2E).
 *
 * Thin fetch wrapper over `GET /api/workspaces/:workspaceId/members`.
 * Same conventions as the workspace client: credentials included, payloads
 * runtime-validated before use, failures returned as values — never thrown.
 */

import { WORKSPACE_ROLES, type WorkspaceRole } from './workspaces';

/** Member record as returned by the API: identity + role only. */
export interface WorkspaceMember {
  id: string;
  role: WorkspaceRole;
  createdAt: string;
  user: {
    id: string;
    name: string;
    email: string;
    image: string | null;
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isWorkspaceMember(value: unknown): value is WorkspaceMember {
  if (!isRecord(value)) {
    return false;
  }
  if (
    typeof value.id !== 'string' ||
    value.id.length === 0 ||
    typeof value.role !== 'string' ||
    !(WORKSPACE_ROLES as readonly string[]).includes(value.role) ||
    typeof value.createdAt !== 'string'
  ) {
    return false;
  }
  if (!isRecord(value.user)) {
    return false;
  }
  const user = value.user;
  return (
    typeof user.id === 'string' &&
    user.id.length > 0 &&
    typeof user.name === 'string' &&
    user.name.length > 0 &&
    typeof user.email === 'string' &&
    user.email.length > 0 &&
    (user.image === null || typeof user.image === 'string')
  );
}

/**
 * Validate an unknown members payload. Returns the member list, or null
 * when the shape is not trustworthy. Extra fields are ignored.
 */
export function parseMembersResponse(value: unknown): WorkspaceMember[] | null {
  if (!isRecord(value) || !Array.isArray(value.members)) {
    return null;
  }
  if (!value.members.every(isWorkspaceMember)) {
    return null;
  }
  return value.members;
}

export type FetchMembersResult =
  { ok: true; members: WorkspaceMember[] } | { ok: false; unauthenticated: boolean };

/** Load a workspace's members. Never throws — failures are values. */
export async function fetchWorkspaceMembers(
  apiBaseUrl: string,
  workspaceId: string,
): Promise<FetchMembersResult> {
  let response: Response;
  try {
    response = await fetch(
      `${apiBaseUrl}/api/workspaces/${encodeURIComponent(workspaceId)}/members`,
      { credentials: 'include', cache: 'no-store' },
    );
  } catch {
    return { ok: false, unauthenticated: false };
  }
  if (response.status === 401) {
    return { ok: false, unauthenticated: true };
  }
  if (!response.ok) {
    return { ok: false, unauthenticated: false };
  }
  let body: unknown;
  try {
    body = await response.json();
  } catch {
    return { ok: false, unauthenticated: false };
  }
  const members = parseMembersResponse(body);
  if (!members) {
    return { ok: false, unauthenticated: false };
  }
  return { ok: true, members };
}

function memberUrl(apiBaseUrl: string, workspaceId: string, userId?: string): string {
  const base = `${apiBaseUrl}/api/workspaces/${encodeURIComponent(workspaceId)}/members`;
  return userId ? `${base}/${encodeURIComponent(userId)}` : base;
}

function serverMessage(body: unknown, fallback: string): string {
  if (
    typeof body === 'object' &&
    body !== null &&
    'error' in body &&
    typeof (body as { error: unknown }).error === 'object' &&
    (body as { error: { message?: unknown } }).error !== null &&
    typeof (body as { error: { message?: unknown } }).error.message === 'string'
  ) {
    const msg = (body as { error: { message: string } }).error.message.trim();
    if (msg.length > 0) return msg;
  }
  return fallback;
}

async function readJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

export type UpdateMemberRoleResult =
  | { ok: true; member: WorkspaceMember }
  | {
      ok: false;
      kind: 'unauthenticated' | 'forbidden' | 'notFound' | 'conflict' | 'validation' | 'failed';
      message?: string;
    };

export async function updateWorkspaceMemberRole(
  apiBaseUrl: string,
  workspaceId: string,
  userId: string,
  role: WorkspaceRole,
): Promise<UpdateMemberRoleResult> {
  let response: Response;
  try {
    response = await fetch(memberUrl(apiBaseUrl, workspaceId, userId), {
      method: 'PATCH',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ role }),
    });
  } catch {
    return { ok: false, kind: 'failed' };
  }
  if (response.status === 401) return { ok: false, kind: 'unauthenticated' };
  const body = await readJson(response);
  if (response.status === 200) {
    const member =
      body && isRecord(body) && isWorkspaceMember((body as { member: unknown }).member)
        ? (body as { member: WorkspaceMember }).member
        : null;
    if (!member) return { ok: false, kind: 'failed' };
    return { ok: true, member };
  }
  if (response.status === 400)
    return { ok: false, kind: 'validation', message: serverMessage(body, 'Invalid role.') };
  if (response.status === 403) return { ok: false, kind: 'forbidden' };
  if (response.status === 404) return { ok: false, kind: 'notFound' };
  if (response.status === 409)
    return { ok: false, kind: 'conflict', message: serverMessage(body, 'Conflict.') };
  return { ok: false, kind: 'failed' };
}

export type RemoveMemberResult =
  | { ok: true }
  | {
      ok: false;
      kind: 'unauthenticated' | 'forbidden' | 'notFound' | 'conflict' | 'failed';
      message?: string;
    };

export async function removeWorkspaceMember(
  apiBaseUrl: string,
  workspaceId: string,
  userId: string,
): Promise<RemoveMemberResult> {
  let response: Response;
  try {
    response = await fetch(memberUrl(apiBaseUrl, workspaceId, userId), {
      method: 'DELETE',
      credentials: 'include',
    });
  } catch {
    return { ok: false, kind: 'failed' };
  }
  if (response.status === 401) return { ok: false, kind: 'unauthenticated' };
  if (response.status === 204) return { ok: true };
  const body = await readJson(response);
  if (response.status === 403) return { ok: false, kind: 'forbidden' };
  if (response.status === 404) return { ok: false, kind: 'notFound' };
  if (response.status === 409)
    return { ok: false, kind: 'conflict', message: serverMessage(body, 'Conflict.') };
  return { ok: false, kind: 'failed' };
}
