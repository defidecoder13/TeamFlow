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
    }
    // slug is accepted on create (optional custom base) but never on rename.
    expect(createWorkspaceSchema.safeParse({ name: 'Acme', slug: 'custom' }).success).toBe(true);
    expect(updateWorkspaceSchema.safeParse({ name: 'Acme', slug: 'hijacked' }).success).toBe(false);
  });

  it('accepts an optional valid custom slug on create', () => {
    const parsed = createWorkspaceSchema.safeParse({ name: 'Acme', slug: 'acme-corp' });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.slug).toBe('acme-corp');
    }
  });

  it('rejects invalid custom slugs on create', () => {
    expect(createWorkspaceSchema.safeParse({ name: 'Acme', slug: '' }).success).toBe(false);
    expect(createWorkspaceSchema.safeParse({ name: 'Acme', slug: 'UPPER' }).success).toBe(false);
    expect(createWorkspaceSchema.safeParse({ name: 'Acme', slug: 'has space' }).success).toBe(false);
    expect(createWorkspaceSchema.safeParse({ name: 'Acme', slug: '-leading' }).success).toBe(false);
    expect(createWorkspaceSchema.safeParse({ name: 'Acme', slug: 'a'.repeat(49) }).success).toBe(
      false,
    );
  });
});
