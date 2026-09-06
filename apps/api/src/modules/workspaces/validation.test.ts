import { describe, expect, it } from 'vitest';
import {
  createWorkspaceSchema,
  MAX_WORKSPACE_NAME_LENGTH,
  updateWorkspaceSchema,
} from './validation';

describe('workspace validation', () => {
  it('accepts a normal name', () => {
    expect(createWorkspaceSchema.safeParse({ name: 'Acme Studio' }).success).toBe(true);
  });

  it('rejects missing, empty, and whitespace-only names', () => {
    expect(createWorkspaceSchema.safeParse({}).success).toBe(false);
    expect(createWorkspaceSchema.safeParse({ name: '' }).success).toBe(false);
    expect(createWorkspaceSchema.safeParse({ name: '   ' }).success).toBe(false);
  });

  it('rejects overlong names', () => {
    expect(
      createWorkspaceSchema.safeParse({ name: 'a'.repeat(MAX_WORKSPACE_NAME_LENGTH + 1) }).success,
    ).toBe(false);
    expect(
      createWorkspaceSchema.safeParse({ name: 'a'.repeat(MAX_WORKSPACE_NAME_LENGTH) }).success,
    ).toBe(true);
  });

  it('rejects non-string names', () => {
    expect(createWorkspaceSchema.safeParse({ name: 42 }).success).toBe(false);
    expect(createWorkspaceSchema.safeParse({ name: null }).success).toBe(false);
  });

  it('rejects session-identity override fields on create and update', () => {
    for (const schema of [createWorkspaceSchema, updateWorkspaceSchema]) {
      expect(schema.safeParse({ name: 'Acme', userId: 'someone-else' }).success).toBe(false);
      expect(schema.safeParse({ name: 'Acme', ownerId: 'someone-else' }).success).toBe(false);
      expect(schema.safeParse({ name: 'Acme', role: 'OWNER' }).success).toBe(false);
      expect(schema.safeParse({ name: 'Acme', slug: 'hijacked' }).success).toBe(false);
    }
  });
});
