/**
 * Keyset cursor pagination for direct message conversations (Phase 4F.2).
 *
 * Encodes and decodes opaque base64 cursors based on (updatedAt, id) pairs,
 * ensuring deterministic pagination without offset queries.
 */

export interface ConversationCursor {
  updatedAt: string;
  id: string;
}

export function encodeConversationCursor(cursor: ConversationCursor): string {
  const json = JSON.stringify(cursor);
  return Buffer.from(json, 'utf8').toString('base64url');
}

export function decodeConversationCursor(cursor: string): ConversationCursor | null {
  try {
    const raw = Buffer.from(cursor, 'base64url').toString('utf8');
    const parsed = JSON.parse(raw) as unknown;

    if (
      typeof parsed === 'object' &&
      parsed !== null &&
      'updatedAt' in parsed &&
      'id' in parsed &&
      typeof (parsed as { updatedAt: unknown }).updatedAt === 'string' &&
      typeof (parsed as { id: unknown }).id === 'string' &&
      !Number.isNaN(Date.parse((parsed as { updatedAt: string }).updatedAt)) &&
      (parsed as { id: string }).id.trim().length > 0
    ) {
      return {
        updatedAt: (parsed as { updatedAt: string }).updatedAt,
        id: (parsed as { id: string }).id,
      };
    }
    return null;
  } catch {
    return null;
  }
}
