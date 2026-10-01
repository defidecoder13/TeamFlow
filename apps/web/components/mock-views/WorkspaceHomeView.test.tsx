import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { WorkspaceHomeView } from './WorkspaceHomeView';

const setCreateChannelOpen = vi.fn();
const setInviteMemberOpen = vi.fn();
const setCreateWorkspaceOpen = vi.fn();
const workspacesRetry = vi.fn();

vi.mock('../../lib/mock-context', () => ({
  useApp: () => ({
    setCreateChannelOpen,
    setInviteMemberOpen,
    setCreateWorkspaceOpen,
  }),
}));

const shellRef: {
  value: Record<string, unknown>;
} = { value: {} };

const { pushMock } = vi.hoisted(() => ({ pushMock: vi.fn() }));

vi.mock('../../lib/shell-context', () => ({
  useShell: () => shellRef.value,
}));

vi.mock('../../lib/mock-hooks/useRouter', () => ({
  useRouter: () => ({ push: pushMock }),
}));

function readyShell(overrides: Record<string, unknown> = {}) {
  return {
    session: { status: 'authenticated' },
    workspaces: {
      state: { status: 'ready', workspaces: [], current: null },
      retry: workspacesRetry,
    },
    currentWorkspace: { id: 'ws-1', name: 'Real Workspace' },
    currentUser: { id: 'user-1', name: 'Ada Lovelace', email: 'ada@example.com' },
    channels: [],
    ...overrides,
  };
}

beforeEach(() => {
  setCreateChannelOpen.mockReset();
  setInviteMemberOpen.mockReset();
  setCreateWorkspaceOpen.mockReset();
  workspacesRetry.mockReset();
  pushMock.mockReset();
  shellRef.value = readyShell();
});

describe('WorkspaceHomeView', () => {
  it('renders a time-aware greeting with the real user first name and workspace', () => {
    render(<WorkspaceHomeView />);

    expect(
      screen.getByRole('heading', { name: /good (morning|afternoon|evening), ada/i }),
    ).toBeInTheDocument();
    expect(screen.getByText('Real Workspace')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /create a channel/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /invite your team/i })).toBeInTheDocument();
  });

  it('falls back to “there” when the session has no display name', () => {
    shellRef.value = readyShell({
      currentUser: { id: 'user-1', name: '', email: 'ada@example.com' },
    });
    render(<WorkspaceHomeView />);

    expect(
      screen.getByRole('heading', { name: /good (morning|afternoon|evening), there/i }),
    ).toBeInTheDocument();
  });

  it('never renders mock identity or fake activity content', () => {
    render(<WorkspaceHomeView />);

    expect(screen.queryByText(/alex chen/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/sarah chen|alex morgan|maya patel/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/recent activity/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/updated live/i)).not.toBeInTheDocument();
  });

  it('opens the shell create-channel and invite dialogs from the CTAs', async () => {
    const user = userEvent.setup();
    render(<WorkspaceHomeView />);

    await user.click(screen.getByRole('button', { name: /create a channel/i }));
    expect(setCreateChannelOpen).toHaveBeenCalledWith(true);

    await user.click(screen.getByRole('button', { name: /invite your team/i }));
    expect(setInviteMemberOpen).toHaveBeenCalledWith(true);
  });

  it('shows a loading status while the session resolves', () => {
    shellRef.value = readyShell({ session: { status: 'loading' } });
    render(<WorkspaceHomeView />);

    expect(screen.getByRole('heading', { name: /loading your workspace/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /create a channel/i })).not.toBeInTheDocument();
  });

  it('shows a session error with no CTAs when /api/me fails', () => {
    shellRef.value = readyShell({
      session: { status: 'error', message: 'Could not load your session.' },
    });
    render(<WorkspaceHomeView />);

    expect(screen.getByRole('heading', { name: /couldn’t load your session/i })).toBeInTheDocument();
    expect(screen.getByText('Could not load your session.')).toBeInTheDocument();
  });

  it('shows workspaces error with a retry that calls the store retry', async () => {
    const user = userEvent.setup();
    shellRef.value = readyShell({
      workspaces: {
        state: {
          status: 'error',
          message: 'Could not load your workspaces.',
        },
        retry: workspacesRetry,
      },
      currentWorkspace: null,
    });
    render(<WorkspaceHomeView />);

    expect(screen.getByRole('heading', { name: /couldn’t load workspaces/i })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /try again/i }));
    expect(workspacesRetry).toHaveBeenCalledTimes(1);
  });

  it('offers workspace creation when the user has no workspaces', async () => {
    const user = userEvent.setup();
    shellRef.value = readyShell({
      workspaces: {
        state: { status: 'ready', workspaces: [], current: null },
        retry: workspacesRetry,
      },
      currentWorkspace: null,
    });
    render(<WorkspaceHomeView />);

    expect(
      screen.getByRole('heading', { name: /create your first workspace/i }),
    ).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /create workspace/i }));
    expect(setCreateWorkspaceOpen).toHaveBeenCalledWith(true);
  });

  it('navigates to sign-in when the session is unauthenticated', async () => {
    const user = userEvent.setup();
    shellRef.value = readyShell({ session: { status: 'unauthenticated' } });
    render(<WorkspaceHomeView />);

    expect(screen.getByRole('heading', { name: /please sign in/i })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /go to sign in/i }));
    expect(pushMock).toHaveBeenCalledWith('/sign-in');
  });

  it('navigates to sign-in when workspaces load unauthenticated', async () => {
    const user = userEvent.setup();
    shellRef.value = readyShell({
      workspaces: { state: { status: 'unauthenticated' }, retry: workspacesRetry },
    });
    render(<WorkspaceHomeView />);

    expect(screen.getByRole('heading', { name: /please sign in/i })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /go to sign in/i }));
    expect(pushMock).toHaveBeenCalledWith('/sign-in');
  });
});
