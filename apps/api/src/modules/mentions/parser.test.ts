/**
 * Mention tokenizer tests (Phase 4H.2, pure unit — no database).
 *
 * The parser only extracts candidate spans; eligibility and exact matching
 * live in `service.ts` and are tested separately.
 */
import { describe, expect, it } from 'vitest';
import { candidateNames, MAX_CANDIDATE_LENGTH, parseMentionCandidates } from './parser';

function names(body: string): string[] {
  return parseMentionCandidates(body).map((candidate) => candidate.name);
}

describe('parseMentionCandidates', () => {
  it('extracts a simple mention with its span', () => {
    const body = 'Hello @Alice, welcome';
    // The comma terminates the run, so only the exact candidate is emitted.
    expect(parseMentionCandidates(body)).toEqual([{ name: 'Alice', start: 6, end: 12 }]);
    expect(body.slice(7, 12)).toBe('Alice');
  });

  it('finds multiple and adjacent mentions', () => {
    expect(names('@Alice @Bob')).toContain('Alice');
    expect(names('@Alice @Bob')).toContain('Bob');
    expect(names('@Alice,@Bob')).toContain('Alice');
    expect(names('@Alice,@Bob')).toContain('Bob');
  });

  it('supports multi-word names via longest prefixes', () => {
    const found = names('Hey @Alice Smith, welcome');
    expect(found).toContain('Alice');
    expect(found).toContain('Alice Smith');
  });

  it('trims surrounding punctuation', () => {
    expect(names('(@Alice)')).toContain('Alice');
    expect(names('"@Alice!"')).toContain('Alice');
    expect(names('Thanks @Alice.')).toContain('Alice');
    expect(names("Hi @O'Brien")).toContain("O'Brien");
  });

  it('never treats email-like text as a mention', () => {
    expect(parseMentionCandidates('hello@example.com')).toEqual([]);
    expect(parseMentionCandidates('Contact a.b@c.d for help')).toEqual([]);
    expect(parseMentionCandidates('mail me at jane_doe@x.io!')).toEqual([]);
  });

  it('handles Unicode names and emoji safely', () => {
    expect(names('Hey @José, hola')).toContain('José');
    expect(names('Привет @Владимир')).toContain('Владимир');
    expect(parseMentionCandidates('Go @🎉')).toEqual([]);
    expect(names('Hi @Al🎉ice party')).toContain('Al');
    expect(names('launch @🚀Bob now')).toEqual([]);
  });

  it('returns nothing for empty, blank, or mention-free bodies', () => {
    expect(parseMentionCandidates('')).toEqual([]);
    expect(parseMentionCandidates('   ')).toEqual([]);
    expect(parseMentionCandidates('no mentions here')).toEqual([]);
    expect(parseMentionCandidates('@')).toEqual([]);
    expect(parseMentionCandidates('@!')).toEqual([]);
  });

  it('stops candidates at newlines and caps runaway length', () => {
    expect(names('@Alice\n@Bob')).toContain('Alice');
    expect(names('@Alice\n@Bob')).toContain('Bob');
    const long = `@${'a'.repeat(200)}`;
    for (const name of names(long)) {
      expect(name.length).toBeLessThanOrEqual(MAX_CANDIDATE_LENGTH + 1);
    }
  });

  it('deduplicates repeated candidate names via candidateNames', () => {
    expect(candidateNames('@Alice hi @Alice')).toEqual(['Alice', 'Alice hi']);
  });
});
