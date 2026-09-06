import { describe, expect, it, vi } from 'vitest';
import {
  createWorkspace,
  fetchWorkspaces,
  MAX_WORKSPACE_NAME_LENGTH,
  parseWorkspacesResponse,
  selectInitialWorkspace,
  validateWorkspaceName,
  type WorkspaceSummary,
} from './workspaces';

const FIRST: WorkspaceSummary = {
  id: 'ws-1',
  name: 'Acme Studio',
  slug: 'acme-studio',
  role: 'OWNER',
  createdAt: '2026-09-06T00:00:00.000Z',
  updatedAt: '2026-09-06T00:00:00.000Z',
};

const SECOND: WorkspaceSummary = {
  id: 'ws-2',
  name: 'Side Project',
  slug: 'side-project',
  role: 'MEMBER',
  createdAt: '2026-09-07T00:00:00.000Z',
  updatedAt: '2026-09-07T00:00:00.000Z',
};

describe('selectInitialWorkspace', () => {
  it('returns null for an empty list', () => {
    expect(selectInitialWorkspace([])).toBeNull();
  });

  it('deterministically selects the first returned workspace', () => {
    expect(selectInitialWorkspace([FIRST, SECOND])).toEqual(FIRST);
    expect(selectInitialWorkspace([SECOND, FIRST])).toEqual(SECOND);
  });

  it('preserves the returned workspace data untouched', () => {
    const selected = selectInitialWorkspace([FIRST]);
    expect(selected).toBe(FIRST);
  });
});

describe('parseWorkspacesResponse', () => {
  it('accepts a well-formed payload', () => {
    expect(parseWorkspacesResponse({ workspaces: [FIRST, SECOND] })).toEqual([FIRST, SECOND]);
    expect(parseWorkspacesResponse({ workspaces: [] })).toEqual([]);
  });

  it('rejects malformed payloads', () => {
    expect(parseWorkspacesResponse(null)).toBeNull();
    expect(parseWorkspacesResponse({})).toBeNull();
    expect(parseWorkspacesResponse({ workspaces: null })).toBeNull();
    expect(parseWorkspacesResponse({ workspaces: [{ id: 'ws-1' }] })).toBeNull();
    expect(parseWorkspacesResponse({ workspaces: [{ ...FIRST, role: 'SUPERADMIN' }] })).toBeNull();
    expect(parseWorkspacesResponse({ workspaces: [{ ...FIRST, name: '' }] })).toBeNull();
  });
});

describe('fetchWorkspaces', () => {
  const apiBase = 'http://localhost:4000';

  it('returns workspaces on success', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        status: 200,
        ok: true,
        json: async () => ({ workspaces: [FIRST] }),
      }),
    );
    await expect(fetchWorkspaces(apiBase)).resolves.toEqual({ ok: true, workspaces: [FIRST] });
    expect(fetch).toHaveBeenCalledWith(
      'http://localhost:4000/api/workspaces',
      expect.objectContaining({ credentials: 'include' }),
    );
    vi.unstubAllGlobals();
  });

  it('reports unauthenticated on 401', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ status: 401, ok: false, json: async () => ({}) }),
    );
    await expect(fetchWorkspaces(apiBase)).resolves.toEqual({
      ok: false,
      unauthenticated: true,
    });
    vi.unstubAllGlobals();
  });

  it('reports failure on server errors, malformed bodies, and network faults', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ status: 500, ok: false, json: async () => ({}) }),
    );
    await expect(fetchWorkspaces(apiBase)).resolves.toEqual({
      ok: false,
      unauthenticated: false,
    });

    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ status: 200, ok: true, json: async () => ({ nope: 1 }) }),
    );
    await expect(fetchWorkspaces(apiBase)).resolves.toEqual({
      ok: false,
      unauthenticated: false,
    });

    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        status: 200,
        ok: true,
        json: async () => {
          throw new Error('bad json');
        },
      }),
    );
    await expect(fetchWorkspaces(apiBase)).resolves.toEqual({
      ok: false,
      unauthenticated: false,
    });

    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));
    await expect(fetchWorkspaces(apiBase)).resolves.toEqual({
      ok: false,
      unauthenticated: false,
    });
    vi.unstubAllGlobals();
  });
});

describe('validateWorkspaceName', () => {
  it('requires a non-blank name', () => {
    expect(validateWorkspaceName('')).toBe('Workspace name is required.');
    expect(validateWorkspaceName('   ')).toBe('Workspace name is required.');
  });

  it('enforces the backend length contract', () => {
    expect(validateWorkspaceName('a'.repeat(MAX_WORKSPACE_NAME_LENGTH))).toBeNull();
    expect(validateWorkspaceName(`  ${'a'.repeat(MAX_WORKSPACE_NAME_LENGTH)}  `)).toBeNull();
    expect(validateWorkspaceName('a'.repeat(MAX_WORKSPACE_NAME_LENGTH + 1))).toBe(
      `Use ${MAX_WORKSPACE_NAME_LENGTH} characters or fewer.`,
    );
  });

  it('accepts normal names', () => {
    expect(validateWorkspaceName('Acme Studio')).toBeNull();
  });
});

describe('createWorkspace', () => {
  const apiBase = 'http://localhost:4000';
  const created: WorkspaceSummary = {
    id: 'ws-9',
    name: 'Acme Studio',
    slug: 'acme-studio',
    role: 'OWNER',
    createdAt: '2026-09-06T00:00:00.000Z',
    updatedAt: '2026-09-06T00:00:00.000Z',
  };

  it('sends only the name and returns the created workspace', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      status: 201,
      ok: true,
      json: async () => ({ workspace: created }),
    });
    vi.stubGlobal('fetch', fetchMock);

    await expect(createWorkspace(apiBase, 'Acme Studio')).resolves.toEqual({
      ok: true,
      workspace: created,
    });
    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:4000/api/workspaces',
      expect.objectContaining({
        method: 'POST',
        credentials: 'include',
        body: JSON.stringify({ name: 'Acme Studio' }),
      }),
    );
    const sent = JSON.parse((fetchMock.mock.calls[0]?.[1] as { body: string }).body) as Record<
      string,
      unknown
    >;
    expect(Object.keys(sent).sort()).toEqual(['name']);
    vi.unstubAllGlobals();
  });

  it('passes through safe validation and conflict messages', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        status: 400,
        ok: false,
        json: async () => ({ error: { code: 'VALIDATION_ERROR', message: 'Enter a name.' } }),
      }),
    );
    await expect(createWorkspace(apiBase, 'x')).resolves.toEqual({
      ok: false,
      kind: 'validation',
      message: 'Enter a name.',
    });

    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        status: 409,
        ok: false,
        json: async () => ({ error: { code: 'CONFLICT', message: 'Taken.' } }),
      }),
    );
    await expect(createWorkspace(apiBase, 'x')).resolves.toEqual({
      ok: false,
      kind: 'conflict',
      message: 'Taken.',
    });
    vi.unstubAllGlobals();
  });

  it('reports unauthenticated, malformed, and transport failures safely', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ status: 401, ok: false, json: async () => ({}) }),
    );
    await expect(createWorkspace(apiBase, 'x')).resolves.toEqual({
      ok: false,
      kind: 'unauthenticated',
    });

    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ status: 201, ok: true, json: async () => ({ nope: 1 }) }),
    );
    await expect(createWorkspace(apiBase, 'x')).resolves.toEqual({
      ok: false,
      kind: 'failed',
    });

    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ status: 500, ok: false, json: async () => ({}) }),
    );
    await expect(createWorkspace(apiBase, 'x')).resolves.toEqual({
      ok: false,
      kind: 'failed',
    });

    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));
    await expect(createWorkspace(apiBase, 'x')).resolves.toEqual({
      ok: false,
      kind: 'failed',
    });
    vi.unstubAllGlobals();
  });
});
