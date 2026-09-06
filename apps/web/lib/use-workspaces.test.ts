import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useWorkspaces } from './use-workspaces';
import type { WorkspaceSummary } from './workspaces';

const { fetchWorkspacesMock } = vi.hoisted(() => ({ fetchWorkspacesMock: vi.fn() }));

vi.mock('./workspaces', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./workspaces')>()),
  fetchWorkspaces: fetchWorkspacesMock,
}));

const FIRST: WorkspaceSummary = {
  id: 'ws-1',
  name: 'First',
  slug: 'first',
  role: 'OWNER',
  createdAt: '2026-09-06T00:00:00.000Z',
  updatedAt: '2026-09-06T00:00:00.000Z',
};

const SECOND: WorkspaceSummary = {
  id: 'ws-2',
  name: 'Second',
  slug: 'second',
  role: 'OWNER',
  createdAt: '2026-09-07T00:00:00.000Z',
  updatedAt: '2026-09-07T00:00:00.000Z',
};

beforeEach(() => {
  fetchWorkspacesMock.mockReset();
  vi.stubEnv('NEXT_PUBLIC_API_URL', 'http://localhost:4000');
});

describe('useWorkspaces', () => {
  it('stays idle until enabled', () => {
    const { result } = renderHook(() => useWorkspaces(false));

    expect(result.current.state).toEqual({ status: 'idle' });
    expect(fetchWorkspacesMock).not.toHaveBeenCalled();
  });

  it('loads workspaces and selects the first as current', async () => {
    fetchWorkspacesMock.mockResolvedValue({ ok: true, workspaces: [FIRST, SECOND] });
    const { result } = renderHook(() => useWorkspaces(true));

    await waitFor(() => {
      expect(result.current.state.status).toBe('ready');
    });
    expect(result.current.state).toEqual({
      status: 'ready',
      workspaces: [FIRST, SECOND],
      current: FIRST,
    });
  });

  it('merges a created workspace and makes it current without refetching', async () => {
    fetchWorkspacesMock.mockResolvedValue({ ok: true, workspaces: [FIRST] });
    const { result } = renderHook(() => useWorkspaces(true));

    await waitFor(() => {
      expect(result.current.state.status).toBe('ready');
    });

    const callsBefore = fetchWorkspacesMock.mock.calls.length;
    act(() => {
      result.current.addWorkspace(SECOND);
    });
    expect(result.current.state).toEqual({
      status: 'ready',
      workspaces: [FIRST, SECOND],
      current: SECOND,
    });
    expect(fetchWorkspacesMock.mock.calls.length).toBe(callsBefore);
  });

  it('surfaces unauthenticated and error states with retry', async () => {
    fetchWorkspacesMock.mockResolvedValue({ ok: false, unauthenticated: true });
    const { result, rerender } = renderHook(() => useWorkspaces(true));

    await waitFor(() => {
      expect(result.current.state).toEqual({ status: 'unauthenticated' });
    });

    fetchWorkspacesMock.mockResolvedValue({ ok: false, unauthenticated: false });
    rerender();
    act(() => {
      result.current.retry();
    });
    await waitFor(() => {
      expect(result.current.state.status).toBe('error');
    });
  });
});
