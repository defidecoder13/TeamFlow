import { act, render, renderHook, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useSessionUser } from './use-session-user';
import { WorkspacesProvider, useWorkspaces, useWorkspacesStore } from './use-workspaces';
import type {
  RealtimeWorkspaceDeletedEvent,
  RealtimeWorkspaceMembershipRemovedEvent,
} from './realtime-client';
import type { WorkspaceSummary } from './workspaces';

const pushMock = vi.hoisted(() => vi.fn());
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: pushMock, replace: vi.fn(), refresh: vi.fn() }),
  usePathname: () => '/app',
}));

const {
  fetchWorkspacesMock,
  workspaceRemovedHandlers,
  workspaceDeletedHandlers,
  reconnectHandlers,
} = vi.hoisted(() => ({
  fetchWorkspacesMock: vi.fn(),
  workspaceRemovedHandlers: [] as Array<(event: RealtimeWorkspaceMembershipRemovedEvent) => void>,
  workspaceDeletedHandlers: [] as Array<(event: RealtimeWorkspaceDeletedEvent) => void>,
  reconnectHandlers: [] as Array<() => void>,
}));

vi.mock('./workspaces', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./workspaces')>()),
  fetchWorkspaces: fetchWorkspacesMock,
}));

vi.mock('./realtime-client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./realtime-client')>()),
  onRealtimeWorkspaceMembershipRemoved: (
    handler: (event: RealtimeWorkspaceMembershipRemovedEvent) => void,
  ) => {
    workspaceRemovedHandlers.push(handler);
    return () => {};
  },
  onRealtimeWorkspaceDeleted: (handler: (event: RealtimeWorkspaceDeletedEvent) => void) => {
    workspaceDeletedHandlers.push(handler);
    return () => {
      const index = workspaceDeletedHandlers.indexOf(handler);
      if (index !== -1) workspaceDeletedHandlers.splice(index, 1);
    };
  },
  onRealtimeReconnect: (handler: () => void) => {
    reconnectHandlers.push(handler);
    return () => {
      const index = reconnectHandlers.indexOf(handler);
      if (index !== -1) reconnectHandlers.splice(index, 1);
    };
  },
}));

vi.mock('./use-session-user', () => ({
  useSessionUser: vi.fn(),
}));

const mockedUseSessionUser = vi.mocked(useSessionUser);

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
  slug: 'side-project',
  role: 'MEMBER',
  createdAt: '2026-09-07T00:00:00.000Z',
  updatedAt: '2026-09-07T00:00:00.000Z',
};

function authenticatedSession() {
  mockedUseSessionUser.mockReturnValue({
    status: 'authenticated',
    user: {
      id: 'user-1',
      name: 'Ada Lovelace',
      email: 'ada@example.com',
      image: null,
      emailVerified: true,
    },
    refresh: vi.fn(),
    setUser: vi.fn(),
  });
}

beforeEach(() => {
  fetchWorkspacesMock.mockReset();
  mockedUseSessionUser.mockReset();
  pushMock.mockReset();
  workspaceRemovedHandlers.length = 0;
  workspaceDeletedHandlers.length = 0;
  reconnectHandlers.length = 0;
  localStorage.clear();
  vi.stubEnv('NEXT_PUBLIC_API_URL', 'http://localhost:4000');
});

describe('useWorkspacesStore', () => {
  it('stays idle until enabled', () => {
    const { result } = renderHook(() => useWorkspacesStore(false));

    expect(result.current.state).toEqual({ status: 'idle' });
    expect(fetchWorkspacesMock).not.toHaveBeenCalled();
  });

  it('loads workspaces and selects the first as current', async () => {
    fetchWorkspacesMock.mockResolvedValue({ ok: true, workspaces: [FIRST, SECOND] });
    const { result } = renderHook(() => useWorkspacesStore(true));

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
    const { result } = renderHook(() => useWorkspacesStore(true));

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

  it('refetches instead of dropping a creation that lands while not ready', async () => {
    fetchWorkspacesMock.mockResolvedValue({ ok: false, unauthenticated: false });
    const { result } = renderHook(() => useWorkspacesStore(true));

    await waitFor(() => {
      expect(result.current.state.status).toBe('error');
    });
    const callsBefore = fetchWorkspacesMock.mock.calls.length;

    // Creating from the rail while the list is in error: the merge target
    // does not exist, so the persisted id must drive selection on refetch.
    fetchWorkspacesMock.mockResolvedValue({ ok: true, workspaces: [FIRST, SECOND] });
    act(() => {
      result.current.addWorkspace(SECOND);
    });

    expect(fetchWorkspacesMock.mock.calls.length).toBeGreaterThan(callsBefore);
    await waitFor(() => {
      expect(result.current.state).toEqual({
        status: 'ready',
        workspaces: [FIRST, SECOND],
        current: SECOND,
      });
    });
  });

  it('does not persist a selection for a workspace outside the list', async () => {
    fetchWorkspacesMock.mockResolvedValue({ ok: true, workspaces: [FIRST] });
    const { result } = renderHook(() => useWorkspacesStore(true));

    await waitFor(() => {
      expect(result.current.state.status).toBe('ready');
    });
    expect(localStorage.getItem('teamflow:workspaceId')).toBeNull();

    act(() => {
      result.current.setCurrentWorkspace('ws-gone');
    });

    expect(result.current.state).toEqual({
      status: 'ready',
      workspaces: [FIRST],
      current: FIRST,
    });
    expect(localStorage.getItem('teamflow:workspaceId')).toBeNull();
  });

  it('surfaces unauthenticated and error states with retry', async () => {
    fetchWorkspacesMock.mockResolvedValue({ ok: false, unauthenticated: true });
    const { result, rerender } = renderHook(() => useWorkspacesStore(true));

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

describe('WorkspacesProvider', () => {
  function Probe({ label }: { label: string }) {
    const { state } = useWorkspaces();
    const current = state.status === 'ready' ? (state.current?.name ?? 'none') : state.status;
    return <p data-testid={label}>{current}</p>;
  }

  it('throws when consumed outside the provider', () => {
    expect(() => render(<Probe label="outside" />)).toThrow(
      'useWorkspaces must be used within a WorkspacesProvider.',
    );
  });

  it('shares one list across consumers and propagates switching', async () => {
    authenticatedSession();
    fetchWorkspacesMock.mockResolvedValue({ ok: true, workspaces: [FIRST, SECOND] });

    function Switcher() {
      const { state, setCurrentWorkspace } = useWorkspaces();
      if (state.status !== 'ready') return null;
      return (
        <button type="button" onClick={() => setCurrentWorkspace('ws-2')}>
          switch
        </button>
      );
    }

    render(
      <WorkspacesProvider>
        <Probe label="rail" />
        <Probe label="page" />
        <Switcher />
      </WorkspacesProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId('rail')).toHaveTextContent('First');
    });
    expect(screen.getByTestId('page')).toHaveTextContent('First');
    // Exactly one fetch loop for all consumers.
    expect(fetchWorkspacesMock).toHaveBeenCalledTimes(1);

    act(() => {
      screen.getByRole('button', { name: 'switch' }).click();
    });

    // Both consumers observe the switch immediately.
    expect(screen.getByTestId('rail')).toHaveTextContent('Second');
    expect(screen.getByTestId('page')).toHaveTextContent('Second');
    expect(localStorage.getItem('teamflow:workspaceId')).toBe('ws-2');
  });

  it('propagates creation and deletion to every consumer', async () => {
    authenticatedSession();
    fetchWorkspacesMock.mockResolvedValue({ ok: true, workspaces: [FIRST] });

    function Mutator() {
      const { state, addWorkspace, removeWorkspace } = useWorkspaces();
      if (state.status !== 'ready') return null;
      return (
        <>
          <button type="button" onClick={() => addWorkspace(SECOND)}>
            create
          </button>
          <button type="button" onClick={() => removeWorkspace('ws-1')}>
            delete
          </button>
        </>
      );
    }

    render(
      <WorkspacesProvider>
        <Probe label="rail" />
        <Probe label="page" />
        <Mutator />
      </WorkspacesProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId('rail')).toHaveTextContent('First');
    });

    act(() => {
      screen.getByRole('button', { name: 'create' }).click();
    });
    expect(screen.getByTestId('rail')).toHaveTextContent('Second');
    expect(screen.getByTestId('page')).toHaveTextContent('Second');

    act(() => {
      screen.getByRole('button', { name: 'delete' }).click();
    });
    // Deleting ws-1 leaves ws-2 current in both consumers.
    expect(screen.getByTestId('rail')).toHaveTextContent('Second');
    expect(screen.getByTestId('page')).toHaveTextContent('Second');
  });

  it('restores the persisted workspace on mount', async () => {
    authenticatedSession();
    localStorage.setItem('teamflow:workspaceId', 'ws-2');
    fetchWorkspacesMock.mockResolvedValue({ ok: true, workspaces: [FIRST, SECOND] });

    render(
      <WorkspacesProvider>
        <Probe label="restored" />
      </WorkspacesProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId('restored')).toHaveTextContent('Second');
    });
  });

  it('refetches membership truth when the server reports workspace removal', async () => {
    authenticatedSession();
    fetchWorkspacesMock.mockResolvedValue({ ok: true, workspaces: [FIRST, SECOND] });

    render(
      <WorkspacesProvider>
        <Probe label="restored" />
      </WorkspacesProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId('restored')).toHaveTextContent('First');
    });
    const callsBefore = fetchWorkspacesMock.mock.calls.length;

    // The victim was removed elsewhere: server truth drops ws-1, the
    // provider refetches once and repairs selection to ws-2.
    fetchWorkspacesMock.mockResolvedValue({ ok: true, workspaces: [SECOND] });
    act(() => {
      for (const handler of workspaceRemovedHandlers) {
        handler({ type: 'workspace:membership-removed', workspaceId: 'ws-1', userId: 'user-1' });
      }
    });

    expect(fetchWorkspacesMock.mock.calls.length).toBeGreaterThan(callsBefore);
    await waitFor(() => {
      expect(screen.getByTestId('restored')).toHaveTextContent('Second');
    });
  });
});

describe('WorkspacesProvider workspace:deleted sync', () => {
  function Harness() {
    const { state, retry } = useWorkspaces();
    const summary =
      state.status === 'ready'
        ? `${state.workspaces.map((w) => w.id).join(',')}|${state.current?.id ?? 'none'}`
        : state.status;
    return (
      <>
        <p data-testid="ws-state">{summary}</p>
        <button type="button" onClick={retry}>
          retry-manual
        </button>
      </>
    );
  }

  async function readyProvider(workspaces: WorkspaceSummary[]) {
    authenticatedSession();
    fetchWorkspacesMock.mockResolvedValue({ ok: true, workspaces });
    render(
      <WorkspacesProvider>
        <Harness />
      </WorkspacesProvider>,
    );
    await waitFor(() => {
      expect(screen.getByTestId('ws-state')).toHaveTextContent(
        `${workspaces.map((w) => w.id).join(',')}|`,
      );
    });
  }

  function fireDeleted(workspaceId: string) {
    act(() => {
      for (const handler of [...workspaceDeletedHandlers]) {
        handler({ type: 'workspace:deleted', workspaceId });
      }
    });
  }

  it('removes a non-selected workspace without navigating', async () => {
    await readyProvider([FIRST, SECOND]);
    expect(screen.getByTestId('ws-state')).toHaveTextContent('ws-1,ws-2|ws-1');

    fireDeleted('ws-2');

    expect(screen.getByTestId('ws-state')).toHaveTextContent('ws-1|ws-1');
    expect(pushMock).not.toHaveBeenCalled();
  });

  it('removes the selected workspace, clears selection, and navigates home', async () => {
    await readyProvider([FIRST, SECOND]);

    fireDeleted('ws-1');

    expect(screen.getByTestId('ws-state')).toHaveTextContent('ws-2|ws-2');
    expect(pushMock).toHaveBeenCalledTimes(1);
    expect(pushMock).toHaveBeenCalledWith('/app');
  });

  it('falls back to the empty-workspace state when nothing remains', async () => {
    await readyProvider([FIRST]);

    fireDeleted('ws-1');

    expect(screen.getByTestId('ws-state')).toHaveTextContent('|none');
    expect(pushMock).toHaveBeenCalledWith('/app');
  });

  it('ignores duplicate events idempotently', async () => {
    await readyProvider([FIRST, SECOND]);

    fireDeleted('ws-1');
    fireDeleted('ws-1');

    expect(screen.getByTestId('ws-state')).toHaveTextContent('ws-2|ws-2');
    expect(pushMock).toHaveBeenCalledTimes(1);
  });

  it('never resurrects a deleted workspace from a stale list response', async () => {
    await readyProvider([FIRST, SECOND]);
    fireDeleted('ws-2');

    // A fetch started before the event resolves afterwards (stale truth).
    fetchWorkspacesMock.mockResolvedValue({ ok: true, workspaces: [FIRST, SECOND] });
    await act(async () => {
      await screen.getByRole('button', { name: 'retry-manual' }).click();
    });

    await waitFor(() => {
      expect(screen.getByTestId('ws-state')).toHaveTextContent('ws-1|ws-1');
    });
  });

  it('resyncs silently on reconnect', async () => {
    await readyProvider([FIRST]);
    const callsBefore = fetchWorkspacesMock.mock.calls.length;

    fetchWorkspacesMock.mockResolvedValue({ ok: true, workspaces: [FIRST, SECOND] });
    act(() => {
      for (const handler of [...reconnectHandlers]) {
        handler();
      }
    });

    await waitFor(() => {
      expect(screen.getByTestId('ws-state')).toHaveTextContent('ws-1,ws-2|ws-1');
    });
    expect(fetchWorkspacesMock.mock.calls.length).toBeGreaterThan(callsBefore);
  });
});
