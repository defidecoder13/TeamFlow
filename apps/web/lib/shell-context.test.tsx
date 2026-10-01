import { renderHook, act, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  replaceMock,
  refreshMock,
  signOutMock,
  disconnectMock,
  clearCacheMock,
  joinMock,
  leaveMock,
  reconnectHandlers,
  channelsState,
} = vi.hoisted(() => ({
  replaceMock: vi.fn(),
  refreshMock: vi.fn(),
  signOutMock: vi.fn(),
  disconnectMock: vi.fn(),
  clearCacheMock: vi.fn(),
  joinMock: vi.fn(),
  leaveMock: vi.fn(),
  reconnectHandlers: { list: [] as Array<() => void> },
  channelsState: { value: { status: 'idle' } as unknown },
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: replaceMock, refresh: refreshMock }),
  usePathname: () => '/app',
}));

vi.mock('./auth-client', () => ({
  getAuthClient: () => ({ signOut: signOutMock }),
}));

vi.mock('./realtime-client', () => ({
  onRealtimeMessageNew: vi.fn(),
  joinRealtimeChannel: joinMock,
  leaveRealtimeChannel: leaveMock,
  disconnectRealtime: disconnectMock,
  onRealtimeReconnect: (handler: () => void) => {
    reconnectHandlers.list.push(handler);
    return () => {
      const index = reconnectHandlers.list.indexOf(handler);
      if (index >= 0) {
        reconnectHandlers.list.splice(index, 1);
      }
    };
  },
}));

vi.mock('./attachments', () => ({
  clearAttachmentDownloadUrlCache: clearCacheMock,
}));

vi.mock('./use-session-user', () => ({
  useSessionUser: () => ({
    status: 'authenticated',
    user: {
      id: 'u1',
      name: 'Ada',
      email: 'ada@example.com',
      image: null,
      emailVerified: true,
    },
    refresh: vi.fn(),
    setUser: vi.fn(),
  }),
}));

vi.mock('./use-workspaces', () => ({
  useWorkspaces: () => ({
    state: { status: 'ready', current: null, list: [] },
    refresh: vi.fn(),
    setCurrent: vi.fn(),
  }),
}));

vi.mock('./use-workspace-channels', () => ({
  useWorkspaceChannels: () => ({
    state: channelsState.value,
    updateChannelState: vi.fn(),
    addChannel: vi.fn(),
    removeChannel: vi.fn(),
  }),
}));

vi.mock('./use-direct-conversations', () => ({
  useDirectConversations: () => ({
    state: { status: 'idle' },
    updateConversationState: vi.fn(),
  }),
}));

vi.mock('./use-notifications', () => ({
  useNotifications: () => ({
    state: { status: 'idle', items: [] },
    refresh: vi.fn(),
  }),
}));

vi.mock('./use-presence', () => ({
  usePresence: () => ({ state: { status: 'idle' } }),
}));

vi.mock('./use-workspace-members', () => ({
  useWorkspaceMembers: () => ({ state: { status: 'idle', members: [] } }),
}));

vi.mock('./workspaces', () => ({
  createWorkspace: vi.fn(),
}));

vi.mock('./channels', () => ({
  createChannel: vi.fn(),
  markChannelRead: vi.fn(),
  updateChannelUserState: vi.fn(),
}));

vi.mock('./invitations', () => ({
  createInvitation: vi.fn(),
}));

import { ShellProvider, useShell } from './shell-context';

function renderShell() {
  return renderHook(
    () => useShell(),
    {
      wrapper: ({ children }) => <ShellProvider>{children}</ShellProvider>,
    },
  );
}

beforeEach(() => {
  replaceMock.mockReset();
  refreshMock.mockReset();
  signOutMock.mockReset();
  disconnectMock.mockReset();
  clearCacheMock.mockReset();
  joinMock.mockReset().mockResolvedValue({ ok: true });
  leaveMock.mockReset().mockResolvedValue({ ok: true });
  reconnectHandlers.list.length = 0;
  channelsState.value = { status: 'idle' };
});

describe('ShellProvider.signOut', () => {
  it('calls Better Auth sign-out, tears down realtime/cache, and leaves to /sign-in', async () => {
    signOutMock.mockResolvedValue({ data: { success: true }, error: null });
    const { result } = renderShell();

    await act(async () => {
      await result.current.signOut();
    });

    expect(signOutMock).toHaveBeenCalledTimes(1);
    expect(disconnectMock).toHaveBeenCalledTimes(1);
    expect(clearCacheMock).toHaveBeenCalledTimes(1);
    expect(replaceMock).toHaveBeenCalledWith('/sign-in');
    expect(refreshMock).toHaveBeenCalled();
  });

  it('still leaves when sign-out returns an error (middleware re-verifies)', async () => {
    signOutMock.mockResolvedValue({ data: null, error: { code: 'FAILED' } });
    const { result } = renderShell();

    await act(async () => {
      await result.current.signOut();
    });

    expect(signOutMock).toHaveBeenCalledTimes(1);
    expect(replaceMock).toHaveBeenCalledWith('/sign-in');
    expect(refreshMock).toHaveBeenCalled();
  });

  it('tears down and leaves when sign-out throws', async () => {
    signOutMock.mockRejectedValue(new Error('network down'));
    const { result } = renderShell();

    await act(async () => {
      await result.current.signOut();
    });

    expect(disconnectMock).toHaveBeenCalledTimes(1);
    expect(clearCacheMock).toHaveBeenCalledTimes(1);
    expect(replaceMock).toHaveBeenCalledWith('/sign-in');
  });
});

describe('ShellProvider badge joins', () => {
  const CHANNELS = [
    { id: 'ch-1', slug: 'general' },
    { id: 'ch-2', slug: 'random' },
  ];

  function setReadyChannels() {
    channelsState.value = { status: 'ready', channels: CHANNELS };
  }

  it('joins current channels for off-channel unread badges', async () => {
    setReadyChannels();
    renderShell();

    await waitFor(() => {
      expect(joinMock).toHaveBeenCalledWith('ch-1');
    });
    expect(joinMock).toHaveBeenCalledWith('ch-2');
  });

  it('re-emits joins on reconnect (server rooms are lost on transport drop)', async () => {
    setReadyChannels();
    renderShell();

    await waitFor(() => {
      expect(joinMock).toHaveBeenCalledWith('ch-1');
    });
    const callsBefore = joinMock.mock.calls.length;
    expect(reconnectHandlers.list.length).toBeGreaterThan(0);

    await act(async () => {
      for (const handler of [...reconnectHandlers.list]) {
        handler();
      }
    });

    await waitFor(() => {
      expect(joinMock.mock.calls.length).toBeGreaterThan(callsBefore);
    });
    expect(joinMock).toHaveBeenCalledWith('ch-1');
    expect(joinMock).toHaveBeenCalledWith('ch-2');
  });

  it('leaves joined channels on unmount', async () => {
    setReadyChannels();
    const { unmount } = renderShell();

    await waitFor(() => {
      expect(joinMock).toHaveBeenCalledWith('ch-1');
    });
    unmount();

    expect(leaveMock).toHaveBeenCalledWith('ch-1');
    expect(leaveMock).toHaveBeenCalledWith('ch-2');
  });
});
