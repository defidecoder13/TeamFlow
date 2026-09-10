import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { MembersContent } from './MembersContent';
import type { WorkspaceMember } from '../../lib/members';

const ADA: WorkspaceMember = {
  id: 'm-1',
  role: 'OWNER',
  createdAt: '2026-09-06T00:00:00.000Z',
  user: { id: 'u-1', name: 'Ada Lovelace', email: 'ada@example.com', image: null },
};

const GRACE: WorkspaceMember = {
  id: 'm-2',
  role: 'ADMIN',
  createdAt: '2026-09-06T00:00:00.000Z',
  user: { id: 'u-2', name: 'Grace Hopper', email: 'grace@example.com', image: null },
};

const ALAN: WorkspaceMember = {
  id: 'm-3',
  role: 'MEMBER',
  createdAt: '2026-09-06T00:00:00.000Z',
  user: { id: 'u-3', name: 'Alan Turing', email: 'alan@example.com', image: null },
};

vi.mock('../../lib/use-presence', () => ({
  usePresence: () => ({ getPresence: () => ({ status: 'OFFLINE' }) }),
}));

vi.mock('../../lib/members', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../lib/members')>();
  return {
    ...actual,
    updateWorkspaceMemberRole: vi.fn().mockResolvedValue({
      ok: true,
      member: {
        id: 'm-2',
        role: 'ADMIN',
        createdAt: '2026-09-06T00:00:00.000Z',
        user: { id: 'u-2', name: 'Grace Hopper', email: 'grace@example.com', image: null },
      },
    }),
    removeWorkspaceMember: vi.fn().mockResolvedValue({ ok: true }),
  };
});

function renderContent(
  members: WorkspaceMember[],
  currentUserId = 'u-1',
  currentUserRole: 'OWNER' | 'ADMIN' | 'MEMBER' = 'OWNER',
) {
  return render(
    <MembersContent
      members={members}
      currentUserId={currentUserId}
      currentUserRole={currentUserRole}
      workspace={{ id: 'ws-1', name: 'Real Workspace' }}
      canInvite
      pending={[]}
      pendingLoading={false}
      pendingError={null}
      onRetryPending={vi.fn()}
      onInvitationCreated={vi.fn()}
      onUnauthenticated={vi.fn()}
    />,
  );
}

describe('MembersContent', () => {
  it('renders real members with roles and the true count', () => {
    renderContent([ADA, GRACE, ALAN]);

    expect(screen.getByRole('heading', { name: /members/i })).toBeInTheDocument();
    expect(screen.getByText('3 members')).toBeInTheDocument();
    expect(screen.getByText('Ada Lovelace')).toBeInTheDocument();
    expect(screen.getByText('grace@example.com')).toBeInTheDocument();
    expect(screen.getByText('OWNER')).toBeInTheDocument();
    // ADMIN is now a select for OWNER viewers
    expect(screen.getByRole('combobox', { name: 'Role for Grace Hopper' })).toHaveValue('ADMIN');
    expect(screen.queryByText(/john smith|acme/i)).not.toBeInTheDocument();
  });

  it('marks the current user without touching others', () => {
    renderContent([ADA, GRACE], 'u-2');

    const badges = screen.getAllByText('You');
    expect(badges).toHaveLength(1);
    expect(screen.getByText('2 members')).toBeInTheDocument();
  });

  it('filters by name, case-insensitively', async () => {
    const user = userEvent.setup();
    renderContent([ADA, GRACE, ALAN]);

    await user.type(screen.getByLabelText(/search members/i), 'GRACE');

    expect(screen.queryByText('Ada Lovelace')).not.toBeInTheDocument();
    expect(screen.getByText('Grace Hopper')).toBeInTheDocument();
  });

  it('filters by email', async () => {
    const user = userEvent.setup();
    renderContent([ADA, GRACE, ALAN]);

    await user.type(screen.getByLabelText(/search members/i), 'alan@example');

    expect(screen.getByText('Alan Turing')).toBeInTheDocument();
    expect(screen.queryByText('Ada Lovelace')).not.toBeInTheDocument();
  });

  it('shows a distinct no-results state', async () => {
    const user = userEvent.setup();
    renderContent([ADA]);

    await user.type(screen.getByLabelText(/search members/i), 'nobody-here');

    expect(screen.getByText(/no members match your search/i)).toBeInTheDocument();
  });

  it('handles a genuinely empty workspace', () => {
    renderContent([]);

    expect(screen.getByText('0 members')).toBeInTheDocument();
    expect(screen.getByText(/no members yet/i)).toBeInTheDocument();
  });

  it('shows role change and remove controls only for OWNER', () => {
    // OWNER should see controls for non-OWNER members
    renderContent([ADA, GRACE], 'u-1', 'OWNER');
    expect(screen.getByLabelText('Role for Grace Hopper')).toBeInTheDocument();
    expect(screen.getByLabelText('Remove Grace Hopper')).toBeInTheDocument();
    // OWNER row itself should not have controls
    expect(screen.queryByLabelText('Role for Ada Lovelace')).not.toBeInTheDocument();
  });

  it('hides management controls for MEMBER', () => {
    renderContent([ADA, GRACE], 'u-3', 'MEMBER');
    expect(screen.queryByLabelText(/Role for/)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/Remove/)).not.toBeInTheDocument();
  });

  it('confirms before removing a member', async () => {
    const user = userEvent.setup();
    renderContent([ADA, GRACE], 'u-1', 'OWNER');
    await user.click(screen.getByLabelText('Remove Grace Hopper'));
    expect(screen.getByText(/Remove Grace Hopper\?/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByText(/Remove Grace Hopper\?/)).not.toBeInTheDocument();
  });
});
