/**
 * Opaque keyset cursor for workspace mention pagination (Audit 12).
 *
 * Carries only `{ createdAt, messageId }` for the
 * (MessageMention.createdAt DESC, messageId DESC) ordering. Never carries
 * workspace or user ids — those always resolve from the URL and session, so
 * a cursor cannot smuggle access.
 */

export interface MentionCursor {
  createdAt: string;
  messageId: string;
}

const MAX_CURSOR_LENGTH = 512;

export function encodeMentionCursor(cursor: MentionCursor): string {
  return Buffer.from(JSON.stringify(cursor), 'utf8').toString('base64url');
}

export function decodeMentionCursor(value: unknown): MentionCursor | null {
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
      typeof candidate.createdAt !== 'string' ||
      typeof candidate.messageId !== 'string' ||
      candidate.messageId.length === 0 ||
      Number.isNaN(Date.parse(candidate.createdAt))
    ) {
      return null;
    }
    if (Object.keys(candidate).some((key) => key !== 'createdAt' && key !== 'messageId')) {
      return null;
    }
    return { createdAt: candidate.createdAt, messageId: candidate.messageId };
  } catch {
    return null;
  }
}
