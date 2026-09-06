import { describe, expect, it, vi } from 'vitest';
import { fetchWorkspaceMembers, parseMembersResponse, type WorkspaceMember } from './members';

const OWNER: WorkspaceMember = {
  id: 'm-1',
  role: 'OWNER',
  createdAt: '2026-09-06T00:00:00.000Z',
  user: { id: 'u-1', name: 'Ada Lovelace', email: 'ada@example.com', image: null },
};

const ADMIN: WorkspaceMember = {
  id: 'm-2',
  role: 'ADMIN',
  createdAt: '2026-09-06T00:00:00.000Z',
  user: { id: 'u-2', name: 'Grace Hopper', email: 'grace@example.com', image: null },
};

describe('parseMembersResponse', () => {
  it('accepts a well-formed payload', () => {
    expect(parseMembersResponse({ members: [OWNER, ADMIN] })).toEqual([OWNER, ADMIN]);
    expect(parseMembersResponse({ members: [] })).toEqual([]);
  });

  it('rejects malformed payloads', () => {
    expect(parseMembersResponse(null)).toBeNull();
    expect(parseMembersResponse({})).toBeNull();
    expect(parseMembersResponse({ members: null })).toBeNull();
    expect(parseMembersResponse({ members: [{ id: 'm-1' }] })).toBeNull();
    expect(parseMembersResponse({ members: [{ ...OWNER, role: 'SUPERADMIN' }] })).toBeNull();
    expect(
      parseMembersResponse({ members: [{ ...OWNER, user: { ...OWNER.user, email: '' } }] }),
    ).toBeNull();
  });
});

describe('fetchWorkspaceMembers', () => {
  const apiBase = 'http://localhost:4000';

  it('returns members on success', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      status: 200,
      ok: true,
      json: async () => ({ members: [OWNER] }),
    });
    vi.stubGlobal('fetch', fetchMock);

    await expect(fetchWorkspaceMembers(apiBase, 'ws-1')).resolves.toEqual({
      ok: true,
      members: [OWNER],
    });
    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:4000/api/workspaces/ws-1/members',
      expect.objectContaining({ credentials: 'include' }),
    );
    vi.unstubAllGlobals();
  });

  it('reports unauthenticated on 401', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ status: 401, ok: false, json: async () => ({}) }),
    );
    await expect(fetchWorkspaceMembers(apiBase, 'ws-1')).resolves.toEqual({
      ok: false,
      unauthenticated: true,
    });
    vi.unstubAllGlobals();
  });

  it('reports failure on server errors, malformed bodies, and network faults', async () => {
    const failed = { ok: false, unauthenticated: false };

    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ status: 500, ok: false, json: async () => ({}) }),
    );
    await expect(fetchWorkspaceMembers(apiBase, 'ws-1')).resolves.toEqual(failed);

    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ status: 200, ok: true, json: async () => ({ nope: 1 }) }),
    );
    await expect(fetchWorkspaceMembers(apiBase, 'ws-1')).resolves.toEqual(failed);

    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));
    await expect(fetchWorkspaceMembers(apiBase, 'ws-1')).resolves.toEqual(failed);
    vi.unstubAllGlobals();
  });
});
