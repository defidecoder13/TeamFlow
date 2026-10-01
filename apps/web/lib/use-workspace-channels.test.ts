import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useWorkspaceChannels } from './use-workspace-channels';
import { useWorkspaceChannel } from './use-workspace-channel';
import type { Channel } from './channels';
import type {
  RealtimeChannelCreatedEvent,
  RealtimeChannelDeletedEvent,
  RealtimeChannelMembershipRemovedEvent,
  RealtimeChannelUpdatedEvent,
} from './realtime-client';

const {
  fetchChannelsMock,
  fetchChannelMock,
  channelRemovedHandlers,
  channelCreatedHandlers,
  channelUpdatedHandlers,
  channelDeletedHandlers,
  reconnectHandlers,
} = vi.hoisted(() => ({
  fetchChannelsMock: vi.fn(),
  fetchChannelMock: vi.fn(),
  channelRemovedHandlers: [] as Array<(event: RealtimeChannelMembershipRemovedEvent) => void>,
  channelCreatedHandlers: [] as Array<(event: RealtimeChannelCreatedEvent) => void>,
  channelUpdatedHandlers: [] as Array<(event: RealtimeChannelUpdatedEvent) => void>,
  channelDeletedHandlers: [] as Array<(event: RealtimeChannelDeletedEvent) => void>,
  reconnectHandlers: [] as Array<() => void>,
}));

vi.mock('./channels', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./channels')>()),
  fetchChannels: fetchChannelsMock,
  fetchChannel: fetchChannelMock,
}));

vi.mock('./realtime-client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./realtime-client')>()),
  onRealtimeChannelMembershipRemoved: (
    handler: (event: RealtimeChannelMembershipRemovedEvent) => void,
  ) => {
    channelRemovedHandlers.push(handler);
    return () => {};
  },
  onRealtimeChannelCreated: (handler: (event: RealtimeChannelCreatedEvent) => void) => {
    channelCreatedHandlers.push(handler);
    return () => {};
  },
  onRealtimeChannelUpdated: (handler: (event: RealtimeChannelUpdatedEvent) => void) => {
    channelUpdatedHandlers.push(handler);
    return () => {};
  },
  onRealtimeChannelDeleted: (handler: (event: RealtimeChannelDeletedEvent) => void) => {
    channelDeletedHandlers.push(handler);
    return () => {};
  },
  onRealtimeReconnect: (handler: () => void) => {
    reconnectHandlers.push(handler);
    return () => {};
  },
}));

const ENGINEERING: Channel = {
  id: 'ch-1',
  name: 'Engineering',
  slug: 'engineering',
  description: null,
  type: 'PUBLIC',
  createdAt: '2026-09-06T00:00:00.000Z',
  updatedAt: '2026-09-06T00:00:00.000Z',
};

const DESIGN: Channel = {
  id: 'ch-2',
  name: 'Design',
  slug: 'design',
  description: null,
  type: 'PRIVATE',
  createdAt: '2026-09-06T00:00:00.000Z',
  updatedAt: '2026-09-06T00:00:00.000Z',
};

beforeEach(() => {
  fetchChannelsMock.mockReset();
  fetchChannelMock.mockReset();
  channelRemovedHandlers.length = 0;
  channelCreatedHandlers.length = 0;
  channelUpdatedHandlers.length = 0;
  channelDeletedHandlers.length = 0;
  reconnectHandlers.length = 0;
  vi.stubEnv('NEXT_PUBLIC_API_URL', 'http://localhost:4000');
});

describe('useWorkspaceChannels', () => {
  it('stays idle without a workspace', () => {
    const { result } = renderHook(() => useWorkspaceChannels(null));

    expect(result.current.state).toEqual({ status: 'idle' });
    expect(fetchChannelsMock).not.toHaveBeenCalled();
  });

  it('loads, adds, updates, and retries', async () => {
    fetchChannelsMock.mockResolvedValue({ ok: true, channels: [ENGINEERING] });
    const { result } = renderHook(() => useWorkspaceChannels('ws-1'));

    await waitFor(() => {
      expect(result.current.state).toEqual({ status: 'ready', channels: [ENGINEERING] });
    });

    act(() => {
      result.current.addChannel(DESIGN);
    });
    // Ordered insert preserves the server's (name asc, id asc) convention.
    expect(result.current.state).toEqual({ status: 'ready', channels: [DESIGN, ENGINEERING] });

    const renamed = { ...ENGINEERING, name: 'Eng', slug: 'eng' };
    act(() => {
      result.current.updateChannelState(renamed);
    });
    expect(result.current.state).toEqual({ status: 'ready', channels: [DESIGN, renamed] });

    fetchChannelsMock.mockResolvedValue({ ok: false, unauthenticated: false });
    act(() => {
      result.current.retry();
    });
    await waitFor(() => {
      expect(result.current.state.status).toBe('error');
    });
  });
});

describe('useWorkspaceChannel', () => {
  it('loads one channel and reports not found distinctly', async () => {
    fetchChannelMock.mockResolvedValue({ ok: true, channel: ENGINEERING });
    const { result, rerender } = renderHook(
      ({ slug }: { slug: string }) => useWorkspaceChannel('ws-1', slug),
      { initialProps: { slug: 'engineering' } },
    );

    await waitFor(() => {
      expect(result.current.state).toEqual({ status: 'ready', channel: ENGINEERING });
    });
    expect(fetchChannelMock).toHaveBeenCalledWith('http://localhost:4000', 'ws-1', 'engineering');

    fetchChannelMock.mockResolvedValue({ ok: false, kind: 'notFound' });
    rerender({ slug: 'missing' });
    await waitFor(() => {
      expect(result.current.state).toEqual({ status: 'notFound' });
    });
  });

  it('marks the open view inaccessible on channel:deleted', async () => {
    fetchChannelMock.mockResolvedValue({ ok: true, channel: ENGINEERING });
    const { result } = renderHook(() => useWorkspaceChannel('ws-1', 'engineering'));

    await waitFor(() => {
      expect(result.current.state).toEqual({ status: 'ready', channel: ENGINEERING });
    });

    act(() => {
      for (const handler of [...channelDeletedHandlers]) {
        handler({ type: 'channel:deleted', workspaceId: 'ws-1', channelId: 'ch-1' });
      }
    });
    expect(result.current.state).toEqual({ status: 'notFound' });
  });

  it('ignores channel:deleted for other channels, workspaces, and loading views', async () => {
    fetchChannelMock.mockResolvedValue({ ok: true, channel: ENGINEERING });
    const { result } = renderHook(() => useWorkspaceChannel('ws-1', 'engineering'));

    await waitFor(() => {
      expect(result.current.state.status).toBe('ready');
    });

    act(() => {
      for (const handler of [...channelDeletedHandlers]) {
        handler({ type: 'channel:deleted', workspaceId: 'ws-1', channelId: 'ch-9' });
        handler({ type: 'channel:deleted', workspaceId: 'ws-9', channelId: 'ch-1' });
      }
    });
    expect(result.current.state).toEqual({ status: 'ready', channel: ENGINEERING });
  });

  it('drops a channel pushed as membership-removed without refetching', async () => {
    fetchChannelsMock.mockResolvedValue({ ok: true, channels: [ENGINEERING, DESIGN] });
    const { result } = renderHook(() => useWorkspaceChannels('ws-1'));

    await waitFor(() => {
      expect(result.current.state).toEqual({
        status: 'ready',
        channels: [ENGINEERING, DESIGN],
      });
    });
    const callsBefore = fetchChannelsMock.mock.calls.length;

    act(() => {
      for (const handler of channelRemovedHandlers) {
        handler({
          type: 'channel:membership-removed',
          workspaceId: 'ws-1',
          channelId: 'ch-2',
          userId: 'u-1',
        });
      }
    });

    expect(result.current.state).toEqual({ status: 'ready', channels: [ENGINEERING] });
    expect(fetchChannelsMock.mock.calls.length).toBe(callsBefore);

    // Events for other workspaces are ignored.
    act(() => {
      for (const handler of channelRemovedHandlers) {
        handler({
          type: 'channel:membership-removed',
          workspaceId: 'ws-other',
          channelId: 'ch-1',
          userId: 'u-1',
        });
      }
    });
    expect(result.current.state).toEqual({ status: 'ready', channels: [ENGINEERING] });
  });

  it('marks the open view inaccessible when its own membership is removed', async () => {
    fetchChannelMock.mockResolvedValue({ ok: true, channel: ENGINEERING });
    const { result } = renderHook(() => useWorkspaceChannel('ws-1', 'engineering'));

    await waitFor(() => {
      expect(result.current.state).toEqual({ status: 'ready', channel: ENGINEERING });
    });

    act(() => {
      for (const handler of channelRemovedHandlers) {
        handler({
          type: 'channel:membership-removed',
          workspaceId: 'ws-1',
          channelId: 'ch-1',
          userId: 'u-1',
        });
      }
    });
    expect(result.current.state).toEqual({ status: 'notFound' });
  });

  it('ignores membership-removed events for other channels', async () => {
    fetchChannelMock.mockResolvedValue({ ok: true, channel: ENGINEERING });
    const { result } = renderHook(() => useWorkspaceChannel('ws-1', 'engineering'));

    await waitFor(() => {
      expect(result.current.state).toEqual({ status: 'ready', channel: ENGINEERING });
    });

    act(() => {
      for (const handler of channelRemovedHandlers) {
        handler({
          type: 'channel:membership-removed',
          workspaceId: 'ws-1',
          channelId: 'ch-2',
          userId: 'u-1',
        });
      }
    });
    expect(result.current.state).toEqual({ status: 'ready', channel: ENGINEERING });
  });

  it('starts in loading when workspaceId is present and resets to loading on slug change', async () => {
    fetchChannelMock.mockResolvedValue({ ok: true, channel: ENGINEERING });
    const { result, rerender } = renderHook(
      ({ slug }: { slug: string }) => useWorkspaceChannel('ws-1', slug),
      { initialProps: { slug: 'engineering' } },
    );

    // Initial state must be loading, never idle or notFound
    expect(result.current.state).toEqual({ status: 'loading' });

    await waitFor(() => {
      expect(result.current.state).toEqual({ status: 'ready', channel: ENGINEERING });
    });

    // When slug changes to another channel (e.g. private demo), immediately transitions to loading
    fetchChannelMock.mockResolvedValue({ ok: true, channel: DESIGN });
    rerender({ slug: 'demo' });
    expect(result.current.state).toEqual({ status: 'loading' });

    await waitFor(() => {
      expect(result.current.state).toEqual({ status: 'ready', channel: DESIGN });
    });
  });
});

describe('useWorkspaceChannels channel:created sync', () => {
  const RANDOM = {
    id: 'ch-9',
    name: 'Random',
    slug: 'random',
    description: null,
    type: 'PUBLIC' as const,
    createdAt: '2026-09-06T00:00:00.000Z',
    updatedAt: '2026-09-06T00:00:00.000Z',
  };

  async function readyWith(channels: Channel[]) {
    fetchChannelsMock.mockResolvedValue({ ok: true, channels });
    const { result } = renderHook(() => useWorkspaceChannels('ws-1'));
    await waitFor(() => {
      expect(result.current.state.status).toBe('ready');
    });
    return result;
  }

  function fireCreated(channel: Channel, workspaceId = 'ws-1') {
    act(() => {
      for (const handler of [...channelCreatedHandlers]) {
        handler({ type: 'channel:created', workspaceId, channel });
      }
    });
  }

  it('inserts pushed channels in server order without disturbing selection', async () => {
    const result = await readyWith([ENGINEERING]);
    fireCreated(RANDOM);
    expect(result.current.state).toEqual({
      status: 'ready',
      channels: [ENGINEERING, RANDOM],
    });
  });

  it('ignores events for other workspaces and malformed payloads', async () => {
    const result = await readyWith([ENGINEERING]);
    fireCreated(RANDOM, 'ws-9');
    fireCreated({ ...RANDOM, id: 'ch-10', name: '' } as unknown as Channel);
    expect(result.current.state).toEqual({ status: 'ready', channels: [ENGINEERING] });
  });

  it('dedupes double delivery and REST races by id', async () => {
    const result = await readyWith([ENGINEERING]);
    fireCreated(RANDOM);
    fireCreated(RANDOM);
    act(() => {
      result.current.addChannel({ ...RANDOM });
    });
    const state = result.current.state;
    if (state.status !== 'ready') throw new Error('not ready');
    expect(state.channels.filter((c) => c.id === 'ch-9')).toHaveLength(1);
    expect(state.channels.map((c) => c.id)).toEqual(['ch-1', 'ch-9']);
  });

  it('refetches the list on reconnect', async () => {
    const result = await readyWith([ENGINEERING]);
    expect(reconnectHandlers.length).toBeGreaterThan(0);
    fetchChannelsMock.mockResolvedValue({
      ok: true,
      channels: [ENGINEERING, RANDOM],
    });
    act(() => {
      for (const handler of [...reconnectHandlers]) {
        handler();
      }
    });
    await waitFor(() => {
      expect(result.current.state).toEqual({
        status: 'ready',
        channels: [ENGINEERING, RANDOM],
      });
    });
  });
});

describe('useWorkspaceChannels channel:updated/channel:deleted sync', () => {
  const RANDOM: Channel = {
    id: 'ch-9',
    name: 'Random',
    slug: 'random',
    description: null,
    type: 'PUBLIC',
    createdAt: '2026-09-06T00:00:00.000Z',
    updatedAt: '2026-09-06T00:00:00.000Z',
  };

  async function readyWith(channels: Channel[]) {
    fetchChannelsMock.mockResolvedValue({ ok: true, channels });
    const { result } = renderHook(() => useWorkspaceChannels('ws-1'));
    await waitFor(() => {
      expect(result.current.state.status).toBe('ready');
    });
    return result;
  }

  it('merges pushed edits by id and ignores other workspaces', async () => {
    const result = await readyWith([ENGINEERING, RANDOM]);
    const renamed = { ...ENGINEERING, name: 'Aardvark', slug: 'aardvark' };
    act(() => {
      for (const handler of [...channelUpdatedHandlers]) {
        handler({ type: 'channel:updated', workspaceId: 'ws-1', channel: renamed });
      }
    });
    expect(result.current.state).toEqual({
      status: 'ready',
      channels: [renamed, RANDOM],
    });

    act(() => {
      for (const handler of [...channelUpdatedHandlers]) {
        handler({ type: 'channel:updated', workspaceId: 'ws-9', channel: renamed });
      }
    });
    expect(result.current.state).toEqual({
      status: 'ready',
      channels: [renamed, RANDOM],
    });
  });

  it('drops pushed deletions by id and stays silent otherwise', async () => {
    const result = await readyWith([ENGINEERING, RANDOM]);
    act(() => {
      for (const handler of [...channelDeletedHandlers]) {
        handler({ type: 'channel:deleted', workspaceId: 'ws-1', channelId: 'ch-9' });
      }
    });
    expect(result.current.state).toEqual({ status: 'ready', channels: [ENGINEERING] });

    act(() => {
      for (const handler of [...channelDeletedHandlers]) {
        handler({ type: 'channel:deleted', workspaceId: 'ws-1', channelId: 'ch-9' });
        handler({ type: 'channel:deleted', workspaceId: 'ws-9', channelId: 'ch-1' });
      }
    });
    expect(result.current.state).toEqual({ status: 'ready', channels: [ENGINEERING] });
  });
});
