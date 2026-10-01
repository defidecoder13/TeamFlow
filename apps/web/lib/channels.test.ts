import { describe, expect, it, vi } from 'vitest';
import {
  createChannel,
  fetchChannel,
  fetchChannels,
  markChannelRead,
  updateChannel,
  updateChannelUserState,
  type Channel,
} from './channels';

const ENGINEERING: Channel = {
  id: 'ch-1',
  name: 'Engineering',
  slug: 'engineering',
  description: 'Build things',
  type: 'PUBLIC',
  createdAt: '2026-09-06T00:00:00.000Z',
  updatedAt: '2026-09-06T00:00:00.000Z',
};

const apiBase = 'http://localhost:4000';

describe('fetchChannels', () => {
  it('returns the channel list on success', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        status: 200,
        ok: true,
        json: async () => ({ channels: [ENGINEERING] }),
      }),
    );

    await expect(fetchChannels(apiBase, 'ws-1')).resolves.toEqual({
      ok: true,
      channels: [ENGINEERING],
    });
    vi.unstubAllGlobals();
  });

  it('rejects malformed payloads and reports transport states', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ status: 200, ok: true, json: async () => ({ nope: 1 }) }),
    );
    await expect(fetchChannels(apiBase, 'ws-1')).resolves.toEqual({
      ok: false,
      unauthenticated: false,
    });

    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ status: 401, ok: false, json: async () => ({}) }),
    );
    await expect(fetchChannels(apiBase, 'ws-1')).resolves.toEqual({
      ok: false,
      unauthenticated: true,
    });

    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ status: 403, ok: false, json: async () => ({}) }),
    );
    await expect(fetchChannels(apiBase, 'ws-1')).resolves.toEqual({
      ok: false,
      unauthenticated: false,
    });

    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));
    await expect(fetchChannels(apiBase, 'ws-1')).resolves.toEqual({
      ok: false,
      unauthenticated: false,
    });
    vi.unstubAllGlobals();
  });
});

describe('fetchChannel', () => {
  it('returns one channel and maps 404 without leaking', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        status: 200,
        ok: true,
        json: async () => ({ channel: ENGINEERING }),
      }),
    );
    await expect(fetchChannel(apiBase, 'ws-1', 'engineering')).resolves.toEqual({
      ok: true,
      channel: ENGINEERING,
    });

    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ status: 404, ok: false, json: async () => ({}) }),
    );
    await expect(fetchChannel(apiBase, 'ws-1', 'nope')).resolves.toEqual({
      ok: false,
      kind: 'notFound',
    });
    vi.unstubAllGlobals();
  });
});

describe('createChannel', () => {
  it('sends only supported fields including optional topic', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      status: 201,
      ok: true,
      json: async () => ({ channel: ENGINEERING }),
    });
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      createChannel(apiBase, 'ws-1', {
        name: 'Engineering',
        description: 'Build things',
        topic: 'Ship it',
        type: 'PUBLIC',
      }),
    ).resolves.toEqual({ ok: true, channel: ENGINEERING });

    const sent = JSON.parse((fetchMock.mock.calls[0]?.[1] as { body: string }).body) as Record<
      string,
      unknown
    >;
    expect(Object.keys(sent).sort()).toEqual(['description', 'name', 'topic', 'type']);
    vi.unstubAllGlobals();
  });

  it('maps validation, conflict, and failure outcomes', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        status: 400,
        ok: false,
        json: async () => ({ error: { code: 'VALIDATION_ERROR', message: 'Enter a name.' } }),
      }),
    );
    await expect(createChannel(apiBase, 'ws-1', { name: '', type: 'PUBLIC' })).resolves.toEqual({
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
    await expect(
      createChannel(apiBase, 'ws-1', { name: 'Taken', type: 'PUBLIC' }),
    ).resolves.toEqual({ ok: false, kind: 'conflict', message: 'Taken.' });

    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ status: 401, ok: false, json: async () => ({}) }),
    );
    await expect(createChannel(apiBase, 'ws-1', { name: 'x', type: 'PUBLIC' })).resolves.toEqual({
      ok: false,
      kind: 'unauthenticated',
    });
    vi.unstubAllGlobals();
  });
});

describe('updateChannel', () => {
  it('sends only defined fields and maps outcomes', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      status: 200,
      ok: true,
      json: async () => ({ channel: ENGINEERING }),
    });
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      updateChannel(apiBase, 'ws-1', 'engineering', { name: 'Engineering', description: null }),
    ).resolves.toEqual({ ok: true, channel: ENGINEERING });
    const sent = JSON.parse((fetchMock.mock.calls[0]?.[1] as { body: string }).body) as Record<
      string,
      unknown
    >;
    expect(Object.keys(sent).sort()).toEqual(['description', 'name']);
    expect(fetchMock.mock.calls[0]?.[0]).toContain('/api/workspaces/ws-1/channels/engineering');

    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ status: 403, ok: false, json: async () => ({}) }),
    );
    await expect(updateChannel(apiBase, 'ws-1', 'engineering', { name: 'x' })).resolves.toEqual({
      ok: false,
      kind: 'forbidden',
    });
    vi.unstubAllGlobals();
  });
});

describe('updateChannelUserState', () => {
  it('patches star/mute and maps outcomes', async () => {
    const userState = {
      unreadCount: 2,
      hasUnread: true,
      lastReadMessageId: 'm-1',
      isStarred: true,
      isMuted: false,
    };
    const fetchMock = vi.fn().mockResolvedValue({
      status: 200,
      ok: true,
      json: async () => ({ userState }),
    });
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      updateChannelUserState(apiBase, 'ws-1', 'engineering', { isStarred: true }),
    ).resolves.toEqual({ ok: true, userState });
    expect(fetchMock.mock.calls[0]?.[0]).toContain(
      '/api/workspaces/ws-1/channels/engineering/user-state',
    );
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({ method: 'PATCH' });

    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ status: 404, ok: false, json: async () => ({}) }),
    );
    await expect(
      updateChannelUserState(apiBase, 'ws-1', 'nope', { isMuted: true }),
    ).resolves.toEqual({ ok: false, kind: 'notFound' });
    vi.unstubAllGlobals();
  });
});

describe('markChannelRead', () => {
  it('posts the optional message id and maps outcomes', async () => {
    const userState = {
      unreadCount: 0,
      hasUnread: false,
      lastReadMessageId: 'm-9',
      isStarred: false,
      isMuted: false,
    };
    const fetchMock = vi.fn().mockResolvedValue({
      status: 200,
      ok: true,
      json: async () => ({ userState }),
    });
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      markChannelRead(apiBase, 'ws-1', 'engineering', { lastReadMessageId: 'm-9' }),
    ).resolves.toEqual({ ok: true, userState });
    expect(fetchMock.mock.calls[0]?.[0]).toContain('/api/workspaces/ws-1/channels/engineering/read');
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({ method: 'POST' });

    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ status: 401, ok: false, json: async () => ({}) }),
    );
    await expect(markChannelRead(apiBase, 'ws-1', 'engineering')).resolves.toEqual({
      ok: false,
      kind: 'unauthenticated',
    });
    vi.unstubAllGlobals();
  });
});
