import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { usePendingInvitations } from './use-pending-invitations';
import type { PendingInvitation } from './invitations';

const { fetchPendingMock } = vi.hoisted(() => ({ fetchPendingMock: vi.fn() }));

vi.mock('./invitations', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./invitations')>()),
  fetchPendingInvitations: fetchPendingMock,
}));

const INVITE: PendingInvitation = {
  id: 'inv-1',
  email: 'newbie@example.com',
  expiresAt: '2026-09-13T00:00:00.000Z',
  createdAt: '2026-09-06T00:00:00.000Z',
  invitedBy: { id: 'u-1', name: 'Ada Lovelace', email: 'ada@example.com' },
};

beforeEach(() => {
  fetchPendingMock.mockReset();
  vi.stubEnv('NEXT_PUBLIC_API_URL', 'http://localhost:4000');
});

describe('usePendingInvitations', () => {
  it('stays idle without a workspace', () => {
    const { result } = renderHook(() => usePendingInvitations(null));

    expect(result.current.state).toEqual({ status: 'idle' });
    expect(fetchPendingMock).not.toHaveBeenCalled();
  });

  it('loads pending invitations for a workspace', async () => {
    fetchPendingMock.mockResolvedValue({ ok: true, invitations: [INVITE] });
    const { result } = renderHook(() => usePendingInvitations('ws-1'));

    await waitFor(() => {
      expect(result.current.state).toEqual({ status: 'ready', invitations: [INVITE] });
    });
    expect(fetchPendingMock).toHaveBeenCalledWith('http://localhost:4000', 'ws-1');
  });

  it('merges created invitations and retries failures', async () => {
    fetchPendingMock.mockResolvedValue({ ok: true, invitations: [] });
    const { result } = renderHook(() => usePendingInvitations('ws-1'));

    await waitFor(() => {
      expect(result.current.state.status).toBe('ready');
    });
    act(() => {
      result.current.addInvitation(INVITE);
    });
    expect(result.current.state).toEqual({ status: 'ready', invitations: [INVITE] });

    fetchPendingMock.mockResolvedValue({ ok: false, unauthenticated: false });
    act(() => {
      result.current.retry();
    });
    await waitFor(() => {
      expect(result.current.state.status).toBe('error');
    });
  });
});
