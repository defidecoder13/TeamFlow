/**
 * Frontend mention helpers (Phase 3.1).
 *
 * Pure functions only — no API calls, no state. The backend remains
 * authoritative: it tokenizes `@Name` spans, resolves them against eligible
 * members, and creates MessageMention rows + notifications. These helpers
 * mirror the backend tokenizer rules (see
 * `apps/api/src/modules/mentions/parser.ts`) so authoring and highlighting
 * agree with what the server will resolve:
 *
 * - An `@` starts a candidate at the start of the string or after a
 *   character OUTSIDE `[A-Za-z0-9_.]` (so `hello@example.com` stays plain).
 * - Name runs allow letters, numbers, spaces and `_.'-`, capped at 64 chars.
 * - Resolution is an exact case-insensitive name match, longest span wins.
 *
 * Highlighting is visual convenience only and never navigates anywhere.
 */

export interface MentionMember {
  id: string;
  name: string;
  image?: string | null;
  email?: string | null;
}

export type MentionSource =
  | { status: 'loading' }
  | { status: 'ready'; members: MentionMember[] }
  | { status: 'error'; message: string };

/** Max suggestions shown; workspaces can be large, popups should stay small. */
export const MAX_MENTION_SUGGESTIONS = 8;

/** Mirrors the backend candidate length bound. */
const MAX_RUN_LENGTH = 64;

/** Characters that disqualify the position before `@` (backend parity). */
function isBoundaryChar(char: string | undefined): boolean {
  if (char === undefined) return true;
  return !/[A-Za-z0-9_.]/.test(char);
}

/** Characters allowed inside a mention run after `@` (backend parity). */
function isNameChar(char: string): boolean {
  return /[\p{L}\p{N} _.'-]/u.test(char);
}

/**
 * Name characters that make a caret position "mid-word". Spaces are
 * excluded: `@ada |please` is a completed run (safe to replace), while
 * `@ali|ce` would corrupt text if only the left half were replaced.
 */
function isMidWordChar(char: string): boolean {
  return /[\p{L}\p{N}_.'-]/u.test(char);
}

export interface MentionQuery {
  /** UTF-16 offset of the `@` in the original text. */
  atIndex: number;
  /** Raw run between `@` and the caret (may be empty for a bare `@`). */
  query: string;
}

/**
 * Find the active `@` query ending at `caret`, or null when the caret is
 * not inside mention context. Guards: caret must not sit inside a longer
 * name run (replacing only the left half would corrupt text), and `@`
 * must satisfy the backend boundary rule.
 */
export function findMentionQuery(text: string, caret: number): MentionQuery | null {
  const safeCaret = Math.max(0, Math.min(caret, text.length));
  // A mid-word character directly after the caret means we are inside a
  // word: replacing only the left half would corrupt text. A trailing
  // space is fine — the run before it is complete.
  if (safeCaret < text.length && isMidWordChar(text[safeCaret] ?? '')) {
    return null;
  }
  let atIndex = safeCaret - 1;
  let runLength = 0;
  while (atIndex >= 0 && runLength < MAX_RUN_LENGTH && isNameChar(text[atIndex] ?? '')) {
    atIndex -= 1;
    runLength += 1;
  }
  if (atIndex < 0 || text[atIndex] !== '@') return null;
  if (!isBoundaryChar(text[atIndex - 1])) return null;
  return { atIndex, query: text.slice(atIndex + 1, safeCaret) };
}

/**
 * Filter workspace members by the typed query. Prefix matches first (input
 * order preserved within each group), then substring matches on name or
 * email. Empty query returns everyone (capped).
 */
export function filterMentionMembers(members: MentionMember[], query: string): MentionMember[] {
  const needle = query.trim().toLowerCase();
  if (needle.length === 0) {
    return members.slice(0, MAX_MENTION_SUGGESTIONS);
  }
  const prefix: MentionMember[] = [];
  const contains: MentionMember[] = [];
  for (const member of members) {
    const name = member.name.toLowerCase();
    const email = (member.email ?? '').toLowerCase();
    if (name.startsWith(needle)) {
      prefix.push(member);
    } else if (name.includes(needle) || (email.length > 0 && email.includes(needle))) {
      contains.push(member);
    }
    if (prefix.length + contains.length >= MAX_MENTION_SUGGESTIONS) break;
  }
  return [...prefix, ...contains].slice(0, MAX_MENTION_SUGGESTIONS);
}

/**
 * Replace the `@query` span with `@Full Name` and place the caret after it.
 * A trailing space is appended unless the text already continues with
 * whitespace, so selecting never doubles spaces.
 */
export function insertMention(
  text: string,
  caret: number,
  atIndex: number,
  name: string,
): { text: string; caret: number } {
  const cleanName = name.trim().replace(/\s+/g, ' ');
  const spacer = /\s/.test(text.slice(caret, caret + 1)) ? '' : ' ';
  const inserted = `@${cleanName}${spacer}`;
  const nextText = text.slice(0, atIndex) + inserted + text.slice(caret);
  return { text: nextText, caret: atIndex + inserted.length };
}

export interface MentionSpan {
  /** Offset of the `@`. */
  start: number;
  /** Offset just past the matched name text. */
  end: number;
  userId: string;
}

/** Trailing punctuation stripped from candidates (backend parity). */
const TRAILING_TRIM = /[ _.'\-,;:!?"'()[\]{}<>…—–]+$/u;

/**
 * Resolve highlight spans for a rendered body against known members.
 * Longest exact (case-insensitive) name match wins per `@` position;
 * anything else stays plain text. Never invents members.
 */
export function resolveMentionSpans(body: string, members: MentionMember[]): MentionSpan[] {
  if (!body.includes('@') || members.length === 0) return [];
  const byName = new Map<string, string>();
  for (const member of members) {
    const key = member.name.trim().replace(/\s+/g, ' ').toLowerCase();
    if (key.length > 0 && !byName.has(key)) {
      byName.set(key, member.id);
    }
  }
  const spans: MentionSpan[] = [];
  const pattern = /@([\p{L}\p{N}_][\p{L}\p{N} _.'-]{0,63})/gu;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(body)) !== null) {
    const atIndex = match.index;
    if (!isBoundaryChar(body[atIndex - 1])) continue;
    // Raw word spans (punctuation included); the trailing-trim rule below
    // mirrors the backend so end offsets exclude trailing punctuation.
    const rawRun = match[1] ?? '';
    const wordSpans: Array<{ start: number; end: number }> = [];
    const wordPattern = /\S+/g;
    let wordMatch: RegExpExecArray | null;
    while ((wordMatch = wordPattern.exec(rawRun)) !== null) {
      wordSpans.push({
        start: atIndex + 1 + wordMatch.index,
        end: atIndex + 1 + wordMatch.index + wordMatch[0].length,
      });
    }
    let hit: { userId: string; end: number } | null = null;
    for (let count = Math.min(6, wordSpans.length); count >= 1; count -= 1) {
      const last = wordSpans[count - 1];
      if (!last) continue;
      const candidate = rawRun
        .slice(0, last.end - (atIndex + 1))
        .replace(/\s+/g, ' ')
        .replace(TRAILING_TRIM, '');
      if (candidate.length === 0) continue;
      const userId = byName.get(candidate.toLowerCase());
      if (userId !== undefined) {
        let end = last.end;
        while (end > atIndex + 1 && TRAILING_TRIM.test(body[end - 1] ?? '')) {
          end -= 1;
        }
        hit = { userId, end };
        break;
      }
    }
    if (hit) {
      spans.push({ start: atIndex, end: hit.end, userId: hit.userId });
      pattern.lastIndex = hit.end;
    }
  }
  return spans;
}
