import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SessionState } from '../../lib/use-session-user';
import type { WorkspaceChannelsState } from '../../lib/use-workspace-channels';
import type { WorkspacesState } from '../../lib/use-workspaces';
import AppPage from './page';

const {
  addWorkspaceMock,
  channelsState,
  createWorkspaceMock,
  replaceMock,
  retryMock,
  sessionState,
  signOutMock,
  workspacesState,
} = vi.hoisted(() => ({
  addWorkspaceMock: vi.fn(),
  channelsState: { value: { status: 'idle' } as WorkspaceChannelsState },
  createWorkspaceMock: vi.fn(),
  replaceMock: vi.fn(),
  retryMock: vi.fn(),
  sessionState: { value: { status: 'loading' } as SessionState },
  signOutMock: vi.fn(),
  workspacesState: { value: { status: 'idle' } as WorkspacesState },
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: replaceMock, refresh: vi.fn() }),
  usePathname: () => '/app',
}));

vi.mock('../../lib/use-session-user', () => ({
  useSessionUser: () => sessionState.value,
}));

vi.mock('../../lib/use-workspaces', () => ({
  useWorkspaces: () => ({
    state: workspacesState.value,
    retry: retryMock,
    addWorkspace: addWorkspaceMock,
  }),
}));

vi.mock('../../lib/use-workspace-channels', () => ({
  useWorkspaceChannels: () => ({
    state: channelsState.value,
    retry: vi.fn(),
    addChannel: vi.fn(),
    updateChannelState: vi.fn(),
  }),
}));

vi.mock('../../lib/workspaces', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../lib/workspaces')>()),
  createWorkspace: createWorkspaceMock,
}));

vi.mock('../../lib/auth-client', () => ({
  getAuthClient: () => ({ signOut: signOutMock }),
}));

const AUTHENTICATED_USER = {
  id: 'user-1',
  name: 'Ada Lovelace',
  email: 'ada@example.com',
  image: null,
  emailVerified: true,
};

const REAL_WORKSPACE = {
  id: 'ws-1',
  name: 'Real Workspace',
  slug: 'real-workspace',
  role: 'OWNER' as const,
  createdAt: '2026-09-06T00:00:00.000Z',
  updatedAt: '2026-09-06T00:00:00.000Z',
};

function authenticateWithWorkspaces() {
  sessionState.value = { status: 'authenticated', user: AUTHENTICATED_USER };
  workspacesState.value = {
    status: 'ready',
    workspaces: [REAL_WORKSPACE],
    current: REAL_WORKSPACE,
  };
}

beforeEach(() => {
  replaceMock.mockReset();
  retryMock.mockReset();
  signOutMock.mockReset();
  addWorkspaceMock.mockReset();
  createWorkspaceMock.mockReset();
  sessionState.value = { status: 'loading' };
  workspacesState.value = { status: 'idle' };
  channelsState.value = { status: 'idle' };
  vi.stubEnv('NEXT_PUBLIC_API_URL', 'http://localhost:4000');
});

describe('/app', () => {
  it('renders a loading state while the session resolves', () => {
    render(<AppPage />);

    expect(screen.getByRole('status', { name: 'Loading TeamFlow' })).toBeInTheDocument();
  });

  it('redirects unauthenticated visitors to sign-in', () => {
    sessionState.value = { status: 'unauthenticated' };
    render(<AppPage />);

    expect(replaceMock).toHaveBeenCalledWith('/sign-in');
  });

  it('shows a safe error state without internals on API failure', () => {
    sessionState.value = { status: 'error', message: 'Could not load your session.' };
    render(<AppPage />);

    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent(/couldn't load teamflow/i);
    expect(document.body.textContent).not.toMatch(/stack|prisma|better-auth/i);
  });

  it('renders the shell with the authenticated user’s actual identity', async () => {
    const user = userEvent.setup();
    authenticateWithWorkspaces();
    render(<AppPage />);

    expect(
      screen.getByRole('heading', { name: /good (morning|afternoon|evening), ada/i }),
    ).toBeInTheDocument();
    expect(screen.queryByText(/john/i)).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /account: ada lovelace/i }));
    expect(screen.getByText('ada@example.com')).toBeInTheDocument();
    expect(screen.getByText('Ada Lovelace')).toBeInTheDocument();
  });

  it('renders the real workspace name with no hardcoded workspace dependency', () => {
    authenticateWithWorkspaces();
    render(<AppPage />);

    expect(
      screen.getByRole('button', { name: /current workspace: real workspace/i }),
    ).toBeInTheDocument();
    expect(screen.queryByText(/acme studio/i)).not.toBeInTheDocument();
  });

  it('shows a skeleton while workspaces load', () => {
    sessionState.value = { status: 'authenticated', user: AUTHENTICATED_USER };
    workspacesState.value = { status: 'loading' };
    render(<AppPage />);

    expect(screen.getByRole('status', { name: 'Loading TeamFlow' })).toBeInTheDocument();
  });

  it('shows the workspace creation UI with no fake data', () => {
    sessionState.value = { status: 'authenticated', user: AUTHENTICATED_USER };
    workspacesState.value = { status: 'ready', workspaces: [], current: null };
    render(<AppPage />);

    expect(
      screen.getByRole('heading', { name: /create your first workspace/i }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText(/workspace name/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /create workspace/i })).toBeEnabled();
    expect(screen.queryByText(/acme studio/i)).not.toBeInTheDocument();
  });

  it('merges a created workspace into existing state without reloading', async () => {
    const user = userEvent.setup();
    createWorkspaceMock.mockResolvedValue({ ok: true, workspace: REAL_WORKSPACE });
    sessionState.value = { status: 'authenticated', user: AUTHENTICATED_USER };
    workspacesState.value = { status: 'ready', workspaces: [], current: null };
    render(<AppPage />);

    await user.type(screen.getByLabelText(/workspace name/i), 'Real Workspace');
    await user.click(screen.getByRole('button', { name: /create workspace/i }));

    expect(createWorkspaceMock).toHaveBeenCalledWith('http://localhost:4000', 'Real Workspace');
    expect(addWorkspaceMock).toHaveBeenCalledWith(REAL_WORKSPACE);
  });

  it('shows a retryable error state when workspaces fail to load', async () => {
    const user = userEvent.setup();
    sessionState.value = { status: 'authenticated', user: AUTHENTICATED_USER };
    workspacesState.value = { status: 'error', message: 'Could not load your workspaces.' };
    render(<AppPage />);

    expect(screen.getByRole('alert')).toHaveTextContent(/couldn't load teamflow/i);
    await user.click(screen.getByRole('button', { name: /try again/i }));
    expect(retryMock).toHaveBeenCalledTimes(1);
  });

  it('redirects when the workspace call reports an expired session', () => {
    sessionState.value = { status: 'authenticated', user: AUTHENTICATED_USER };
    workspacesState.value = { status: 'unauthenticated' };
    render(<AppPage />);

    expect(replaceMock).toHaveBeenCalledWith('/sign-in');
  });

  it('shows honest empty states instead of mock channels and people', () => {
    authenticateWithWorkspaces();
    channelsState.value = { status: 'ready', channels: [] };
    render(<AppPage />);

    expect(screen.getByText(/no channels yet/i)).toBeInTheDocument();
    expect(screen.getByText(/no messages yet/i)).toBeInTheDocument();
    for (const mock of [
      'general',
      'engineering',
      'sarah chen',
      'alex morgan',
      'david kim',
      'maya patel',
    ]) {
      expect(screen.queryByText(new RegExp(`^${mock}$`, 'i'))).not.toBeInTheDocument();
    }
  });
  it('presents onboarding and a genuine empty activity state', () => {
    authenticateWithWorkspaces();
    render(<AppPage />);

    expect(screen.getByRole('heading', { name: /bring your team together/i })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /keep work organized/i })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /find work faster/i })).toBeInTheDocument();
    expect(screen.getByText(/nothing here yet/i)).toBeInTheDocument();
  });
});
