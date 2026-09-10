import { describe, expect, it, vi } from 'vitest';
import { deleteChannel, leaveChannel } from './channels';

describe('deleteChannel', () => {
  const apiBase = 'http://localhost:4000';
  it('DELETE succeeds', async () => {
    const f = vi.fn().mockResolvedValue({ status: 204, ok: true, json: async () => ({}) });
    vi.stubGlobal('fetch', f);
    await expect(deleteChannel(apiBase, 'ws1', 'general')).resolves.toEqual({ ok: true });
    expect(f).toHaveBeenCalledWith(
      'http://localhost:4000/api/workspaces/ws1/channels/general',
      expect.objectContaining({ method: 'DELETE' }),
    );
    vi.unstubAllGlobals();
  });
  it('handles 403/404', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ status: 403, ok: false, json: async () => ({}) }),
    );
    await expect(deleteChannel(apiBase, 'ws1', 'general')).resolves.toMatchObject({
      kind: 'forbidden',
    });
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ status: 404, ok: false, json: async () => ({}) }),
    );
    await expect(deleteChannel(apiBase, 'ws1', 'general')).resolves.toMatchObject({
      kind: 'notFound',
    });
    vi.unstubAllGlobals();
  });
});

describe('leaveChannel', () => {
  const apiBase = 'http://localhost:4000';
  it('DELETE members/me', async () => {
    const f = vi.fn().mockResolvedValue({ status: 204, ok: true, json: async () => ({}) });
    vi.stubGlobal('fetch', f);
    await expect(leaveChannel(apiBase, 'ws1', 'general')).resolves.toEqual({ ok: true });
    expect(f).toHaveBeenCalledWith(
      'http://localhost:4000/api/workspaces/ws1/channels/general/members/me',
      expect.objectContaining({ method: 'DELETE' }),
    );
    vi.unstubAllGlobals();
  });
  it('handles 404', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ status: 404, ok: false, json: async () => ({}) }),
    );
    await expect(leaveChannel(apiBase, 'ws1', 'general')).resolves.toMatchObject({
      kind: 'notFound',
    });
    vi.unstubAllGlobals();
  });
});
