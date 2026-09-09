/**
 * Opaque keyset cursor for notification pagination (Phase 4H.5).
 *
 * The cursor carries only `{ createdAt, id }` — enough to continue the
 * (createdAt DESC, id DESC) ordering deterministically. It never carries a
 * workspace or user id: the URL workspace stays authoritative and the
 * recipient always resolves from the session, so a cursor cannot smuggle
 * cross-workspace or cross-user access (at worst it paginates the
 * already-authorized list from an older position). Malformed cursors are
 * rejected, never executed.
 */

export interface NotificationCursor {
  createdAt: string;
  id: string;
}

const MAX_CURSOR_LENGTH = 512;

export function encodeNotificationCursor(cursor: NotificationCursor): string {
  return Buffer.from(JSON.stringify(cursor), 'utf8').toString('base64url');
}

export function decodeNotificationCursor(value: unknown): NotificationCursor | null {
  if (typeof value !== 'string' || value.length === 0 || value.length > MAX_CURSOR_LENGTH) {
    return null;
  }
  try {
    const parsed: unknown = JSON.parse(Buffer.from(value, 'base64url').toString('utf8'));
    if (typeof parsed !== 'object' || parsed === null) {
      return null;
    }
    const candidate = parsed as Record<string, unknown>;
    if (typeof candidate.createdAt !== 'string' || typeof candidate.id !== 'string') {
      return null;
    }
    if (candidate.id.length === 0 || Number.isNaN(Date.parse(candidate.createdAt))) {
      return null;
    }
    if (Object.keys(candidate).some((key) => key !== 'createdAt' && key !== 'id')) {
      return null;
    }
    return { createdAt: candidate.createdAt, id: candidate.id };
  } catch {
    return null;
  }
}
