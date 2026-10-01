/**
 * Client-side presence API and runtime validation (Phase 4I.3).
 *
 * Provides typed REST fetchers for workspace presence snapshots
 * (`GET /api/workspaces/:workspaceId/presence`).
 */

export const PRESENCE_STATUSES = ['ONLINE', 'OFFLINE'] as const;

export type PresenceStatus = (typeof PRESENCE_STATUSES)[number];

export interface UserPresence {
  userId: string;
  status: PresenceStatus;
  lastSeenAt: string | null;
}

export interface WorkspacePresenceResponse {
  presence: UserPresence[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

export function parsePresenceStatus(value: unknown): PresenceStatus | null {
  if (
    typeof value === 'string' &&
    (PRESENCE_STATUSES as readonly string[]).includes(value as PresenceStatus)
  ) {
    return value as PresenceStatus;
  }
  return null;
}

export function parseUserPresence(value: unknown): UserPresence | null {
  if (!isRecord(value)) {
    return null;
  }
  if (typeof value.userId !== 'string' || value.userId.length === 0) {
    return null;
  }
  const status = parsePresenceStatus(value.status);
  if (!status) {
    return null;
  }
  const lastSeenAt =
    typeof value.lastSeenAt === 'string'
      ? value.lastSeenAt
      : value.lastSeenAt === null
        ? null
        : null;

  return {
    userId: value.userId,
    status,
    lastSeenAt,
  };
}

export function parseWorkspacePresenceResponse(value: unknown): UserPresence[] | null {
  if (!isRecord(value) || !Array.isArray(value.presence)) {
    return null;
  }
  const result: UserPresence[] = [];
  for (const item of value.presence) {
    const parsed = parseUserPresence(item);
    if (!parsed) {
      return null;
    }
    result.push(parsed);
  }
  return result;
}

export type FetchWorkspacePresenceResult =
  | { ok: true; presence: UserPresence[] }
  | { ok: false; unauthenticated?: boolean; kind?: 'aborted' | 'error'; message?: string };

export async function fetchWorkspacePresence(
  apiBaseUrl: string,
  workspaceId: string,
  options?: { signal?: AbortSignal },
): Promise<FetchWorkspacePresenceResult> {
  let response: Response;
  try {
    response = await fetch(
      `${apiBaseUrl}/api/workspaces/${encodeURIComponent(workspaceId)}/presence`,
      {
        credentials: 'include',
        cache: 'no-store',
        signal: options?.signal,
      },
    );
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') {
      return { ok: false, kind: 'aborted' };
    }
    return { ok: false, kind: 'error', message: 'Network error.' };
  }

  if (response.status === 401) {
    return { ok: false, unauthenticated: true };
  }
  if (!response.ok) {
    return { ok: false, kind: 'error', message: `Server returned ${response.status}.` };
  }

  let body: unknown;
  try {
    body = await response.json();
  } catch {
    return { ok: false, kind: 'error', message: 'Invalid JSON response.' };
  }

  const parsed = parseWorkspacePresenceResponse(body);
  if (!parsed) {
    return { ok: false, kind: 'error', message: 'Malformed presence response.' };
  }

  return { ok: true, presence: parsed };
}
