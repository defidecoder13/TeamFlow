import { describe, expect, it, vi, beforeEach } from 'vitest';
import { acceptInvitation, createInvitation, revokeInvitation } from './invitations';

describe('createInvitation', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('sends email only when role is omitted, and includes role when provided', async () => {
    const invitation = {
      id: 'inv-1',
      email: 'a@b.co',
      expiresAt: '2026-09-30T00:00:00.000Z',
      createdAt: '2026-09-23T00:00:00.000Z',
      token: 'tok',
    };
    const noRole = vi.fn().mockResolvedValue({
      ok: true,
      status: 201,
      json: async () => ({ invitation }),
    });
    global.fetch = noRole;
    await expect(createInvitation('http://localhost:4000', 'ws-1', 'a@b.co')).resolves.toEqual({
      ok: true,
      invitation,
    });
    expect(JSON.parse((noRole.mock.calls[0]?.[1] as { body: string }).body)).toEqual({
      email: 'a@b.co',
    });

    const withRole = vi.fn().mockResolvedValue({
      ok: true,
      status: 201,
      json: async () => ({ invitation }),
    });
    global.fetch = withRole;
    await expect(
      createInvitation('http://localhost:4000', 'ws-1', 'a@b.co', 'ADMIN'),
    ).resolves.toEqual({ ok: true, invitation });
    expect(JSON.parse((withRole.mock.calls[0]?.[1] as { body: string }).body)).toEqual({
      email: 'a@b.co',
      role: 'ADMIN',
    });
  });

  it('maps validation, conflict, and transport failures', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 400,
      json: async () => ({ error: { message: 'Enter an email.' } }),
    });
    expect(await createInvitation('http://localhost:4000', 'ws-1', 'bad')).toEqual({
      ok: false,
      kind: 'validation',
      message: 'Enter an email.',
    });

    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 409,
      json: async () => ({ error: { message: 'Pending.' } }),
    });
    expect(await createInvitation('http://localhost:4000', 'ws-1', 'a@b.co')).toEqual({
      ok: false,
      kind: 'conflict',
      message: 'Pending.',
    });

    global.fetch = vi.fn().mockRejectedValue(new Error('offline'));
    expect(await createInvitation('http://localhost:4000', 'ws-1', 'a@b.co')).toEqual({
      ok: false,
      kind: 'failed',
    });
  });
});

describe('revokeInvitation', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('sends DELETE and returns the revoked id on success', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ invitation: { id: 'inv-1' } }),
    });
    global.fetch = mockFetch;

    const res = await revokeInvitation('http://localhost:4000', 'ws-1', 'inv-1');

    expect(res).toEqual({ ok: true, invitationId: 'inv-1' });
    expect(mockFetch).toHaveBeenCalledWith(
      'http://localhost:4000/api/workspaces/ws-1/invitations/inv-1',
      expect.objectContaining({ method: 'DELETE', credentials: 'include' }),
    );
  });

  it('maps 401, 403, and 404 distinctly', async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: false, status: 401, json: async () => ({}) });
    expect(await revokeInvitation('http://localhost:4000', 'ws-1', 'inv-1')).toEqual({
      ok: false,
      kind: 'unauthenticated',
    });

    global.fetch = vi.fn().mockResolvedValue({ ok: false, status: 403, json: async () => ({}) });
    expect(await revokeInvitation('http://localhost:4000', 'ws-1', 'inv-1')).toEqual({
      ok: false,
      kind: 'forbidden',
    });

    global.fetch = vi.fn().mockResolvedValue({ ok: false, status: 404, json: async () => ({}) });
    expect(await revokeInvitation('http://localhost:4000', 'ws-1', 'inv-1')).toEqual({
      ok: false,
      kind: 'notFound',
    });
  });

  it('treats malformed success payloads and transport failures as failed', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ invitation: {} }),
    });
    expect((await revokeInvitation('http://localhost:4000', 'ws-1', 'inv-1')).ok).toBe(false);

    global.fetch = vi.fn().mockRejectedValue(new Error('offline'));
    const res = await revokeInvitation('http://localhost:4000', 'ws-1', 'inv-1');
    expect(res).toEqual({ ok: false, kind: 'failed' });
  });
});

describe('acceptInvitation', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  const workspace = { id: 'ws-1', name: 'Real Workspace', slug: 'real-workspace' };

  it('posts the token and returns the workspace with the already-member flag', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ workspace, alreadyMember: false }),
    });
    global.fetch = fetchMock;

    await expect(acceptInvitation('http://localhost:4000', 'tok-123')).resolves.toEqual({
      ok: true,
      workspace,
      alreadyMember: false,
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [, init] = fetchMock.mock.calls[0] as [string, { body: string }];
    expect(JSON.parse(init.body)).toEqual({ token: 'tok-123' });

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ workspace, alreadyMember: true }),
    });
    await expect(acceptInvitation('http://localhost:4000', 'tok-123')).resolves.toEqual({
      ok: true,
      workspace,
      alreadyMember: true,
    });
  });

  it('maps unauthenticated, invalid, forbidden, and transport failures', async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: false, status: 401, json: async () => ({}) });
    expect(await acceptInvitation('http://localhost:4000', 'tok')).toEqual({
      ok: false,
      kind: 'unauthenticated',
    });

    global.fetch = vi.fn().mockResolvedValue({ ok: false, status: 404, json: async () => ({}) });
    expect(await acceptInvitation('http://localhost:4000', 'tok')).toEqual({
      ok: false,
      kind: 'invalid',
    });

    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 403,
      json: async () => ({ error: { message: 'Different email.' } }),
    });
    expect(await acceptInvitation('http://localhost:4000', 'tok')).toEqual({
      ok: false,
      kind: 'forbidden',
      message: 'Different email.',
    });

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ workspace: { id: 'ws-1' } }),
    });
    expect((await acceptInvitation('http://localhost:4000', 'tok')).ok).toBe(false);

    global.fetch = vi.fn().mockRejectedValue(new Error('offline'));
    expect(await acceptInvitation('http://localhost:4000', 'tok')).toEqual({
      ok: false,
      kind: 'failed',
    });
  });

  it('retries once on 409 conflict and resolves to the already-member path', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, status: 409, json: async () => ({}) })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ workspace, alreadyMember: true }),
      });
    global.fetch = fetchMock;

    await expect(acceptInvitation('http://localhost:4000', 'tok-race')).resolves.toEqual({
      ok: true,
      workspace,
      alreadyMember: true,
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('surfaces failed after two consecutive conflicts', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue({ ok: false, status: 409, json: async () => ({}) });
    global.fetch = fetchMock;

    expect(await acceptInvitation('http://localhost:4000', 'tok')).toEqual({
      ok: false,
      kind: 'failed',
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
