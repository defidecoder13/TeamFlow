import { describe, expect, it } from 'vitest';
import {
  filterMentionMembers,
  findMentionQuery,
  insertMention,
  resolveMentionSpans,
  type MentionMember,
} from './mentions';

const ADA: MentionMember = { id: 'u-1', name: 'Ada Lovelace', email: 'ada@example.com' };
const ALAN: MentionMember = { id: 'u-2', name: 'Alan Turing', email: 'alan@example.com' };
const ALICE_SMITH: MentionMember = { id: 'u-3', name: 'Alice Smith' };
const MEMBERS = [ADA, ALAN, ALICE_SMITH];

describe('findMentionQuery', () => {
  it('detects a bare @ at the start', () => {
    expect(findMentionQuery('@', 1)).toEqual({ atIndex: 0, query: '' });
  });

  it('detects @a and @al queries', () => {
    expect(findMentionQuery('@a', 2)).toEqual({ atIndex: 0, query: 'a' });
    expect(findMentionQuery('hi @al', 6)).toEqual({ atIndex: 3, query: 'al' });
  });

  it('detects mentions after existing text and mid-message', () => {
    expect(findMentionQuery('review this @ada please', 16)).toEqual({
      atIndex: 12,
      query: 'ada',
    });
  });

  it('supports multi-word queries while typing', () => {
    expect(findMentionQuery('@Alice Sm', 9)).toEqual({ atIndex: 0, query: 'Alice Sm' });
  });

  it('ignores email-like text', () => {
    expect(findMentionQuery('hello@example.com', 17)).toBeNull();
    expect(findMentionQuery('mail a@b', 7)).toBeNull();
  });

  it('ignores @ preceded by handle characters', () => {
    expect(findMentionQuery('hi_there@ada', 13)).toBeNull();
    expect(findMentionQuery('v1.2@ada', 8)).toBeNull();
  });

  it('triggers after whitespace and opening punctuation', () => {
    expect(findMentionQuery('(@ada)', 5)).toEqual({ atIndex: 1, query: 'ada' });
  });

  it('refuses mid-word carets to avoid corrupting text', () => {
    expect(findMentionQuery('@aliceX', 6)).toBeNull();
  });

  it('still triggers when the run is complete before whitespace', () => {
    expect(findMentionQuery('review this @ada please', 16)).toEqual({
      atIndex: 12,
      query: 'ada',
    });
  });

  it('finds the nearest @ run when several exist', () => {
    expect(findMentionQuery('@ada and @al', 12)).toEqual({ atIndex: 9, query: 'al' });
  });
});

describe('filterMentionMembers', () => {
  it('returns everyone on an empty query', () => {
    expect(filterMentionMembers(MEMBERS, '')).toEqual(MEMBERS);
  });

  it('prefers prefix matches over substring matches', () => {
    expect(filterMentionMembers(MEMBERS, 'al').map((m) => m.id)).toEqual(['u-2', 'u-3']);
  });

  it('matches case-insensitively and on email', () => {
    expect(filterMentionMembers(MEMBERS, 'ADA').map((m) => m.id)).toEqual(['u-1']);
    expect(filterMentionMembers(MEMBERS, 'alan@example').map((m) => m.id)).toEqual(['u-2']);
  });

  it('returns an empty list when nothing matches', () => {
    expect(filterMentionMembers(MEMBERS, 'zzz')).toEqual([]);
  });
});

describe('insertMention', () => {
  it('replaces the query span without duplicating @', () => {
    expect(insertMention('hi @al', 6, 3, 'Alan Turing')).toEqual({
      text: 'hi @Alan Turing ',
      caret: 16,
    });
  });

  it('preserves surrounding text on both sides', () => {
    expect(insertMention('a @a b', 4, 2, 'Ada Lovelace')).toEqual({
      text: 'a @Ada Lovelace b',
      caret: 15,
    });
  });
});

describe('resolveMentionSpans', () => {
  it('highlights an exact member match', () => {
    expect(resolveMentionSpans('hi @Ada Lovelace!', MEMBERS)).toEqual([
      { start: 3, end: 16, userId: 'u-1' },
    ]);
  });

  it('prefers the longest exact match', () => {
    const members: MentionMember[] = [{ id: 'u-3', name: 'Alice' }, ALICE_SMITH];
    expect(resolveMentionSpans('@Alice Smith', members)).toEqual([
      { start: 0, end: 12, userId: 'u-3' },
    ]);
  });

  it('matches case-insensitively on full names', () => {
    expect(resolveMentionSpans('@ADA LOVELACE', MEMBERS)).toEqual([
      { start: 0, end: 13, userId: 'u-1' },
    ]);
  });

  it('leaves unknown, partial-name, and email-like text plain', () => {
    expect(resolveMentionSpans('hi @Nobody here', MEMBERS)).toEqual([]);
    // Partial first names never resolve server-side either (exact match).
    expect(resolveMentionSpans('hi @Ada here', MEMBERS)).toEqual([]);
    expect(resolveMentionSpans('mail ada@example.com', MEMBERS)).toEqual([]);
  });

  it('resolves several mentions in one body', () => {
    expect(resolveMentionSpans('@Ada Lovelace and @Alan Turing', MEMBERS)).toEqual([
      { start: 0, end: 13, userId: 'u-1' },
      { start: 18, end: 30, userId: 'u-2' },
    ]);
  });

  it('resolves nothing without members', () => {
    expect(resolveMentionSpans('@Ada', [])).toEqual([]);
  });
});
