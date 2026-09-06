import { describe, expect, it } from 'vitest';
import { isMessageAuthor } from './authorization';
import { decodeMessageCursor, encodeMessageCursor } from './cursor';
import { createMessageSchema, messageListQuerySchema, updateMessageSchema } from './validation';

describe('message cursor codec', () => {
  it('round-trips opaquely without exposing SQL details', () => {
    const cursor = { createdAt: '2026-09-06T12:00:00.000Z', id: 'abc-123' };
    const encoded = encodeMessageCursor(cursor);
    expect(encoded).not.toContain('createdAt');
    expect(encoded).not.toContain('abc-123');
    expect(decodeMessageCursor(encoded)).toEqual(cursor);
  });

  it('rejects malformed cursors safely', () => {
    expect(decodeMessageCursor('!!!not-base64!!!')).toBeNull();
    expect(decodeMessageCursor(Buffer.from('not-json', 'utf8').toString('base64url'))).toBeNull();
    expect(decodeMessageCursor(Buffer.from('{}', 'utf8').toString('base64url'))).toBeNull();
    expect(
      decodeMessageCursor(
        Buffer.from(JSON.stringify({ createdAt: 'nope', id: 'x' }), 'utf8').toString('base64url'),
      ),
    ).toBeNull();
    expect(
      decodeMessageCursor(
        Buffer.from(JSON.stringify({ createdAt: '2026-09-06T12:00:00.000Z' }), 'utf8').toString(
          'base64url',
        ),
      ),
    ).toBeNull();
    expect(
      decodeMessageCursor(
        Buffer.from(
          JSON.stringify({ createdAt: '2026-09-06T12:00:00.000Z', id: 'x', channelId: 'y' }),
          'utf8',
        ).toString('base64url'),
      ),
    ).toBeNull();
    expect(decodeMessageCursor('')).toBeNull();
    expect(decodeMessageCursor(null)).toBeNull();
    expect(decodeMessageCursor('a'.repeat(513))).toBeNull();
  });
});

describe('message validation', () => {
  it('accepts a normal body and rejects empties and oversize input', () => {
    expect(createMessageSchema.safeParse({ body: 'Hello team' }).success).toBe(true);
    expect(createMessageSchema.safeParse({}).success).toBe(false);
    expect(createMessageSchema.safeParse({ body: '' }).success).toBe(false);
    expect(createMessageSchema.safeParse({ body: '   ' }).success).toBe(false);
    expect(createMessageSchema.safeParse({ body: 'a'.repeat(10001) }).success).toBe(false);
    expect(createMessageSchema.safeParse({ body: 'a'.repeat(10000) }).success).toBe(true);
  });

  it('rejects authority-field injection on create and update', () => {
    for (const payload of [
      { body: 'hi', authorId: 'someone-else' },
      { body: 'hi', userId: 'someone-else' },
      { body: 'hi', workspaceId: 'ws' },
      { body: 'hi', channelId: 'ch' },
      { body: 'hi', createdAt: new Date().toISOString() },
      { body: 'hi', deletedAt: null },
    ]) {
      expect(createMessageSchema.safeParse(payload).success).toBe(false);
    }
    expect(updateMessageSchema.safeParse({ body: 'new', channelId: 'other' }).success).toBe(false);
    expect(updateMessageSchema.safeParse({ body: 'new' }).success).toBe(true);
  });

  it('validates list query limits and cursors', () => {
    expect(messageListQuerySchema.safeParse({}).success).toBe(true);
    const defaults = messageListQuerySchema.safeParse({});
    if (defaults.success) {
      expect(defaults.data.limit).toBe(50);
    }
    expect(messageListQuerySchema.safeParse({ limit: '25' }).success).toBe(true);
    expect(messageListQuerySchema.safeParse({ limit: '100' }).success).toBe(true);
    for (const query of [
      { limit: '0' },
      { limit: '-1' },
      { limit: '101' },
      { limit: 'abc' },
      { limit: '10.5' },
      { limit: '50', foo: 'bar' },
      { cursor: '!!!' },
    ]) {
      expect(messageListQuerySchema.safeParse(query).success).toBe(false);
    }
    const cursor = encodeMessageCursor({ createdAt: '2026-09-06T12:00:00.000Z', id: 'x' });
    expect(messageListQuerySchema.safeParse({ cursor }).success).toBe(true);
  });
});

describe('isMessageAuthor', () => {
  it('matches only the original author', () => {
    expect(isMessageAuthor({ authorId: 'u-1' }, 'u-1')).toBe(true);
    expect(isMessageAuthor({ authorId: 'u-1' }, 'u-2')).toBe(false);
  });
});
