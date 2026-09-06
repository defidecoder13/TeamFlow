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
