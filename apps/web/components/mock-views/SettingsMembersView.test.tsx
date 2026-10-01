import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SessionState } from '../../lib/use-session-user';
import type { WorkspaceMember } from '../../lib/members';
import type { PendingInvitation } from '../../lib/invitations';
import { SettingsMembersView } from './SettingsMembersView';

const {
  shellRef,
  appRef,
  pendingRef,
  getApiBaseUrlMock,
  updateRoleMock,
  removeMemberMock,
  revokeInviteMock,
  membersRetryMock,
  pendingRetryMock,
  pushMock,
} = vi.hoisted(() => ({
  shellRef: { value: {} as Record<string, unknown> },
  appRef: { value: {} as Record<string, unknown> },
  pendingRef: { value: {} as Record<string, unknown> },
  getApiBaseUrlMock: vi.fn(() => 'http://localhost:4000'),
  updateRoleMock: vi.fn(),
  removeMemberMock: vi.fn(),
  revokeInviteMock: vi.fn(),
  membersRetryMock: vi.fn(),
  pendingRetryMock: vi.fn(),
  pushMock: vi.fn(),
}));

vi.mock('../../lib/config', () => ({
  getApiBaseUrl: getApiBaseUrlMock,
}));

vi.mock('../../lib/members', () => ({
  updateWorkspaceMemberRole: updateRoleMock,
  removeWorkspaceMember: removeMemberMock,
}));

vi.mock('../../lib/invitations', () => ({
  revokeInvitation: revokeInviteMock,
  formatInvitationDate: (iso: string) => {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  },
}));

vi.mock('../../lib/use-pending-invitations', () => ({
  usePendingInvitations: () => pendingRef.value,
}));

vi.mock('../../lib/mock-context', () => ({
  useApp: () => appRef.value,
}));

vi.mock('../../lib/shell-context', () => ({
  useShell: () => shellRef.value,
}));

vi.mock('../../lib/mock-hooks/useRouter', () => ({
  useRouter: () => ({ push: pushMock }),
}));

const OWNER: WorkspaceMember = {
  id: 'mem-1',
  role: 'OWNER',
  createdAt: '2026-09-01T00:00:00.000Z',
  user: { id: 'u-1', name: 'Ada Lovelace', email: 'ada@example.com', image: null },
};

const ADMIN: WorkspaceMember = {
  id: 'mem-2',
  role: 'ADMIN',
  createdAt: '2026-09-02T00:00:00.000Z',
  user: { id: 'u-2', name: 'Grace Hopper', email: 'grace@example.com', image: null },
};

const MEMBER: WorkspaceMember = {
  id: 'mem-3',
  role: 'MEMBER',
  createdAt: '2026-09-03T00:00:00.000Z',
  user: { id: 'u-3', name: 'Alan Turing', email: 'alan@example.com', image: null },
};

const INVITE: PendingInvitation = {
  id: 'inv-1',
  email: 'newbie@example.com',
  expiresAt: '2026-09-30T00:00:00.000Z',
  createdAt: '2026-09-20T00:00:00.000Z',
  invitedBy: { id: 'u-1', name: 'Ada Lovelace', email: 'ada@example.com' },
};

function setShell(
  overrides: Record<string, unknown> = {},
  memberList: WorkspaceMember[] = [OWNER, ADMIN, MEMBER],
  role: 'OWNER' | 'ADMIN' | 'MEMBER' = 'OWNER',
  membersStatus: 'ready' | 'loading' | 'error' | 'unauthenticated' | 'idle' = 'ready',
) {
  const membersState =
    membersStatus === 'ready'
      ? { status: 'ready' as const, members: memberList }
      : membersStatus === 'error'
        ? { status: 'error' as const, message: 'Could not load workspace members.' }
        : { status: membersStatus as 'loading' | 'unauthenticated' | 'idle' };

  shellRef.value = {
    session: { status: 'authenticated' } as SessionState,
    currentUser: OWNER.user,
    currentWorkspace: {
      id: 'ws-1',
      name: 'Acme Flow',
      slug: 'acme-flow',
      role,
      createdAt: '2026-09-01T00:00:00.000Z',
      updatedAt: '2026-09-01T00:00:00.000Z',
    },
    members: { state: membersState, retry: membersRetryMock },
    presence: {
      getPresence: (userId: string) => ({
        userId,
        status: 'ONLINE' as const,
        lastSeenAt: null,
      }),
    },
    ...overrides,
  };
}

function setPending(
  status: 'ready' | 'loading' | 'error' | 'idle' | 'unauthenticated',
  invitations: PendingInvitation[] = [],
) {
  pendingRef.value = {
    state:
      status === 'ready'
        ? { status: 'ready' as const, invitations }
        : status === 'error'
          ? { status: 'error' as const, message: 'Could not load pending invitations.' }
          : { status },
    retry: pendingRetryMock,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  appRef.value = {
    isInviteMemberOpen: false,
    setInviteMemberOpen: vi.fn(),
    showToast: vi.fn(),
  };
  setShell();
  setPending('ready', [INVITE]);
  updateRoleMock.mockReset();
  removeMemberMock.mockReset();
  revokeInviteMock.mockReset();
});

describe('SettingsMembersView', () => {
  it('shows a loading state until the session resolves', () => {
    setShell({
      session: { status: 'loading' },
      currentUser: null,
    });
    render(<SettingsMembersView />);
    expect(screen.getByRole('status', { name: /loading members/i })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: /teammates/i })).not.toBeInTheDocument();
  });

  it('shows an unauthenticated message when there is no session user', async () => {
    const user = userEvent.setup();
    setShell({
      session: { status: 'unauthenticated' },
      currentUser: null,
    });
    render(<SettingsMembersView />);
    expect(screen.getByRole('status')).toHaveTextContent(/please sign in/i);

    await user.click(screen.getByRole('button', { name: /go to sign in/i }));
    expect(pushMock).toHaveBeenCalledWith('/sign-in');
  });

  it('shows a members load error with retry', () => {
    setShell({}, [], 'OWNER', 'error');
    render(<SettingsMembersView />);
    expect(screen.getByRole('alert')).toHaveTextContent(
      /could not load workspace members/i,
    );
    expect(
      screen.getByRole('button', { name: /try again/i }),
    ).toBeInTheDocument();
  });

  it('renders the real member list with count and workspace name', () => {
    render(<SettingsMembersView />);

    expect(screen.getByText('3 members')).toBeInTheDocument();
    expect(screen.getByText('in Acme Flow')).toBeInTheDocument();
    expect(screen.getByText('Ada Lovelace')).toBeInTheDocument();
    expect(screen.getByText('Grace Hopper')).toBeInTheDocument();
    expect(screen.getByText('alan@example.com')).toBeInTheDocument();
    expect(screen.getAllByText('OWNER').length).toBeGreaterThan(0);
  });

  it('does not render mock-only fields (title search, Guest role, mock invite copy)', async () => {
    render(<SettingsMembersView />);

    const search = screen.getByPlaceholderText(/search by name or email/i);
    expect(search).toBeInTheDocument();
    expect(screen.queryByPlaceholderText(/or title/i)).not.toBeInTheDocument();
    expect(screen.queryByRole('option', { name: /guest/i })).not.toBeInTheDocument();
    expect(screen.queryByText(/invited as/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/engineering manager/i)).not.toBeInTheDocument();
  });

  it('filters members by name or email', async () => {
    render(<SettingsMembersView />);

    await userEvent.type(screen.getByPlaceholderText(/search by name or email/i), 'grace');

    await waitFor(() => {
      expect(screen.getByText('Grace Hopper')).toBeInTheDocument();
    });
    expect(screen.queryByText('Alan Turing')).not.toBeInTheDocument();
    expect(screen.queryByText('Ada Lovelace')).not.toBeInTheDocument();
  });

  it('shows empty search state with clear action', async () => {
    render(<SettingsMembersView />);

    await userEvent.type(
      screen.getByPlaceholderText(/search by name or email/i),
      'nobody',
    );

    expect(await screen.findByText(/no members matching/i)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /clear search/i }));
    expect(screen.getByText('Grace Hopper')).toBeInTheDocument();
  });

  it('hides invite button and pending section for MEMBER role', () => {
    setShell({}, [OWNER, MEMBER], 'MEMBER');
    setPending('ready', [INVITE]);
    render(<SettingsMembersView />);

    expect(screen.queryByRole('button', { name: /invite member/i })).not.toBeInTheDocument();
    expect(screen.queryByText(/pending invitations/i)).not.toBeInTheDocument();
    // Non-owner sees read-only role badges, no select
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
  });

  it('shows invite button for ADMIN and lists pending invitations with inviter + expiry', () => {
    setShell({}, [OWNER, ADMIN], 'ADMIN');
    setPending('ready', [INVITE]);
    render(<SettingsMembersView />);

    expect(screen.getByRole('button', { name: /invite member/i })).toBeInTheDocument();
    expect(screen.getByText('Pending invitations (1)')).toBeInTheDocument();
    expect(screen.getByText('newbie@example.com')).toBeInTheDocument();
    expect(screen.getByText(/invited by ada lovelace/i)).toBeInTheDocument();
    expect(screen.getByText(/expires/i)).toBeInTheDocument();
  });

  it('shows pending invitation load error with retry', async () => {
    setPending('error');
    render(<SettingsMembersView />);

    expect(screen.getByRole('alert')).toHaveTextContent(
      /could not load pending invitations/i,
    );
    await userEvent.click(
      screen.getByRole('button', { name: /try loading invitations again/i }),
    );
    expect(pendingRetryMock).toHaveBeenCalled();
  });

  it('opens the invite dialog via setInviteMemberOpen', async () => {
    const setInviteMemberOpen = vi.fn();
    appRef.value = { ...appRef.value, setInviteMemberOpen };
    render(<SettingsMembersView />);

    await userEvent.click(screen.getByRole('button', { name: /invite member/i }));
    expect(setInviteMemberOpen).toHaveBeenCalledWith(true);
  });

  it('updates a non-owner role via PATCH and refreshes members', async () => {
    const updated: WorkspaceMember = { ...MEMBER, role: 'ADMIN' };
    updateRoleMock.mockResolvedValue({ ok: true, member: updated });

    render(<SettingsMembersView />);

    const roleSelect = screen.getByLabelText('Role for Alan Turing');
    await userEvent.selectOptions(roleSelect, 'ADMIN');

    await waitFor(() => {
      expect(updateRoleMock).toHaveBeenCalledWith(
        'http://localhost:4000',
        'ws-1',
        'u-3',
        'ADMIN',
      );
    });
    await waitFor(() => {
      expect(membersRetryMock).toHaveBeenCalled();
    });
  });

  it('surfaces role update errors without changing the list', async () => {
    updateRoleMock.mockResolvedValue({
      ok: false,
      kind: 'forbidden',
    });

    render(<SettingsMembersView />);

    await userEvent.selectOptions(screen.getByLabelText('Role for Alan Turing'), 'ADMIN');

    expect(await screen.findByRole('alert')).toHaveTextContent(
      /only the workspace owner can change member roles/i,
    );
    expect(membersRetryMock).not.toHaveBeenCalled();
  });

  it('does not show role select for owner row or own row', () => {
    render(<SettingsMembersView />);

    // Only one editable non-owner (Grace = ADMIN, Alan = MEMBER); Ada is owner+self
    expect(screen.getAllByRole('combobox')).toHaveLength(2);
    expect(screen.getByText('Owner')).toBeInTheDocument();
    expect(screen.queryByLabelText('Role for Ada Lovelace')).not.toBeInTheDocument();
  });

  it('removes a member via DELETE and updates the list', async () => {
    removeMemberMock.mockResolvedValue({ ok: true });

    render(<SettingsMembersView />);

    await userEvent.click(screen.getByLabelText('Remove Alan Turing'));
    expect(
      await screen.findByRole('heading', { name: /remove alan turing/i }),
    ).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /remove member/i }));

    await waitFor(() => {
      expect(removeMemberMock).toHaveBeenCalledWith('http://localhost:4000', 'ws-1', 'u-3');
    });
    await waitFor(() => {
      expect(screen.queryByText('Alan Turing')).not.toBeInTheDocument();
    });
    expect(membersRetryMock).toHaveBeenCalled();
  });

  it('surfaces remove member errors', async () => {
    removeMemberMock.mockResolvedValue({ ok: false, kind: 'conflict', message: 'Cannot remove the only OWNER.' });

    render(<SettingsMembersView />);
    await userEvent.click(screen.getByLabelText('Remove Alan Turing'));
    await userEvent.click(screen.getByRole('button', { name: /remove member/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      /cannot remove the only owner/i,
    );
  });

  it('revokes a pending invitation and refetches the list', async () => {
    revokeInviteMock.mockResolvedValue({ ok: true, invitationId: 'inv-1' });

    render(<SettingsMembersView />);

    await userEvent.click(screen.getByRole('button', { name: /revoke invitation for newbie/i }));
    expect(
      await screen.findByRole('heading', { name: /revoke invitation/i }),
    ).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /revoke invitation$/i }));

    await waitFor(() => {
      expect(revokeInviteMock).toHaveBeenCalledWith(
        'http://localhost:4000',
        'ws-1',
        'inv-1',
      );
    });
    await waitFor(() => {
      expect(pendingRetryMock).toHaveBeenCalled();
    });
  });

  it('refreshes pending and members when the invite dialog closes', () => {
    appRef.value = { ...appRef.value, isInviteMemberOpen: true };
    const { rerender } = render(<SettingsMembersView />);

    expect(pendingRetryMock).not.toHaveBeenCalled();
    expect(membersRetryMock).not.toHaveBeenCalled();

    appRef.value = { ...appRef.value, isInviteMemberOpen: false };
    rerender(<SettingsMembersView />);

    expect(pendingRetryMock).toHaveBeenCalled();
    expect(membersRetryMock).toHaveBeenCalled();
  });
});
