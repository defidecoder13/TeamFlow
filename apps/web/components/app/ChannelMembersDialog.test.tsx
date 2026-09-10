import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ChannelMembersDialog } from './ChannelMembersDialog';

const { channelMembersMock, wsMembersMock } = vi.hoisted(() => ({
  channelMembersMock: { value: { status: 'idle' } as unknown },
  wsMembersMock: { value: { status: 'idle' } as unknown },
}));

vi.mock('../../lib/use-channel-members', () => ({
  useChannelMembers: () => ({
    state: (channelMembersMock as { value: unknown }).value,
    addMember: vi.fn().mockResolvedValue({ ok: true }),
    removeMember: vi.fn().mockResolvedValue({ ok: true }),
    retry: vi.fn(),
  }),
}));

vi.mock('../../lib/use-workspace-members', () => ({
  useWorkspaceMembers: () => ({ state: (wsMembersMock as { value: unknown }).value }),
}));

const CHANNEL = {
  id: 'ch-1',
  name: 'Secret',
  slug: 'secret',
  description: null,
  type: 'PRIVATE' as const,
  createdAt: '2026-09-06T00:00:00.000Z',
  updatedAt: '2026-09-06T00:00:00.000Z',
};

beforeEach(() => {
  (channelMembersMock as { value: unknown }).value = {
    status: 'ready',
    members: [
      {
        id: 'cm-1',
        channelId: 'ch-1',
        userId: 'u-1',
        createdAt: '2026-09-06T00:00:00.000Z',
        user: { id: 'u-1', name: 'Ada', email: 'ada@example.com', image: null },
      },
      {
        id: 'cm-2',
        channelId: 'ch-1',
        userId: 'u-2',
        createdAt: '2026-09-06T00:00:00.000Z',
        user: { id: 'u-2', name: 'Bob', email: 'bob@example.com', image: null },
      },
    ],
  };
  (wsMembersMock as { value: unknown }).value = {
    status: 'ready',
    members: [
      {
        id: 'm-1',
        role: 'MEMBER',
        createdAt: '2026-09-06T00:00:00.000Z',
        user: { id: 'u-1', name: 'Ada', email: 'ada@example.com', image: null },
      },
      {
        id: 'm-2',
        role: 'MEMBER',
        createdAt: '2026-09-06T00:00:00.000Z',
        user: { id: 'u-2', name: 'Bob', email: 'bob@example.com', image: null },
      },
      {
        id: 'm-3',
        role: 'MEMBER',
        createdAt: '2026-09-06T00:00:00.000Z',
        user: { id: 'u-3', name: 'Carol', email: 'carol@example.com', image: null },
      },
    ],
  };
});

describe('ChannelMembersDialog', () => {
  it('renders current members', () => {
    render(
      <ChannelMembersDialog
        workspaceId="ws-1"
        channel={CHANNEL}
        canManage={true}
        onClose={vi.fn()}
      />,
    );
    expect(screen.getByText('Ada')).toBeInTheDocument();
    expect(screen.getByText('Bob')).toBeInTheDocument();
  });

  it('excludes existing members from picker', async () => {
    render(
      <ChannelMembersDialog
        workspaceId="ws-1"
        channel={CHANNEL}
        canManage={true}
        onClose={vi.fn()}
      />,
    );
    // Carol is available (not in channel), Ada is already member and should be filtered out from picker
    expect(screen.getByText('Carol')).toBeInTheDocument(); // Carol in picker
    const input = screen.getByPlaceholderText('Search members to add…');
    await userEvent.type(input, 'Ada');
    // After filtering Ada, picker should show no matching members, but Carol should not be visible in picker anymore
    expect(screen.getByText('No matching members found.')).toBeInTheDocument();
  });

  it('shows add controls only when canManage', () => {
    const { rerender } = render(
      <ChannelMembersDialog
        workspaceId="ws-1"
        channel={CHANNEL}
        canManage={false}
        onClose={vi.fn()}
      />,
    );
    expect(screen.queryByPlaceholderText('Search members to add…')).not.toBeInTheDocument();
    rerender(
      <ChannelMembersDialog
        workspaceId="ws-1"
        channel={CHANNEL}
        canManage={true}
        onClose={vi.fn()}
      />,
    );
    expect(screen.getByPlaceholderText('Search members to add…')).toBeInTheDocument();
  });

  it('handles loading and empty states', () => {
    (channelMembersMock as { value: unknown }).value = { status: 'loading' };
    const { rerender } = render(
      <ChannelMembersDialog
        workspaceId="ws-1"
        channel={CHANNEL}
        canManage={true}
        onClose={vi.fn()}
      />,
    );
    expect(screen.getByText('Loading members…')).toBeInTheDocument();
    (channelMembersMock as { value: unknown }).value = { status: 'ready', members: [] };
    rerender(
      <ChannelMembersDialog
        workspaceId="ws-1"
        channel={CHANNEL}
        canManage={true}
        onClose={vi.fn()}
      />,
    );
    expect(screen.getByText('No members yet.')).toBeInTheDocument();
  });
});
