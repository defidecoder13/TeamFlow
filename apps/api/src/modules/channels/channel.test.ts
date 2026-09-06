import { describe, expect, it } from 'vitest';
import { canUpdateChannel } from './authorization';
import {
  createChannelSchema,
  MAX_CHANNEL_DESCRIPTION_LENGTH,
  MAX_CHANNEL_NAME_LENGTH,
  updateChannelSchema,
} from './validation';

describe('channel validation', () => {
  it('accepts a full public channel payload', () => {
    expect(
      createChannelSchema.safeParse({
        name: 'Engineering',
        description: 'Backend discussions',
        type: 'PUBLIC',
      }).success,
    ).toBe(true);
  });

  it('defaults a missing type to PUBLIC', () => {
    const parsed = createChannelSchema.safeParse({ name: 'Engineering' });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.type).toBe('PUBLIC');
    }
  });

  it('rejects empty, blank, overlong, and non-string names', () => {
    expect(createChannelSchema.safeParse({}).success).toBe(false);
    expect(createChannelSchema.safeParse({ name: '' }).success).toBe(false);
    expect(createChannelSchema.safeParse({ name: '   ' }).success).toBe(false);
    expect(
      createChannelSchema.safeParse({ name: 'a'.repeat(MAX_CHANNEL_NAME_LENGTH + 1) }).success,
    ).toBe(false);
    expect(createChannelSchema.safeParse({ name: 42 }).success).toBe(false);
  });

  it('rejects invalid types and security-sensitive overrides', () => {
    expect(createChannelSchema.safeParse({ name: 'Engineering', type: 'SECRET' }).success).toBe(
      false,
    );
    for (const payload of [
      { name: 'Engineering', workspaceId: 'attacker' },
      { name: 'Engineering', createdById: 'someone-else' },
      { name: 'Engineering', userId: 'someone-else' },
      { name: 'Engineering', role: 'OWNER' },
      { name: 'Engineering', slug: 'hijacked' },
    ]) {
      expect(createChannelSchema.safeParse(payload).success).toBe(false);
    }
  });

  it('bounds descriptions and allows clearing on update', () => {
    expect(
      createChannelSchema.safeParse({
        name: 'Engineering',
        description: 'a'.repeat(MAX_CHANNEL_DESCRIPTION_LENGTH + 1),
      }).success,
    ).toBe(false);
    const cleared = updateChannelSchema.safeParse({ description: null });
    expect(cleared.success).toBe(true);
    expect(updateChannelSchema.safeParse({}).success).toBe(false);
    expect(updateChannelSchema.safeParse({ name: 'x', slug: 'y' }).success).toBe(false);
  });
});

describe('channel update authorization', () => {
  it('allows OWNER and ADMIN everywhere', () => {
    expect(canUpdateChannel({ workspaceRole: 'OWNER', isCreator: false })).toBe(true);
    expect(canUpdateChannel({ workspaceRole: 'ADMIN', isCreator: true })).toBe(true);
  });

  it('allows MEMBER creators on their own channels only', () => {
    expect(canUpdateChannel({ workspaceRole: 'MEMBER', isCreator: true })).toBe(true);
    expect(canUpdateChannel({ workspaceRole: 'MEMBER', isCreator: false })).toBe(false);
  });
});
