/**
 * Search cursor codec (Phase 4G.3).
 *
 * Opaque base64url keyset cursor over the deterministic result ordering:
 * score DESC, tie-breaker DESC, id DESC. The tie-breaker is the message
 * `createdAt` (messages) or the entity `name` (users/channels). The cursor
 * carries position only — never authorization or filter state. Every request
 * re-applies the validated filters and re-resolves accessible containers, so
 * a cursor minted for another query, type, or user cannot bypass anything.
 */

export const MAX_SEARCH_CURSOR_LENGTH = 512;

export type SearchCursorKind = 'messages' | 'users' | 'channels';

export interface SearchCursor {
  kind: SearchCursorKind;
  /** Combined ranking score, finite and non-negative. */
  score: number;
  /** Tie-breaker: ISO-8601 timestamp (messages) or entity name (users/channels). */
  tie: string;
  id: string;
}

const CURSOR_KINDS: readonly SearchCursorKind[] = ['messages', 'users', 'channels'];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

export function encodeSearchCursor(cursor: SearchCursor): string {
  return Buffer.from(JSON.stringify(cursor), 'utf8').toString('base64url');
}

/**
 * Strictly decode a cursor, or null when malformed. Rejects non-objects,
 * unknown/extra keys, non-finite or negative scores, empty tie/id, and —
 * for message cursors — unparseable timestamps.
 */
export function decodeSearchCursor(value: unknown): SearchCursor | null {
  if (typeof value !== 'string' || value.length === 0 || value.length > MAX_SEARCH_CURSOR_LENGTH) {
    return null;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(Buffer.from(value, 'base64url').toString('utf8'));
  } catch {
    return null;
  }
  if (!isRecord(parsed)) {
    return null;
  }
  const keys = Object.keys(parsed).sort();
  if (
    keys.length !== 4 ||
    keys[0] !== 'id' ||
    keys[1] !== 'kind' ||
    keys[2] !== 'score' ||
    keys[3] !== 'tie'
  ) {
    return null;
  }
  const { kind, score, tie, id } = parsed;
  if (typeof kind !== 'string' || !(CURSOR_KINDS as readonly string[]).includes(kind)) {
    return null;
  }
  if (typeof score !== 'number' || !Number.isFinite(score) || score < 0) {
    return null;
  }
  if (typeof tie !== 'string' || tie.length === 0) {
    return null;
  }
  if (typeof id !== 'string' || id.length === 0) {
    return null;
  }
  if (kind === 'messages' && Number.isNaN(Date.parse(tie))) {
    return null;
  }
  return { kind: kind as SearchCursorKind, score, tie, id };
}
