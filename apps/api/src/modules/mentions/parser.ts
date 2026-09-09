/**
 * Server-side mention tokenizer (Phase 4H.2).
 *
 * Pure and deterministic: extracts `@name` candidate spans from a plain
 * message body. Candidates are NOT mentions yet — resolution against
 * eligible workspace members happens in `service.ts`, and only exact
 * (case-insensitive) matches become MessageMention rows.
 *
 * Safety rules encoded here:
 * - An `@` preceded by a letter, digit, `_` or `.` never starts a candidate,
 *   so `hello@example.com` stays ordinary text.
 * - Multi-word names are supported via leading prefixes: `@Alice Smith,`
 *   yields candidates `Alice` and `Alice Smith`; resolution prefers the
 *   longest exact match, so `@Alice` still resolves when only Alice exists.
 * - Trailing punctuation is trimmed (`@Alice,` → `Alice`).
 * - Non-name characters (emoji, symbols, newlines) terminate a candidate
 *   without breaking the scan.
 */

export interface MentionCandidate {
  /** Trimmed candidate text, e.g. `Alice Smith` for `@Alice Smith,`. */
  name: string;
  /** UTF-16 offset of the `@` in the original body. */
  start: number;
  /** UTF-16 offset just past the trimmed candidate in the original body. */
  end: number;
}

/** Upper bound for a single `@` run; names are short, bodies are not. */
export const MAX_CANDIDATE_LENGTH = 64;
/** Maximum words per candidate; bounds prefix generation. */
export const MAX_PREFIX_WORDS = 6;

/** Characters allowed inside a candidate run after the leading `@`. */
const NAME_RUN = String.raw`[\p{L}\p{N} _.'-]`;
/** Trailing characters stripped from a candidate (punctuation, never letters). */
const TRAILING_TRIM = /[ _.'\-,;:!?'"()[\]{}<>…—–]+$/u;

/**
 * An `@` starts a candidate unless it looks like the middle of an email or
 * handle (`a@b`). Start-of-string always qualifies.
 */
const CANDIDATE_PATTERN = new RegExp(
  `(?<![A-Za-z0-9_.])@([\\p{L}\\p{N}_]${NAME_RUN}{0,${MAX_CANDIDATE_LENGTH - 1}})`,
  'gu',
);

const WORD_PATTERN = /\S+/g;

export function parseMentionCandidates(body: string): MentionCandidate[] {
  const candidates: MentionCandidate[] = [];
  if (!body.includes('@')) {
    return candidates;
  }
  CANDIDATE_PATTERN.lastIndex = 0;
  for (const match of body.matchAll(CANDIDATE_PATTERN)) {
    const atIndex = match.index ?? 0;
    const raw = match[1] ?? '';
    const words: Array<{ text: string; index: number }> = [];
    WORD_PATTERN.lastIndex = 0;
    for (const word of raw.matchAll(WORD_PATTERN)) {
      words.push({ text: word[0], index: word.index ?? 0 });
      if (words.length >= MAX_PREFIX_WORDS) {
        break;
      }
    }
    const seenInSpan = new Set<string>();
    for (let end = 1; end <= words.length; end += 1) {
      const last = words[end - 1];
      const rawEnd = last.index + last.text.length;
      // Emit the raw whitespace-trimmed variant first (preserves trailing
      // punctuation that may be part of a name, e.g. "St."), then the fully
      // trimmed variant. Resolution prefers the longest exact match.
      const rawName = raw.slice(0, rawEnd).replace(/\s+/g, ' ').trim();
      let endOffset = rawEnd;
      while (endOffset > 0 && TRAILING_TRIM.test(raw[endOffset - 1] ?? '')) {
        endOffset -= 1;
      }
      const trimmedName = raw.slice(0, endOffset).replace(/\s+/g, ' ').trim();
      for (const [name, spanEnd] of [
        [rawName, rawEnd],
        [trimmedName, endOffset],
      ] as const) {
        if (name.length === 0 || seenInSpan.has(name)) {
          continue;
        }
        seenInSpan.add(name);
        candidates.push({ name, start: atIndex, end: atIndex + 1 + spanEnd });
      }
    }
  }
  return candidates;
}

/** Distinct candidate names in first-seen order. */
export function candidateNames(body: string): string[] {
  const seen = new Set<string>();
  const names: string[] = [];
  for (const candidate of parseMentionCandidates(body)) {
    if (!seen.has(candidate.name)) {
      seen.add(candidate.name);
      names.push(candidate.name);
    }
  }
  return names;
}
