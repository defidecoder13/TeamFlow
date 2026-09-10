import { describe, expect, it, vi } from 'vitest';
import { deleteWorkspace, updateWorkspace } from './workspaces';

describe('updateWorkspace', () => {
  const apiBase = 'http://localhost:4000';
  const ws = {
    id: 'ws1',
    name: 'New',
    slug: 'new',
    role: 'OWNER' as const,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  };
  it('sends PATCH with name', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue({ status: 200, ok: true, json: async () => ({ workspace: ws }) });
    vi.stubGlobal('fetch', fetchMock);
    await expect(updateWorkspace(apiBase, 'ws1', 'New')).resolves.toEqual({
      ok: true,
      workspace: ws,
    });
    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:4000/api/workspaces/ws1',
      expect.objectContaining({ method: 'PATCH', body: JSON.stringify({ name: 'New' }) }),
    );
    vi.unstubAllGlobals();
  });
  it('handles 400/401/403/404', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        status: 400,
        ok: false,
        json: async () => ({ error: { message: 'Bad' } }),
      }),
    );
    await expect(updateWorkspace(apiBase, 'ws1', '')).resolves.toMatchObject({
      kind: 'validation',
    });
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ status: 401, ok: false, json: async () => ({}) }),
    );
    await expect(updateWorkspace(apiBase, 'ws1', 'New')).resolves.toMatchObject({
      kind: 'unauthenticated',
    });
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ status: 403, ok: false, json: async () => ({}) }),
    );
    await expect(updateWorkspace(apiBase, 'ws1', 'New')).resolves.toMatchObject({
      kind: 'forbidden',
    });
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ status: 404, ok: false, json: async () => ({}) }),
    );
    await expect(updateWorkspace(apiBase, 'ws1', 'New')).resolves.toMatchObject({
      kind: 'notFound',
    });
    vi.unstubAllGlobals();
  });
});

describe('deleteWorkspace', () => {
  const apiBase = 'http://localhost:4000';
  it('sends DELETE', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ status: 204, ok: true, json: async () => ({}) });
    vi.stubGlobal('fetch', fetchMock);
    await expect(deleteWorkspace(apiBase, 'ws1')).resolves.toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:4000/api/workspaces/ws1',
      expect.objectContaining({ method: 'DELETE' }),
    );
    vi.unstubAllGlobals();
  });
  it('handles 403/404', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ status: 403, ok: false, json: async () => ({}) }),
    );
    await expect(deleteWorkspace(apiBase, 'ws1')).resolves.toMatchObject({ kind: 'forbidden' });
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ status: 404, ok: false, json: async () => ({}) }),
    );
    await expect(deleteWorkspace(apiBase, 'ws1')).resolves.toMatchObject({ kind: 'notFound' });
    vi.unstubAllGlobals();
  });
});
