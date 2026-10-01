import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SessionState } from '../../lib/use-session-user';
import type { WorkspaceSummary } from '../../lib/workspaces';
import type { WorkspaceMembersState } from '../../lib/use-workspace-members';
import type { WorkspacesState } from '../../lib/use-workspaces';
import type { NotificationPreferences } from '../../lib/notification-preferences';
import { SettingsIndexView } from './SettingsIndexView';

const { shellRef, pushMock, fetchNotificationPreferencesMock } = vi.hoisted(() => ({
  shellRef: { value: {} as Record<string, unknown> },
  pushMock: vi.fn(),
  fetchNotificationPreferencesMock: vi.fn(),
}));

vi.mock('../../lib/shell-context', () => ({
  useShell: () => shellRef.value,
}));

vi.mock('../../lib/mock-hooks/useRouter', () => ({
  useRouter: () => ({ push: pushMock, pathname: '/app/settings' }),
}));

vi.mock('../../lib/notification-preferences', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../lib/notification-preferences')>()),
  fetchNotificationPreferences: fetchNotificationPreferencesMock,
}));

const USER = {
  id: 'u-1',
  name: 'Ada Lovelace',
  email: 'ada@example.com',
  image: null,
  emailVerified: true,
};

const WORKSPACE: WorkspaceSummary = {
  id: 'ws-1',
  name: 'Acme Flow',
  slug: 'acme-flow',
  role: 'OWNER',
  createdAt: '2026-09-01T00:00:00.000Z',
  updatedAt: '2026-09-01T00:00:00.000Z',
};

const ALL_PREFS: NotificationPreferences = {
  mentionDelivery: 'ALL',
  dmDelivery: 'ALL',
  threadReplyDelivery: 'ALL',
};

function setShell(
  overrides: {
    session?: SessionState;
    currentUser?: typeof USER | null;
    currentWorkspace?: WorkspaceSummary | null;
    workspaces?: WorkspacesState;
    members?: WorkspaceMembersState;
  } = {},
) {
  const membersState: WorkspaceMembersState = overrides.members ?? {
    status: 'ready',
    members: [
      {
        id: 'm-1',
        role: 'OWNER',
        createdAt: '2026-09-01T00:00:00.000Z',
        user: { ...USER, image: null },
      },
      {
        id: 'm-2',
        role: 'MEMBER',
        createdAt: '2026-09-01T00:00:00.000Z',
        user: {
          ...USER,
          id: 'u-2',
          name: 'Grace Hopper',
          email: 'grace@example.com',
        },
      },
    ],
  };
  const workspacesState: WorkspacesState = overrides.workspaces ?? {
    status: 'ready',
    workspaces: [WORKSPACE],
    current: WORKSPACE,
  };

  shellRef.value = {
    session: overrides.session ?? ({ status: 'authenticated', user: USER } as SessionState),
    currentUser: overrides.currentUser === undefined ? USER : overrides.currentUser,
    currentWorkspace:
      overrides.currentWorkspace === undefined ? WORKSPACE : overrides.currentWorkspace,
    workspaces: {
      state: workspacesState,
      retry: vi.fn(),
      addWorkspace: vi.fn(),
      setCurrentWorkspace: vi.fn(),
      updateWorkspace: vi.fn(),
      removeWorkspace: vi.fn(),
      resyncWorkspaces: vi.fn(),
    },
    members: { state: membersState, retry: vi.fn() },
  };
}

beforeEach(() => {
  pushMock.mockReset();
  fetchNotificationPreferencesMock.mockReset();
  fetchNotificationPreferencesMock.mockResolvedValue({
    ok: true,
    data: ALL_PREFS,
  });
  setShell();
});

describe('SettingsIndexView', () => {
  it('shows a loading state while the session resolves', () => {
    setShell({ session: { status: 'loading' } as SessionState });
    render(<SettingsIndexView />);
    expect(screen.getByRole('status', { name: 'Loading settings' })).toBeInTheDocument();
  });

  it('asks unauthenticated visitors to sign in without rendering cards', async () => {
    const user = userEvent.setup();
    setShell({ session: { status: 'unauthenticated' } as SessionState });
    render(<SettingsIndexView />);
    expect(
      screen.getByText('Please sign in to manage your settings.'),
    ).toBeInTheDocument();
    expect(screen.queryByText('Profile & account')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /go to sign in/i }));
    expect(pushMock).toHaveBeenCalledWith('/sign-in');
  });

  it('surfaces session load errors', () => {
    setShell({
      session: { status: 'error', message: 'Could not load your session.' } as SessionState,
    });
    render(<SettingsIndexView />);
    expect(screen.getByText('Could not load your session.')).toBeInTheDocument();
    expect(screen.queryByText('Profile & account')).not.toBeInTheDocument();
  });

  it('renders all four cards with real destinations and the real profile name', async () => {
    render(<SettingsIndexView />);

    expect(
      screen.getByRole('heading', { level: 1, name: 'Settings' }),
    ).toBeInTheDocument();
    expect(screen.getByText('Ada Lovelace')).toBeInTheDocument();

    const user = userEvent.setup();
    await user.click(screen.getByText('Profile & account'));
    expect(pushMock).toHaveBeenCalledWith('/app/settings/profile');
    pushMock.mockClear();

    await user.click(screen.getByText('Teammates & permissions'));
    expect(pushMock).toHaveBeenCalledWith('/app/settings/members');
    pushMock.mockClear();

    await user.click(screen.getByText('Workspace settings'));
    expect(pushMock).toHaveBeenCalledWith('/app/settings/workspace');
    pushMock.mockClear();

    await user.click(screen.getByText('Notifications & alerts'));
    expect(pushMock).toHaveBeenCalledWith('/app/settings/notifications');
  });

  it('uses the real workspace role instead of a mock plan badge', () => {
    setShell({
      currentWorkspace: { ...WORKSPACE, role: 'ADMIN' },
      workspaces: { status: 'ready', workspaces: [WORKSPACE], current: WORKSPACE },
    });
    render(<SettingsIndexView />);
    expect(screen.queryByText(/plan/i)).not.toBeInTheDocument();
    expect(screen.getAllByText('ADMIN').length).toBeGreaterThan(0);
    expect(screen.queryByText(/teamflow\.io/i)).not.toBeInTheDocument();
  });

  it('shows the real member count and never Alex Chen', async () => {
    render(<SettingsIndexView />);
    expect(screen.getByText('2 members')).toBeInTheDocument();
    expect(screen.queryByText('Alex Chen')).not.toBeInTheDocument();
    await waitFor(() => {
      expect(fetchNotificationPreferencesMock).toHaveBeenCalledWith(
        'http://localhost:4000',
      );
    });
  });

  it('shows a members placeholder while the list is still loading', () => {
    setShell({ members: { status: 'loading' } });
    render(<SettingsIndexView />);
    expect(screen.getAllByText('…').length).toBeGreaterThan(0);
  });

  it('shows an honest members meta when the list fails to load', () => {
    setShell({
      members: {
        status: 'error',
        message: 'Could not load workspace members. Check your connection and try again.',
      },
    });
    render(<SettingsIndexView />);
    expect(screen.getAllByText('—').length).toBeGreaterThan(0);
    expect(screen.queryByText('2 members')).not.toBeInTheDocument();
  });

  it('summarizes notification preferences as All active', async () => {
    render(<SettingsIndexView />);
    await waitFor(() => {
      expect(screen.getByText('All active')).toBeInTheDocument();
    });
  });

  it('summarizes mixed notification preferences as N of 3 on', async () => {
    fetchNotificationPreferencesMock.mockResolvedValue({
      ok: true,
      data: {
        mentionDelivery: 'ALL',
        dmDelivery: 'ALL',
        threadReplyDelivery: 'NONE',
      },
    });
    render(<SettingsIndexView />);
    await waitFor(() => {
      expect(screen.getByText('2 of 3 on')).toBeInTheDocument();
    });
  });

  it('summarizes muted notification preferences as Muted', async () => {
    fetchNotificationPreferencesMock.mockResolvedValue({
      ok: true,
      data: {
        mentionDelivery: 'NONE',
        dmDelivery: 'NONE',
        threadReplyDelivery: 'NONE',
      },
    });
    render(<SettingsIndexView />);
    await waitFor(() => {
      expect(screen.getByText('Muted')).toBeInTheDocument();
    });
  });

  it('shows a notifications placeholder when preferences fail to load', async () => {
    fetchNotificationPreferencesMock.mockResolvedValue({
      ok: false,
      message: 'Failed to load notification preferences.',
    });
    render(<SettingsIndexView />);
    await waitFor(() => {
      expect(screen.queryByText('All active')).not.toBeInTheDocument();
      expect(screen.getByText('—')).toBeInTheDocument();
    });
  });

  it('does not read mock workspace plan or avatar chrome', () => {
    render(<SettingsIndexView />);
    expect(screen.queryByText(/pro plan|free plan/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/retention polic/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/role title/i)).not.toBeInTheDocument();
  });
});
