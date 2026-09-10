import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useChannelMembers } from './use-channel-members';

const { fetchMembersMock, addMock, removeMock } = vi.hoisted(() => ({
  fetchMembersMock: vi.fn(),
  addMock: vi.fn(),
  removeMock: vi.fn(),
}));

vi.mock('./channels', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./channels')>()),
  fetchChannelMembers: fetchMembersMock,
  addChannelMember: addMock,
  removeChannelMember: removeMock,
}));

const MEMBER_A = {
  id: 'cm-1',
  channelId: 'ch-1',
  userId: 'u-1',
  createdAt: '2026-09-06T00:00:00.000Z',
  user: { id: 'u-1', name: 'Ada', email: 'ada@example.com', image: null },
};
const MEMBER_B = {
  id: 'cm-2',
  channelId: 'ch-1',
  userId: 'u-2',
  createdAt: '2026-09-06T00:00:00.000Z',
  user: { id: 'u-2', name: 'Bob', email: 'bob@example.com', image: null },
};

beforeEach(() => {
  fetchMembersMock.mockReset();
  addMock.mockReset();
  removeMock.mockReset();
  vi.stubEnv('NEXT_PUBLIC_API_URL', 'http://localhost:4000');
});

describe('useChannelMembers', () => {
  it('stays idle when disabled or missing ids', () => {
    const { result } = renderHook(() => useChannelMembers(null, null, false));
    expect(result.current.state).toEqual({ status: 'idle' });
    expect(fetchMembersMock).not.toHaveBeenCalled();
  });

  it('loads members and retries on error', async () => {
    fetchMembersMock.mockResolvedValue({ ok: true, members: [MEMBER_A] });
    const { result } = renderHook(() => useChannelMembers('ws-1', 'engineering', true));
    await waitFor(() =>
      expect(result.current.state).toEqual({ status: 'ready', members: [MEMBER_A] }),
    );

    fetchMembersMock.mockResolvedValue({ ok: false, kind: 'failed' });
    act(() => result.current.retry());
    await waitFor(() => expect(result.current.state.status).toBe('error'));
  });

  it('adds member and updates list', async () => {
    fetchMembersMock.mockResolvedValue({ ok: true, members: [MEMBER_A] });
    const { result } = renderHook(() => useChannelMembers('ws-1', 'engineering', true));
    await waitFor(() => expect(result.current.state.status).toBe('ready'));

    addMock.mockResolvedValue({ ok: true, member: MEMBER_B });
    await act(async () => {
      const res = await result.current.addMember('u-2');
      expect(res.ok).toBe(true);
    });
    expect(result.current.state).toEqual({ status: 'ready', members: [MEMBER_A, MEMBER_B] });
  });

  it('removes member and updates list', async () => {
    fetchMembersMock.mockResolvedValue({ ok: true, members: [MEMBER_A, MEMBER_B] });
    const { result } = renderHook(() => useChannelMembers('ws-1', 'engineering', true));
    await waitFor(() => expect(result.current.state.status).toBe('ready'));

    removeMock.mockResolvedValue({ ok: true });
    await act(async () => {
      const res = await result.current.removeMember('u-1');
      expect(res.ok).toBe(true);
    });
    expect(result.current.state).toEqual({ status: 'ready', members: [MEMBER_B] });
  });

  it('handles unauthenticated', async () => {
    fetchMembersMock.mockResolvedValue({ ok: false, kind: 'unauthenticated' });
    const { result } = renderHook(() => useChannelMembers('ws-1', 'engineering', true));
    await waitFor(() => expect(result.current.state).toEqual({ status: 'unauthenticated' }));
  });
});
