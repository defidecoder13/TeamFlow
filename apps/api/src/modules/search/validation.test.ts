/**
 * Search validation tests (Phase 4G.3, pure unit — no database).
 */
import { describe, expect, it } from 'vitest';
import { decodeSearchCursor, encodeSearchCursor } from './cursor';
import { parseInFilter, searchQuerySchema } from './validation';

describe('parseInFilter', () => {
  it('parses channel and dm scopes', () => {
    expect(parseInFilter('channel:engineering')).toEqual({ kind: 'channel', slug: 'engineering' });
    expect(parseInFilter('dm:conv-123')).toEqual({ kind: 'dm', conversationId: 'conv-123' });
  });

  it('rejects malformed scopes without touching the database', () => {
    expect(parseInFilter('channel:')).toBeNull();
    expect(parseInFilter('dm:')).toBeNull();
    expect(parseInFilter('workspace:ws-1')).toBeNull();
    expect(parseInFilter('engineering')).toBeNull();
    expect(parseInFilter('')).toBeNull();
    expect(parseInFilter(`channel:${'s'.repeat(200)}`)).toBeNull();
  });
});

describe('searchQuerySchema', () => {
  it('applies defaults (type=messages, thread=include, limit=20)', () => {
    const parsed = searchQuerySchema.safeParse({ q: 'hello' });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.type).toBe('messages');
      expect(parsed.data.thread).toBe('include');
      expect(parsed.data.limit).toBe(20);
    }
  });

  it('rejects empty, blank, and overlong queries', () => {
    expect(searchQuerySchema.safeParse({ q: '' }).success).toBe(false);
    expect(searchQuerySchema.safeParse({ q: '   ' }).success).toBe(false);
    expect(searchQuerySchema.safeParse({ q: 'x'.repeat(201) }).success).toBe(false);
    expect(searchQuerySchema.safeParse({ q: 'x'.repeat(200) }).success).toBe(true);
  });

  it('rejects unknown parameters (strict schema)', () => {
    expect(searchQuerySchema.safeParse({ q: 'hi', authorId: 'u-1' }).success).toBe(false);
    expect(searchQuerySchema.safeParse({ q: 'hi', workspaceId: 'ws-1' }).success).toBe(false);
    expect(searchQuerySchema.safeParse({ q: 'hi', role: 'OWNER' }).success).toBe(false);
  });

  it('validates limit bounds and type/thread enums', () => {
    expect(searchQuerySchema.safeParse({ q: 'hi', limit: 0 }).success).toBe(false);
    expect(searchQuerySchema.safeParse({ q: 'hi', limit: 51 }).success).toBe(false);
    expect(searchQuerySchema.safeParse({ q: 'hi', limit: 50 }).success).toBe(true);
    expect(searchQuerySchema.safeParse({ q: 'hi', type: 'everything' }).success).toBe(false);
    expect(searchQuerySchema.safeParse({ q: 'hi', thread: 'sometimes' }).success).toBe(false);
  });

  it('validates in: scopes, dates, and date ranges', () => {
    expect(searchQuerySchema.safeParse({ q: 'hi', in: 'channel:eng' }).success).toBe(true);
    expect(searchQuerySchema.safeParse({ q: 'hi', in: 'dm:conv-1' }).success).toBe(true);
    expect(searchQuerySchema.safeParse({ q: 'hi', in: 'user:u-1' }).success).toBe(false);
    expect(searchQuerySchema.safeParse({ q: 'hi', after: 'not-a-date' }).success).toBe(false);
    expect(
      searchQuerySchema.safeParse({
        q: 'hi',
        after: '2026-09-02T00:00:00.000Z',
        before: '2026-09-01T00:00:00.000Z',
      }).success,
    ).toBe(false);
    expect(
      searchQuerySchema.safeParse({
        q: 'hi',
        after: '2026-09-01T00:00:00.000Z',
        before: '2026-09-02T00:00:00.000Z',
      }).success,
    ).toBe(true);
  });

  it('validates opaque cursors', () => {
    const cursor = encodeSearchCursor({
      kind: 'messages',
      score: 0.5,
      tie: new Date().toISOString(),
      id: 'm-1',
    });
    expect(searchQuerySchema.safeParse({ q: 'hi', cursor }).success).toBe(true);
    expect(searchQuerySchema.safeParse({ q: 'hi', cursor: 'not-a-cursor!!' }).success).toBe(false);
  });

  it('accepts metacharacter queries literally (no tsquery syntax)', () => {
    for (const q of [':&|!', 'hello & world', '(test)', 'a:b', '"quoted"']) {
      expect(searchQuerySchema.safeParse({ q }).success).toBe(true);
    }
  });
});

describe('search cursor codec', () => {
  it('round-trips and rejects malformed cursors', () => {
    const cursor = { kind: 'users' as const, score: 0.28, tie: 'Ada', id: 'u-1' };
    expect(decodeSearchCursor(encodeSearchCursor(cursor))).toEqual(cursor);
    expect(decodeSearchCursor(';;;')).toBeNull();
    expect(decodeSearchCursor('')).toBeNull();
    expect(decodeSearchCursor('x'.repeat(513))).toBeNull();
    // Extra keys rejected.
    const extra = Buffer.from(
      JSON.stringify({ kind: 'messages', score: 1, tie: 'x', id: 'y', admin: true }),
      'utf8',
    ).toString('base64url');
    expect(decodeSearchCursor(extra)).toBeNull();
    // Bad score / tie / id rejected.
    for (const bad of [
      { kind: 'messages', score: Number.NaN, tie: '2026-01-01T00:00:00.000Z', id: 'm-1' },
      { kind: 'messages', score: -1, tie: '2026-01-01T00:00:00.000Z', id: 'm-1' },
      { kind: 'messages', score: 1, tie: 'not-a-date', id: 'm-1' },
      { kind: 'messages', score: 1, tie: '2026-01-01T00:00:00.000Z', id: '' },
      { kind: 'nope', score: 1, tie: 'x', id: 'y' },
    ]) {
      expect(
        decodeSearchCursor(Buffer.from(JSON.stringify(bad), 'utf8').toString('base64url')),
      ).toBeNull();
    }
  });
});
