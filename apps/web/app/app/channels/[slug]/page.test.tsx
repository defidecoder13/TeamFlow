import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SessionState } from '../../../../lib/use-session-user';
import type { WorkspacesState } from '../../../../lib/use-workspaces';
import type { WorkspaceChannelState } from '../../../../lib/use-workspace-channel';
import ChannelPage from './page';

const { replaceMock, sessionState, workspacesState, channelState } = vi.hoisted(() => ({
  replaceMock: vi.fn(),
  sessionState: { value: { status: 'loading' } as SessionState },
  workspacesState: { value: { status: 'idle' } as WorkspacesState },
  channelState: { value: { status: 'loading' } as WorkspaceChannelState },
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: replaceMock, push: vi.fn(), refresh: vi.fn() }),
  useParams: () => ({ slug: 'engineering' }),
  usePathname: () => '/app/channels/engineering',
}));

vi.mock('../../../../lib/use-session-user', () => ({
  useSessionUser: () => sessionState.value,
}));

vi.mock('../../../../lib/use-workspaces', () => ({
  useWorkspaces: () => ({
    state: workspacesState.value,
    retry: vi.fn(),
    addWorkspace: vi.fn(),
  }),
}));

vi.mock('../../../../lib/use-workspace-channel', () => ({
  useWorkspaceChannel: () => ({ state: channelState.value, retry: vi.fn(), setChannel: vi.fn() }),
}));

vi.mock('../../../../lib/use-workspace-channels', () => ({
  useWorkspaceChannels: () => ({
    state: { status: 'ready', channels: [] },
    retry: vi.fn(),
    addChannel: vi.fn(),
    updateChannelState: vi.fn(),
  }),
}));

vi.mock('../../../../lib/auth-client', () => ({
  getAuthClient: () => ({ signOut: vi.fn() }),
}));

const USER = {
  id: 'u-1',
  name: 'Ada Lovelace',
  email: 'ada@example.com',
  image: null,
  emailVerified: true,
};

const WORKSPACE = {
  id: 'ws-1',
  name: 'Real Workspace',
  slug: 'real-workspace',
  role: 'OWNER' as const,
  createdAt: '2026-09-06T00:00:00.000Z',
  updatedAt: '2026-09-06T00:00:00.000Z',
};

const CHANNEL = {
  id: 'ch-1',
  name: 'Engineering',
  slug: 'engineering',
  description: 'Build things',
  type: 'PUBLIC' as const,
  createdAt: '2026-09-06T00:00:00.000Z',
  updatedAt: '2026-09-06T00:00:00.000Z',
};

function authenticateWithChannel() {
  sessionState.value = { status: 'authenticated', user: USER };
  workspacesState.value = { status: 'ready', workspaces: [WORKSPACE], current: WORKSPACE };
  channelState.value = { status: 'ready', channel: CHANNEL };
}

beforeEach(() => {
  replaceMock.mockReset();
  sessionState.value = { status: 'loading' };
  workspacesState.value = { status: 'idle' };
  channelState.value = { status: 'loading' };
});

describe('/app/channels/[slug]', () => {
  it('renders channel metadata and the empty conversation state', () => {
    authenticateWithChannel();
    render(<ChannelPage />);

    expect(screen.getByRole('heading', { name: 'Engineering' })).toBeInTheDocument();
    expect(screen.getByText('Public')).toBeInTheDocument();
    expect(screen.getByText('Build things')).toBeInTheDocument();
    expect(screen.getByText(/welcome to #engineering/i)).toBeInTheDocument();
    expect(screen.getByText(/start a conversation/i)).toBeInTheDocument();
  });

  it('shows no fake messages, members, or activity', () => {
    authenticateWithChannel();
    render(<ChannelPage />);

    expect(screen.queryByText(/john|acme|10:34 AM|replies/i)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /send/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
  });

  it('handles inaccessible channels without leaking existence', () => {
    sessionState.value = { status: 'authenticated', user: USER };
    workspacesState.value = { status: 'ready', workspaces: [WORKSPACE], current: WORKSPACE };
    channelState.value = { status: 'notFound' };
    render(<ChannelPage />);

    expect(screen.getByText(/channel not found/i)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /back to home/i })).toHaveAttribute('href', '/app');
  });

  it('shows the edit action for owners and hides it for plain members', () => {
    authenticateWithChannel();
    const { unmount } = render(<ChannelPage />);
    expect(screen.getByRole('button', { name: /edit channel/i })).toBeInTheDocument();
    unmount();

    sessionState.value = { status: 'authenticated', user: USER };
    workspacesState.value = {
      status: 'ready',
      workspaces: [{ ...WORKSPACE, role: 'MEMBER' as const }],
      current: { ...WORKSPACE, role: 'MEMBER' as const },
    };
    channelState.value = { status: 'ready', channel: CHANNEL };
    render(<ChannelPage />);
    expect(screen.queryByRole('button', { name: /edit channel/i })).not.toBeInTheDocument();
  });

  it('redirects unauthenticated visitors to sign-in', () => {
    sessionState.value = { status: 'unauthenticated' };
    render(<ChannelPage />);

    expect(replaceMock).toHaveBeenCalledWith('/sign-in');
  });

  it('preserves the route slug for refresh-safe rendering', () => {
    authenticateWithChannel();
    render(<ChannelPage />);

    expect(screen.getByText(/welcome to #engineering/i)).toBeInTheDocument();
  });
});
