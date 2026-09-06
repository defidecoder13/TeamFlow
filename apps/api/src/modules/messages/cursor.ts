/**
 * Opaque keyset cursor for message pagination (Phase 4A).
 *
 * The cursor carries only `{ createdAt, id }` — enough to continue the
 * (createdAt DESC, id DESC) ordering deterministically. It never carries a
 * channel or workspace id: the channel in the URL stays authoritative, so a
 * cursor cannot smuggle cross-channel access (at worst it paginates the
 * already-authorized channel from an older position). Malformed cursors are
 * rejected, never executed.
 */

export interface MessageCursor {
  createdAt: string;
  id: string;
}

const MAX_CURSOR_LENGTH = 512;

export function encodeMessageCursor(cursor: MessageCursor): string {
  return Buffer.from(JSON.stringify(cursor), 'utf8').toString('base64url');
}

export function decodeMessageCursor(value: unknown): MessageCursor | null {
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
