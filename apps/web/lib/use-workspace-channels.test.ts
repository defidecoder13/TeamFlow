import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useWorkspaceChannels } from './use-workspace-channels';
import { useWorkspaceChannel } from './use-workspace-channel';
import type { Channel } from './channels';

const { fetchChannelsMock, fetchChannelMock } = vi.hoisted(() => ({
  fetchChannelsMock: vi.fn(),
  fetchChannelMock: vi.fn(),
}));

vi.mock('./channels', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./channels')>()),
  fetchChannels: fetchChannelsMock,
  fetchChannel: fetchChannelMock,
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
    expect(result.current.state).toEqual({ status: 'ready', channels: [ENGINEERING, DESIGN] });

    const renamed = { ...ENGINEERING, name: 'Eng', slug: 'eng' };
    act(() => {
      result.current.updateChannelState(renamed);
    });
    expect(result.current.state).toEqual({ status: 'ready', channels: [renamed, DESIGN] });

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
