import { describe, expect, it } from 'vitest';
import { acceptInvitationSchema, createInvitationSchema } from './validation';

describe('invitation validation', () => {
  it('accepts a normal email and normalizes it', () => {
    const parsed = createInvitationSchema.safeParse({ email: '  Foo@Example.COM ' });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.email).toBe('foo@example.com');
    }
  });

  it('rejects missing, empty, and invalid emails', () => {
    expect(createInvitationSchema.safeParse({}).success).toBe(false);
    expect(createInvitationSchema.safeParse({ email: '' }).success).toBe(false);
    expect(createInvitationSchema.safeParse({ email: '   ' }).success).toBe(false);
    expect(createInvitationSchema.safeParse({ email: 'not-an-email' }).success).toBe(false);
    expect(createInvitationSchema.safeParse({ email: 'a@b' }).success).toBe(false);
  });

  it('rejects session-identity override fields', () => {
    expect(
      createInvitationSchema.safeParse({ email: 'a@b.co', invitedById: 'someone' }).success,
    ).toBe(false);
    expect(createInvitationSchema.safeParse({ email: 'a@b.co', role: 'ADMIN' }).success).toBe(
      false,
    );
    expect(createInvitationSchema.safeParse({ email: 'a@b.co', token: 'x' }).success).toBe(false);
    expect(createInvitationSchema.safeParse({ email: 'a@b.co', workspaceId: 'ws' }).success).toBe(
      false,
    );
    expect(createInvitationSchema.safeParse({ email: 'a@b.co', userId: 'u' }).success).toBe(false);
    expect(
      createInvitationSchema.safeParse({ email: 'a@b.co', expiresAt: new Date().toISOString() })
        .success,
    ).toBe(false);
  });

  it('requires a non-blank token for acceptance and nothing else', () => {
    expect(acceptInvitationSchema.safeParse({ token: 'abc123' }).success).toBe(true);
    expect(acceptInvitationSchema.safeParse({}).success).toBe(false);
    expect(acceptInvitationSchema.safeParse({ token: '   ' }).success).toBe(false);
    expect(acceptInvitationSchema.safeParse({ token: 'abc123', email: 'a@b.co' }).success).toBe(
      false,
    );
    expect(acceptInvitationSchema.safeParse({ token: 'abc123', userId: 'u' }).success).toBe(false);
  });
});
