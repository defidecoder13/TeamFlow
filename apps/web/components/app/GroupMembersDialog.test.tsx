import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GroupMembersDialog } from './GroupMembersDialog';
import type { DirectConversation } from '../../lib/messages';
import type { WorkspaceMember } from '../../lib/members';

const {
  useSessionUserMock,
  useWorkspaceMembersMock,
  renameGroupConversationMock,
  addConversationParticipantMock,
  removeConversationParticipantMock,
  leaveGroupConversationMock,
} = vi.hoisted(() => ({
  useSessionUserMock: vi.fn(),
  useWorkspaceMembersMock: vi.fn(),
  renameGroupConversationMock: vi.fn(),
  addConversationParticipantMock: vi.fn(),
  removeConversationParticipantMock: vi.fn(),
  leaveGroupConversationMock: vi.fn(),
}));

vi.mock('../../lib/use-session-user', () => ({
  useSessionUser: useSessionUserMock,
}));

vi.mock('../../lib/use-workspace-members', () => ({
  useWorkspaceMembers: useWorkspaceMembersMock,
}));

vi.mock('../../lib/messages', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../lib/messages')>()),
  renameGroupConversation: renameGroupConversationMock,
  addConversationParticipant: addConversationParticipantMock,
  removeConversationParticipant: removeConversationParticipantMock,
  leaveGroupConversation: leaveGroupConversationMock,
}));

const CURRENT_ADMIN_USER = {
  id: 'u-1',
  name: 'Ada Lovelace',
  email: 'ada@example.com',
  image: null,
  emailVerified: true,
};

const BASE_CONVERSATION: DirectConversation = {
  id: 'grp-1',
  workspaceId: 'ws-1',
  type: 'GROUP',
  name: 'Platform Engineering',
  currentUserRole: 'ADMIN',
  participantCount: 3,
  createdAt: new Date('2026-09-08T00:00:00.000Z'),
  updatedAt: new Date('2026-09-08T00:00:00.000Z'),
  participants: [
    { id: 'u-1', name: 'Ada Lovelace', email: 'ada@example.com', image: null, role: 'ADMIN' },
    { id: 'u-2', name: 'Alan Turing', email: 'alan@example.com', image: null, role: 'MEMBER' },
    { id: 'u-3', name: 'Grace Hopper', email: 'grace@example.com', image: null, role: 'MEMBER' },
  ],
};

const WORKSPACE_MEMBERS: WorkspaceMember[] = [
  {
    id: 'wm-1',
    role: 'OWNER',
    createdAt: '2026-09-08T00:00:00.000Z',
    user: { id: 'u-1', name: 'Ada Lovelace', email: 'ada@example.com', image: null },
  },
  {
    id: 'wm-2',
    role: 'MEMBER',
    createdAt: '2026-09-08T00:00:00.000Z',
    user: { id: 'u-2', name: 'Alan Turing', email: 'alan@example.com', image: null },
  },
  {
    id: 'wm-3',
    role: 'MEMBER',
    createdAt: '2026-09-08T00:00:00.000Z',
    user: { id: 'u-3', name: 'Grace Hopper', email: 'grace@example.com', image: null },
  },
  {
    id: 'wm-4',
    role: 'MEMBER',
    createdAt: '2026-09-08T00:00:00.000Z',
    user: { id: 'u-4', name: 'Claude Shannon', email: 'claude@example.com', image: null },
  },
];

beforeEach(() => {
  useSessionUserMock.mockReset();
  useWorkspaceMembersMock.mockReset();
  renameGroupConversationMock.mockReset();
  addConversationParticipantMock.mockReset();
  removeConversationParticipantMock.mockReset();
  leaveGroupConversationMock.mockReset();

  vi.stubEnv('NEXT_PUBLIC_API_URL', 'http://localhost:4000');

  useSessionUserMock.mockReturnValue({
    status: 'authenticated',
    user: CURRENT_ADMIN_USER,
  });

  useWorkspaceMembersMock.mockReturnValue({
    state: {
      status: 'ready',
      members: WORKSPACE_MEMBERS,
    },
    retry: vi.fn(),
  });
});

describe('GroupMembersDialog', () => {
  it('renders participant list with roles and highlights the current user', () => {
    render(
      <GroupMembersDialog
        conversation={BASE_CONVERSATION}
        workspaceId="ws-1"
        currentUserId="u-1"
        onClose={vi.fn()}
      />,
    );

    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText(/ada lovelace/i)).toBeInTheDocument();
    expect(screen.getByText(/\(you\)/i)).toBeInTheDocument();
    expect(screen.getByText('Alan Turing')).toBeInTheDocument();
    expect(screen.getByText('Grace Hopper')).toBeInTheDocument();

    // Check roles
    const adminBadges = screen.getAllByText('Admin');
    expect(adminBadges.length).toBeGreaterThanOrEqual(1);
    const memberBadges = screen.getAllByText('Member');
    expect(memberBadges.length).toBeGreaterThanOrEqual(2);
  });

  it('allows admin to rename the group', async () => {
    const user = userEvent.setup();
    const onConversationUpdated = vi.fn();

    const updatedConversation: DirectConversation = {
      ...BASE_CONVERSATION,
      name: 'Infra Core',
    };

    renameGroupConversationMock.mockResolvedValue({
      ok: true,
      data: updatedConversation,
    });

    render(
      <GroupMembersDialog
        conversation={BASE_CONVERSATION}
        workspaceId="ws-1"
        currentUserId="u-1"
        onClose={vi.fn()}
        onConversationUpdated={onConversationUpdated}
      />,
    );

    // Click "Rename" button
    await user.click(screen.getByRole('button', { name: /^rename$/i }));

    const input = screen.getByLabelText(/group name/i);
    await user.clear(input);
    await user.type(input, 'Infra Core');

    await user.click(screen.getByRole('button', { name: /^save$/i }));

    await waitFor(() => {
      expect(renameGroupConversationMock).toHaveBeenCalledWith(
        'http://localhost:4000',
        'grp-1',
        'Infra Core',
      );
      expect(onConversationUpdated).toHaveBeenCalledWith(updatedConversation);
    });
  });

  it('allows admin to add a workspace member who is not yet in the group', async () => {
    const user = userEvent.setup();
    const onConversationUpdated = vi.fn();

    const updatedWithClaude: DirectConversation = {
      ...BASE_CONVERSATION,
      participantCount: 4,
      participants: [
        ...BASE_CONVERSATION.participants,
        {
          id: 'u-4',
          name: 'Claude Shannon',
          email: 'claude@example.com',
          image: null,
          role: 'MEMBER',
        },
      ],
    };

    addConversationParticipantMock.mockResolvedValue({
      ok: true,
      data: updatedWithClaude,
    });

    render(
      <GroupMembersDialog
        conversation={BASE_CONVERSATION}
        workspaceId="ws-1"
        currentUserId="u-1"
        onClose={vi.fn()}
        onConversationUpdated={onConversationUpdated}
      />,
    );

    // Click "+ Add Member" button to open selector
    await user.click(screen.getByRole('button', { name: /\+ add member/i }));

    // Claude Shannon should appear since u-4 is not yet in the group
    expect(screen.getByText('Claude Shannon')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /^add$/i }));

    await waitFor(() => {
      expect(addConversationParticipantMock).toHaveBeenCalledWith(
        'http://localhost:4000',
        'grp-1',
        'u-4',
      );
      expect(onConversationUpdated).toHaveBeenCalledWith(updatedWithClaude);
    });
  });

  it('allows admin to remove a member', async () => {
    const user = userEvent.setup();
    const onConversationUpdated = vi.fn();

    const updatedAfterRemoval: DirectConversation = {
      ...BASE_CONVERSATION,
      participantCount: 2,
      participants: [BASE_CONVERSATION.participants[0], BASE_CONVERSATION.participants[2]],
    };

    removeConversationParticipantMock.mockResolvedValue({
      ok: true,
      data: updatedAfterRemoval,
    });

    render(
      <GroupMembersDialog
        conversation={BASE_CONVERSATION}
        workspaceId="ws-1"
        currentUserId="u-1"
        onClose={vi.fn()}
        onConversationUpdated={onConversationUpdated}
      />,
    );

    // Click Remove for Alan Turing
    const removeAlanBtn = screen.getByRole('button', { name: /remove alan turing/i });
    await user.click(removeAlanBtn);

    await waitFor(() => {
      expect(removeConversationParticipantMock).toHaveBeenCalledWith(
        'http://localhost:4000',
        'grp-1',
        'u-2',
      );
      expect(onConversationUpdated).toHaveBeenCalledWith(updatedAfterRemoval);
    });
  });

  it('hides admin controls when current user is a MEMBER (non-admin)', () => {
    const memberConversation: DirectConversation = {
      ...BASE_CONVERSATION,
      currentUserRole: 'MEMBER',
      participants: [
        { id: 'u-1', name: 'Ada Lovelace', email: 'ada@example.com', image: null, role: 'MEMBER' },
        { id: 'u-2', name: 'Alan Turing', email: 'alan@example.com', image: null, role: 'ADMIN' },
      ],
    };

    render(
      <GroupMembersDialog
        conversation={memberConversation}
        workspaceId="ws-1"
        currentUserId="u-1"
        onClose={vi.fn()}
      />,
    );

    expect(screen.queryByRole('button', { name: /^rename$/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /\+ add member/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /remove/i })).not.toBeInTheDocument();
    // But Leave group should still be accessible
    expect(screen.getByRole('button', { name: /leave group/i })).toBeInTheDocument();
  });

  it('allows a member to leave the group after confirmation', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    const onLeft = vi.fn();

    leaveGroupConversationMock.mockResolvedValue({
      ok: true,
      data: { success: true },
    });

    render(
      <GroupMembersDialog
        conversation={BASE_CONVERSATION}
        workspaceId="ws-1"
        currentUserId="u-1"
        onClose={onClose}
        onLeftConversation={onLeft}
      />,
    );

    // Click initial "Leave group" trigger
    await user.click(screen.getByRole('button', { name: /leave group/i }));

    // Confirm prompt is now displayed
    expect(screen.getByText(/are you sure you want to leave/i)).toBeInTheDocument();

    // Click "Leave Group" confirmation button
    const confirmBtn = screen.getByRole('button', { name: /^leave group$/i });
    await user.click(confirmBtn);

    await waitFor(() => {
      expect(leaveGroupConversationMock).toHaveBeenCalledWith('http://localhost:4000', 'grp-1');
      expect(onLeft).toHaveBeenCalled();
      expect(onClose).toHaveBeenCalled();
    });
  });
});
