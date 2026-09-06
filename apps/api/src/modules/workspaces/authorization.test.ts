import { describe, expect, it } from 'vitest';
import { canDeleteWorkspace, canEditMetadata } from './authorization';

describe('workspace role permissions', () => {
  it('allows OWNER and ADMIN to edit metadata, but not MEMBER', () => {
    expect(canEditMetadata('OWNER')).toBe(true);
    expect(canEditMetadata('ADMIN')).toBe(true);
    expect(canEditMetadata('MEMBER')).toBe(false);
  });

  it('allows only OWNER to delete the workspace', () => {
    expect(canDeleteWorkspace('OWNER')).toBe(true);
    expect(canDeleteWorkspace('ADMIN')).toBe(false);
    expect(canDeleteWorkspace('MEMBER')).toBe(false);
  });
});
