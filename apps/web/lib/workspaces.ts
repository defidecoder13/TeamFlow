/**
 * Workspace API client for the web app (Phase 2B).
 *
 * Thin fetch wrapper over the approved Express contract
 * (`GET /api/workspaces` → `{ workspaces: [...] }`). Session cookies travel
 * via `credentials: 'include'`, matching the auth client. No HTTP library,
 * no global store — callers own their state.
 *
 * API payloads are validated at runtime before use: TypeScript types describe
 * the contract, but only `parseWorkspacesResponse` decides what the app
 * trusts. Malformed data is rejected, never rendered.
 */

import { authedFetch } from './session-token';
export const WORKSPACE_ROLES = ['OWNER', 'ADMIN', 'MEMBER'] as const;

export type WorkspaceRole = (typeof WORKSPACE_ROLES)[number];

/** Workspace summary as returned by the API, including the caller's own role. */
export interface WorkspaceSummary {
  id: string;
  name: string;
  slug: string;
  role: WorkspaceRole;
  createdAt: string;
  updatedAt: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isWorkspaceSummary(value: unknown): value is WorkspaceSummary {
  if (!isRecord(value)) {
    return false;
  }
  return (
    typeof value.id === 'string' &&
    value.id.length > 0 &&
    typeof value.name === 'string' &&
    value.name.length > 0 &&
    typeof value.slug === 'string' &&
    value.slug.length > 0 &&
    typeof value.role === 'string' &&
    (WORKSPACE_ROLES as readonly string[]).includes(value.role) &&
    typeof value.createdAt === 'string' &&
    typeof value.updatedAt === 'string'
  );
}

/**
 * Validate an unknown `GET /api/workspaces` payload. Returns the workspace
 * list, or null when the shape is not trustworthy. Unknown extra fields are
 * ignored so the client stays forward-compatible.
 */
export function parseWorkspacesResponse(value: unknown): WorkspaceSummary[] | null {
  if (!isRecord(value) || !Array.isArray(value.workspaces)) {
    return null;
  }
  if (!value.workspaces.every(isWorkspaceSummary)) {
    return null;
  }
  return value.workspaces;
}

export type FetchWorkspacesResult =
  { ok: true; workspaces: WorkspaceSummary[] } | { ok: false; unauthenticated: boolean };

/** Load the caller's workspaces. Never throws — failures are values. */
export async function fetchWorkspaces(apiBaseUrl: string): Promise<FetchWorkspacesResult> {
  let response: Response;
  try {
    response = await authedFetch(`${apiBaseUrl}/api/workspaces`, {
      credentials: 'include',
      cache: 'no-store',
    });
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
  const workspaces = parseWorkspacesResponse(body);
  if (!workspaces) {
    return { ok: false, unauthenticated: false };
  }
  return { ok: true, workspaces };
}

/**
 * Deterministic current-workspace choice: the first workspace the API
 * returned (the API orders by creation time). Isolated here so it can grow
 * into persistent selection later without touching callers. No database
 * preference, no localStorage, no URL routing in this phase.
 */
export function selectInitialWorkspace(
  workspaces: readonly WorkspaceSummary[],
): WorkspaceSummary | null {
  return workspaces.length > 0 ? workspaces[0]! : null;
}

/** Mirrors the API contract (max 100 chars); the server remains authoritative. */
export const MAX_WORKSPACE_NAME_LENGTH = 100;

/** Client-side workspace-name check; returns a message or null when valid. */
export function validateWorkspaceName(value: string): string | null {
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return 'Workspace name is required.';
  }
  if (trimmed.length > MAX_WORKSPACE_NAME_LENGTH) {
    return `Use ${MAX_WORKSPACE_NAME_LENGTH} characters or fewer.`;
  }
  return null;
}

export type CreateWorkspaceResult =
  | { ok: true; workspace: WorkspaceSummary }
  | { ok: false; kind: 'unauthenticated' }
  | { ok: false; kind: 'validation'; message: string }
  | { ok: false; kind: 'conflict'; message: string }
  | { ok: false; kind: 'failed' };

const CREATE_FALLBACK_MESSAGE = "We couldn't create the workspace. Please try again.";
const UPDATE_FALLBACK_MESSAGE = "We couldn't update the workspace. Please try again.";
const DELETE_FALLBACK_MESSAGE = "We couldn't delete the workspace. Please try again.";

/** Safe server-provided message ({ error: { message } }), else the fallback. */
function serverMessage(body: unknown, fallback: string): string {
  if (isRecord(body) && isRecord(body.error) && typeof body.error.message === 'string') {
    const message = body.error.message.trim();
    if (message.length > 0) {
      return message;
    }
  }
  return fallback;
}

/**
 * Create a workspace via `POST /api/workspaces` with ONLY the supported
 * fields (`name`, optional `slug`). Ownership stays server-side. Never
 * throws — failures are values with safe, displayable messages.
 */
export async function createWorkspace(
  apiBaseUrl: string,
  name: string,
  slug?: string,
): Promise<CreateWorkspaceResult> {
  let response: Response;
  try {
    response = await authedFetch(`${apiBaseUrl}/api/workspaces`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(slug ? { name, slug } : { name }),
    });
  } catch {
    return { ok: false, kind: 'failed' };
  }
  if (response.status === 401) {
    return { ok: false, kind: 'unauthenticated' };
  }
  let body: unknown = null;
  try {
    body = await response.json();
  } catch {
    body = null;
  }
  if (response.status === 201) {
    const workspace = isRecord(body) && isWorkspaceSummary(body.workspace) ? body.workspace : null;
    if (!workspace) {
      return { ok: false, kind: 'failed' };
    }
    return { ok: true, workspace };
  }
  if (response.status === 400) {
    return {
      ok: false,
      kind: 'validation',
      message: serverMessage(body, CREATE_FALLBACK_MESSAGE),
    };
  }
  if (response.status === 409) {
    return { ok: false, kind: 'conflict', message: serverMessage(body, CREATE_FALLBACK_MESSAGE) };
  }
  return { ok: false, kind: 'failed' };
}

export type UpdateWorkspaceResult =
  | { ok: true; workspace: WorkspaceSummary }
  | { ok: false; kind: 'unauthenticated' }
  | { ok: false; kind: 'validation'; message: string }
  | { ok: false; kind: 'forbidden' }
  | { ok: false; kind: 'notFound' }
  | { ok: false; kind: 'failed' };

/**
 * Rename a workspace via PATCH /api/workspaces/:workspaceId.
 * Only name is sent; slug stays server-side immutable.
 */
export async function updateWorkspace(
  apiBaseUrl: string,
  workspaceId: string,
  name: string,
): Promise<UpdateWorkspaceResult> {
  let response: Response;
  try {
    response = await authedFetch(`${apiBaseUrl}/api/workspaces/${encodeURIComponent(workspaceId)}`, {
      method: 'PATCH',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
      cache: 'no-store',
    });
  } catch {
    return { ok: false, kind: 'failed' };
  }
  if (response.status === 401) return { ok: false, kind: 'unauthenticated' };
  let body: unknown = null;
  try {
    body = await response.json();
  } catch {
    body = null;
  }
  if (response.status === 200) {
    const workspace = isRecord(body) && isWorkspaceSummary(body.workspace) ? body.workspace : null;
    if (!workspace) return { ok: false, kind: 'failed' };
    return { ok: true, workspace };
  }
  if (response.status === 400) {
    return { ok: false, kind: 'validation', message: serverMessage(body, UPDATE_FALLBACK_MESSAGE) };
  }
  if (response.status === 403) return { ok: false, kind: 'forbidden' };
  if (response.status === 404) return { ok: false, kind: 'notFound' };
  return { ok: false, kind: 'failed' };
}

export type DeleteWorkspaceResult =
  | { ok: true }
  | { ok: false; kind: 'unauthenticated' }
  | { ok: false; kind: 'forbidden' }
  | { ok: false; kind: 'notFound' }
  | { ok: false; kind: 'failed'; message?: string };

/**
 * Delete a workspace via DELETE /api/workspaces/:workspaceId.
 */
export async function deleteWorkspace(
  apiBaseUrl: string,
  workspaceId: string,
): Promise<DeleteWorkspaceResult> {
  let response: Response;
  try {
    response = await authedFetch(`${apiBaseUrl}/api/workspaces/${encodeURIComponent(workspaceId)}`, {
      method: 'DELETE',
      credentials: 'include',
      cache: 'no-store',
    });
  } catch {
    return { ok: false, kind: 'failed' };
  }
  if (response.status === 401) return { ok: false, kind: 'unauthenticated' };
  if (response.status === 204) return { ok: true };
  let body: unknown = null;
  try {
    body = await response.json();
  } catch {
    body = null;
  }
  if (response.status === 403) return { ok: false, kind: 'forbidden' };
  if (response.status === 404) return { ok: false, kind: 'notFound' };
  return { ok: false, kind: 'failed', message: serverMessage(body, DELETE_FALLBACK_MESSAGE) };
}
