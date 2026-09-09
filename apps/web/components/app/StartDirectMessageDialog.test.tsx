import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { StartDirectMessageDialog } from './StartDirectMessageDialog';
import type { WorkspaceMember } from '../../lib/members';
import type { DirectConversation } from '../../lib/messages';

const {
  useSessionUserMock,
  useWorkspaceMembersMock,
  createOrGetDirectConversationMock,
  createGroupConversationMock,
} = vi.hoisted(() => ({
  useSessionUserMock: vi.fn(),
  useWorkspaceMembersMock: vi.fn(),
  createOrGetDirectConversationMock: vi.fn(),
  createGroupConversationMock: vi.fn(),
}));

vi.mock('../../lib/use-session-user', () => ({
  useSessionUser: useSessionUserMock,
}));

vi.mock('../../lib/use-workspace-members', () => ({
  useWorkspaceMembers: useWorkspaceMembersMock,
}));

vi.mock('../../lib/messages', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../lib/messages')>()),
  createOrGetDirectConversation: createOrGetDirectConversationMock,
  createGroupConversation: createGroupConversationMock,
}));

const CURRENT_USER = {
  id: 'u-1',
  name: 'Ada Lovelace',
  email: 'ada@example.com',
  image: null,
  emailVerified: true,
};

const OTHER_MEMBER_1: WorkspaceMember = {
  id: 'wm-2',
  role: 'MEMBER',
  createdAt: '2026-09-08T00:00:00.000Z',
  user: {
    id: 'u-2',
    name: 'Alan Turing',
    email: 'alan@example.com',
    image: null,
  },
};

const OTHER_MEMBER_2: WorkspaceMember = {
  id: 'wm-3',
  role: 'MEMBER',
  createdAt: '2026-09-08T00:00:00.000Z',
  user: {
    id: 'u-3',
    name: 'Grace Hopper',
    email: 'grace@example.com',
    image: null,
  },
};

const CURRENT_USER_MEMBER: WorkspaceMember = {
  id: 'wm-1',
  role: 'OWNER',
  createdAt: '2026-09-08T00:00:00.000Z',
  user: {
    id: 'u-1',
    name: 'Ada Lovelace',
    email: 'ada@example.com',
    image: null,
  },
};

const CREATED_CONVERSATION: DirectConversation = {
  id: 'dm-1',
  workspaceId: 'ws-1',
  type: 'DIRECT',
  createdAt: new Date('2026-09-08T00:00:00.000Z'),
  updatedAt: new Date('2026-09-08T00:00:00.000Z'),
  participants: [
    { id: 'u-1', name: 'Ada Lovelace', email: 'ada@example.com', image: null },
    { id: 'u-2', name: 'Alan Turing', email: 'alan@example.com', image: null },
  ],
  peer: { id: 'u-2', name: 'Alan Turing', email: 'alan@example.com', image: null },
};

beforeEach(() => {
  useSessionUserMock.mockReset();
  useWorkspaceMembersMock.mockReset();
  createOrGetDirectConversationMock.mockReset();
  createGroupConversationMock.mockReset();

  vi.stubEnv('NEXT_PUBLIC_API_URL', 'http://localhost:4000');

  useSessionUserMock.mockReturnValue({
    status: 'authenticated',
    user: CURRENT_USER,
  });

  useWorkspaceMembersMock.mockReturnValue({
    state: {
      status: 'ready',
      members: [CURRENT_USER_MEMBER, OTHER_MEMBER_1, OTHER_MEMBER_2],
    },
    retry: vi.fn(),
  });
});

describe('StartDirectMessageDialog', () => {
  it('renders members list excluding the current user', () => {
    render(
      <StartDirectMessageDialog
        workspaceId="ws-1"
        workspaceName="Acme"
        onClose={vi.fn()}
        onSelectConversation={vi.fn()}
      />,
    );

    expect(screen.getByRole('dialog', { name: /new direct message/i })).toBeInTheDocument();
    expect(screen.getByText('Alan Turing')).toBeInTheDocument();
    expect(screen.getByText('Grace Hopper')).toBeInTheDocument();
    expect(screen.queryByText('Ada Lovelace')).not.toBeInTheDocument();
  });

  it('filters members by search query', async () => {
    const user = userEvent.setup();
    render(
      <StartDirectMessageDialog
        workspaceId="ws-1"
        workspaceName="Acme"
        onClose={vi.fn()}
        onSelectConversation={vi.fn()}
      />,
    );

    const searchInput = screen.getByPlaceholderText(/search members/i);
    await user.type(searchInput, 'Grace');

    expect(screen.queryByText('Alan Turing')).not.toBeInTheDocument();
    expect(screen.getByText('Grace Hopper')).toBeInTheDocument();
  });

  it('selects a member and triggers conversation creation', async () => {
    const user = userEvent.setup();
    const onSelectConversation = vi.fn();
    const onClose = vi.fn();

    createOrGetDirectConversationMock.mockResolvedValue({
      ok: true,
      data: CREATED_CONVERSATION,
    });

    render(
      <StartDirectMessageDialog
        workspaceId="ws-1"
        workspaceName="Acme"
        onClose={onClose}
        onSelectConversation={onSelectConversation}
      />,
    );

    await user.click(screen.getByText('Alan Turing'));

    await waitFor(() => {
      expect(createOrGetDirectConversationMock).toHaveBeenCalledWith(
        'http://localhost:4000',
        'ws-1',
        'u-2',
      );
      expect(onSelectConversation).toHaveBeenCalledWith(CREATED_CONVERSATION);
      expect(onClose).toHaveBeenCalled();
    });
  });

  it('closes when clicking Cancel button', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();

    render(
      <StartDirectMessageDialog
        workspaceId="ws-1"
        workspaceName="Acme"
        onClose={onClose}
        onSelectConversation={vi.fn()}
      />,
    );

    await user.click(screen.getByRole('button', { name: /cancel/i }));
    expect(onClose).toHaveBeenCalled();
  });

  describe('Group Message mode', () => {
    it('switches tabs and disables create group button until at least 2 members are selected', async () => {
      const user = userEvent.setup();
      render(
        <StartDirectMessageDialog
          workspaceId="ws-1"
          workspaceName="Acme"
          onClose={vi.fn()}
          onSelectConversation={vi.fn()}
        />,
      );

      // Switch to Group Message tab
      await user.click(screen.getByRole('tab', { name: /group message/i }));

      // Group Name input should be visible
      expect(screen.getByLabelText(/group name/i)).toBeInTheDocument();

      // Create Group button should be disabled initially (0 selected)
      const createButton = screen.getByRole('button', { name: /create group/i });
      expect(createButton).toBeDisabled();
      expect(screen.getByText(/min 2 others required/i)).toBeInTheDocument();

      // Select 1 member
      await user.click(screen.getByText('Alan Turing'));
      expect(createButton).toBeDisabled();
      expect(screen.getByText(/selected: 1/i)).toBeInTheDocument();

      // Select 2nd member
      await user.click(screen.getByText('Grace Hopper'));
      expect(createButton).not.toBeDisabled();
      expect(screen.getByText(/selected: 2/i)).toBeInTheDocument();
    });

    it('creates a group conversation successfully', async () => {
      const user = userEvent.setup();
      const onClose = vi.fn();
      const onSelectConversation = vi.fn();

      const createdGroup: DirectConversation = {
        id: 'grp-1',
        workspaceId: 'ws-1',
        type: 'GROUP',
        name: 'Design Sync',
        createdAt: new Date('2026-09-08T00:00:00.000Z'),
        updatedAt: new Date('2026-09-08T00:00:00.000Z'),
        participants: [
          { id: 'u-1', name: 'Ada Lovelace', email: 'ada@example.com', image: null },
          { id: 'u-2', name: 'Alan Turing', email: 'alan@example.com', image: null },
          { id: 'u-3', name: 'Grace Hopper', email: 'grace@example.com', image: null },
        ],
      };

      createGroupConversationMock.mockResolvedValue({
        ok: true,
        data: createdGroup,
      });

      render(
        <StartDirectMessageDialog
          workspaceId="ws-1"
          workspaceName="Acme"
          onClose={onClose}
          onSelectConversation={onSelectConversation}
        />,
      );

      await user.click(screen.getByRole('tab', { name: /group message/i }));

      // Type group name
      await user.type(screen.getByLabelText(/group name/i), 'Design Sync');

      // Select two members
      await user.click(screen.getByText('Alan Turing'));
      await user.click(screen.getByText('Grace Hopper'));

      // Click Create Group
      await user.click(screen.getByRole('button', { name: /create group/i }));

      await waitFor(() => {
        expect(createGroupConversationMock).toHaveBeenCalledWith('http://localhost:4000', 'ws-1', {
          name: 'Design Sync',
          participantIds: expect.arrayContaining(['u-2', 'u-3']),
        });
        expect(onSelectConversation).toHaveBeenCalledWith(createdGroup);
        expect(onClose).toHaveBeenCalled();
      });
    });

    it('displays error message when group creation fails', async () => {
      const user = userEvent.setup();
      const onClose = vi.fn();

      createGroupConversationMock.mockResolvedValue({
        ok: false,
        message: 'Maximum 20 participants allowed',
      });

      render(
        <StartDirectMessageDialog
          workspaceId="ws-1"
          workspaceName="Acme"
          onClose={onClose}
          onSelectConversation={vi.fn()}
        />,
      );

      await user.click(screen.getByRole('tab', { name: /group message/i }));
      await user.click(screen.getByText('Alan Turing'));
      await user.click(screen.getByText('Grace Hopper'));

      await user.click(screen.getByRole('button', { name: /create group/i }));

      await waitFor(() => {
        expect(screen.getByRole('alert')).toHaveTextContent(/maximum 20 participants allowed/i);
      });
      expect(onClose).not.toHaveBeenCalled();
    });
  });
});
