import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  generateInvitationToken,
  hashInvitationToken,
  INVITATION_TOKEN_BYTES,
  normalizeEmail,
} from './tokens';

describe('invitation tokens', () => {
  it('generates URL-safe tokens with 256 bits of entropy', () => {
    const token = generateInvitationToken();
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(Buffer.from(token, 'base64url').length).toBe(INVITATION_TOKEN_BYTES);
  });

  it('generates unique tokens', () => {
    const seen = new Set(Array.from({ length: 20 }, () => generateInvitationToken()));
    expect(seen.size).toBe(20);
  });

  it('hashes deterministically with SHA-256 hex', () => {
    const token = generateInvitationToken();
    const expected = createHash('sha256').update(token, 'utf8').digest('hex');
    expect(hashInvitationToken(token)).toBe(expected);
    expect(hashInvitationToken(token)).toMatch(/^[0-9a-f]{64}$/);
    expect(hashInvitationToken(token)).toBe(hashInvitationToken(token));
  });

  it('never embeds identities in the token', () => {
    const token = generateInvitationToken();
    expect(token).not.toContain('ws-');
    expect(token).not.toContain('@');
  });
});

describe('normalizeEmail', () => {
  it('trims and lowercases', () => {
    expect(normalizeEmail('  Foo@Example.COM ')).toBe('foo@example.com');
    expect(normalizeEmail('a@b.co')).toBe('a@b.co');
  });
});
