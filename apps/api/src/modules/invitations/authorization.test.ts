import { describe, expect, it } from 'vitest';
import { canManageInvitations } from './authorization';

describe('invitation authorization', () => {
  it('allows OWNER and ADMIN to manage invitations', () => {
    expect(canManageInvitations('OWNER')).toBe(true);
    expect(canManageInvitations('ADMIN')).toBe(true);
  });

  it('forbids MEMBER from managing invitations', () => {
    expect(canManageInvitations('MEMBER')).toBe(false);
  });
});
