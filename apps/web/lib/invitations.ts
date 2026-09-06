/**
 * Workspace invitation API client (Phase 2F-B).
 *
 * Wraps the approved backend contract (`POST/GET .../invitations`,
 * `POST /api/invitations/accept`) with the project's conventions:
 * credentials included, payloads runtime-validated before use, failures
 * returned as values with safe displayable messages — never thrown, never
 * raw.
 *
 * Email delivery does not exist: creation returns the raw token once so the
 * development flow can build a local acceptance URL. The token lives only in
 * memory for that flow — never localStorage, never logged.
 */

export interface InvitationInvitee {
  id: string;
  name: string;
  email: string;
}

export interface PendingInvitation {
  id: string;
  email: string;
  expiresAt: string;
  createdAt: string;
  invitedBy: InvitationInvitee;
}

export interface CreatedInvitation {
  id: string;
  email: string;
  expiresAt: string;
  createdAt: string;
  token: string;
}

export type CreateInvitationResult =
  | { ok: true; invitation: CreatedInvitation }
  | { ok: false; kind: 'unauthenticated' }
  | { ok: false; kind: 'validation'; message: string }
  | { ok: false; kind: 'conflict'; message: string }
  | { ok: false; kind: 'failed' };

export type AcceptInvitationResult =
  | {
      ok: true;
      workspace: { id: string; name: string; slug: string };
      alreadyMember: boolean;
    }
  | { ok: false; kind: 'unauthenticated' }
  | { ok: false; kind: 'invalid' }
  | { ok: false; kind: 'forbidden'; message: string }
  | { ok: false; kind: 'failed' };

const CREATE_FALLBACK_MESSAGE = "We couldn't create the invitation. Please try again.";
const ACCEPT_FALLBACK_MESSAGE = "We couldn't accept the invitation. Please try again.";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}

function isInvitee(value: unknown): value is InvitationInvitee {
  return (
    isRecord(value) &&
    isNonEmptyString(value.id) &&
    isNonEmptyString(value.name) &&
    isNonEmptyString(value.email)
  );
}

function isCreatedInvitation(value: unknown): value is CreatedInvitation {
  return (
    isRecord(value) &&
    isNonEmptyString(value.id) &&
    isNonEmptyString(value.email) &&
    typeof value.expiresAt === 'string' &&
    typeof value.createdAt === 'string' &&
    isNonEmptyString(value.token)
  );
}

function isPendingInvitation(value: unknown): value is PendingInvitation {
  return (
    isRecord(value) &&
    isNonEmptyString(value.id) &&
    isNonEmptyString(value.email) &&
    typeof value.expiresAt === 'string' &&
    typeof value.createdAt === 'string' &&
    isInvitee(value.invitedBy)
  );
}

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

async function readJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

/** Short runtime date, e.g. "Sep 13, 2026" — always derived from real data. */
export function formatInvitationDate(isoDate: string): string {
  const date = new Date(isoDate);
  if (Number.isNaN(date.getTime())) {
    return isoDate;
  }
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(date);
}

/**
 * Create an invitation for an email address. Sends ONLY `{ email }` —
 * ownership, role, and expiry stay server-side.
 */
export async function createInvitation(
  apiBaseUrl: string,
  workspaceId: string,
  email: string,
): Promise<CreateInvitationResult> {
  let response: Response;
  try {
    response = await fetch(
      `${apiBaseUrl}/api/workspaces/${encodeURIComponent(workspaceId)}/invitations`,
      {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      },
    );
  } catch {
    return { ok: false, kind: 'failed' };
  }
  if (response.status === 401) {
    return { ok: false, kind: 'unauthenticated' };
  }
  const body = await readJson(response);
  if (response.status === 201) {
    const invitation =
      isRecord(body) && isCreatedInvitation(body.invitation) ? body.invitation : null;
    if (!invitation) {
      return { ok: false, kind: 'failed' };
    }
    return { ok: true, invitation };
  }
  if (response.status === 400) {
    return { ok: false, kind: 'validation', message: serverMessage(body, CREATE_FALLBACK_MESSAGE) };
  }
  if (response.status === 409) {
    return { ok: false, kind: 'conflict', message: serverMessage(body, CREATE_FALLBACK_MESSAGE) };
  }
  return { ok: false, kind: 'failed' };
}

/** List a workspace's pending invitations. */
export async function fetchPendingInvitations(
  apiBaseUrl: string,
  workspaceId: string,
): Promise<
  { ok: true; invitations: PendingInvitation[] } | { ok: false; unauthenticated: boolean }
> {
  let response: Response;
  try {
    response = await fetch(
      `${apiBaseUrl}/api/workspaces/${encodeURIComponent(workspaceId)}/invitations`,
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
  const body = await readJson(response);
  if (
    !isRecord(body) ||
    !Array.isArray(body.invitations) ||
    !body.invitations.every(isPendingInvitation)
  ) {
    return { ok: false, unauthenticated: false };
  }
  return { ok: true, invitations: body.invitations };
}

/** Accept an invitation by raw token. Identity comes from the session. */
export async function acceptInvitation(
  apiBaseUrl: string,
  token: string,
): Promise<AcceptInvitationResult> {
  let response: Response;
  try {
    response = await fetch(`${apiBaseUrl}/api/invitations/accept`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token }),
    });
  } catch {
    return { ok: false, kind: 'failed' };
  }
  if (response.status === 401) {
    return { ok: false, kind: 'unauthenticated' };
  }
  const body = await readJson(response);
  if (response.status === 200) {
    const workspace = isRecord(body) ? (body.workspace as Record<string, unknown>) : null;
    if (
      workspace &&
      isNonEmptyString(workspace.id) &&
      isNonEmptyString(workspace.name) &&
      isNonEmptyString(workspace.slug)
    ) {
      return {
        ok: true,
        workspace: { id: workspace.id, name: workspace.name, slug: workspace.slug },
        alreadyMember: (body as { alreadyMember?: unknown }).alreadyMember === true,
      };
    }
    return { ok: false, kind: 'failed' };
  }
  if (response.status === 404) {
    return { ok: false, kind: 'invalid' };
  }
  if (response.status === 403) {
    return { ok: false, kind: 'forbidden', message: serverMessage(body, ACCEPT_FALLBACK_MESSAGE) };
  }
  return { ok: false, kind: 'failed' };
}
