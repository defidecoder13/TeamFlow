/**
 * Opaque keyset cursor for workspace thread pagination (Audit 11).
 *
 * Carries only `{ latestReplyAt, id }` for the (latestReplyAt DESC, id DESC)
 * ordering. Never carries workspace or user ids — those always resolve from
 * the URL and session, so a cursor cannot smuggle access.
 */

export interface ThreadCursor {
  latestReplyAt: string;
  id: string;
}

const MAX_CURSOR_LENGTH = 512;

export function encodeThreadCursor(cursor: ThreadCursor): string {
  return Buffer.from(JSON.stringify(cursor), 'utf8').toString('base64url');
}

export function decodeThreadCursor(value: unknown): ThreadCursor | null {
  if (typeof value !== 'string' || value.length === 0 || value.length > MAX_CURSOR_LENGTH) {
    return null;
  }
  try {
    const parsed: unknown = JSON.parse(Buffer.from(value, 'base64url').toString('utf8'));
    if (typeof parsed !== 'object' || parsed === null) {
      return null;
    }
    const candidate = parsed as Record<string, unknown>;
    if (
      typeof candidate.latestReplyAt !== 'string' ||
      typeof candidate.id !== 'string' ||
      candidate.id.length === 0 ||
      Number.isNaN(Date.parse(candidate.latestReplyAt))
    ) {
      return null;
    }
    if (Object.keys(candidate).some((key) => key !== 'latestReplyAt' && key !== 'id')) {
      return null;
    }
    return { latestReplyAt: candidate.latestReplyAt, id: candidate.id };
  } catch {
    return null;
  }
}
