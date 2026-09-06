import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { WorkspaceChannelsState } from '../../lib/use-workspace-channels';
import { Sidebar } from './Sidebar';
import type { Channel } from '../../lib/channels';

const { channelsState, pathname, pushMock } = vi.hoisted(() => ({
  channelsState: { value: { status: 'loading' } as WorkspaceChannelsState },
  pathname: { value: '/app' },
  pushMock: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: pushMock, replace: vi.fn(), refresh: vi.fn() }),
  usePathname: () => pathname.value,
}));

vi.mock('../../lib/use-workspace-channels', () => ({
  useWorkspaceChannels: () => ({
    state: channelsState.value,
    retry: vi.fn(),
    addChannel: vi.fn(),
    updateChannelState: vi.fn(),
  }),
}));

const ENGINEERING: Channel = {
  id: 'ch-1',
  name: 'Engineering',
  slug: 'engineering',
  description: null,
  type: 'PUBLIC',
  createdAt: '2026-09-06T00:00:00.000Z',
  updatedAt: '2026-09-06T00:00:00.000Z',
};

const VAULT: Channel = {
  id: 'ch-2',
  name: 'Vault',
  slug: 'vault',
  description: null,
  type: 'PRIVATE',
  createdAt: '2026-09-06T00:00:00.000Z',
  updatedAt: '2026-09-06T00:00:00.000Z',
};

beforeEach(() => {
  pushMock.mockReset();
  pathname.value = '/app';
  channelsState.value = { status: 'loading' };
});

describe('Sidebar channels', () => {
  it('renders real channels with links and marks the URL-active one', () => {
    pathname.value = '/app/channels/vault';
    channelsState.value = { status: 'ready', channels: [ENGINEERING, VAULT] };
    render(<Sidebar workspaceName="Acme" workspaceId="ws-1" />);

    const engineering = screen.getByRole('link', { name: 'Engineering' });
    expect(engineering).toHaveAttribute('href', '/app/channels/engineering');
    expect(engineering).not.toHaveAttribute('aria-current');

    const vault = screen.getByRole('link', { name: /^vault$/i });
    expect(vault).toHaveAttribute('href', '/app/channels/vault');
    expect(vault).toHaveAttribute('aria-current', 'page');
    expect(vault).toHaveAttribute('title', 'Vault (private)');
  });

  it('never renders mock channels', () => {
    channelsState.value = { status: 'ready', channels: [ENGINEERING] };
    render(<Sidebar workspaceName="Acme" workspaceId="ws-1" />);

    for (const mock of ['general', 'design', 'product', 'random']) {
      expect(
        screen.queryByRole('link', { name: new RegExp(`^${mock}$`, 'i') }),
      ).not.toBeInTheDocument();
    }
  });

  it('shows an honest empty state without a workspace', () => {
    channelsState.value = { status: 'idle' };
    render(<Sidebar workspaceName={null} workspaceId={null} />);

    expect(screen.getByText(/no channels yet/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /create channel/i })).not.toBeInTheDocument();
  });

  it('opens the create dialog from the section action', async () => {
    const user = userEvent.setup();
    channelsState.value = { status: 'ready', channels: [] };
    render(<Sidebar workspaceName="Acme" workspaceId="ws-1" />);

    await user.click(screen.getByRole('button', { name: /create channel/i }));

    expect(screen.getByRole('dialog', { name: /create a channel/i })).toBeInTheDocument();
  });

  it('marks only Home active on /app', () => {
    pathname.value = '/app';
    channelsState.value = { status: 'ready', channels: [ENGINEERING, VAULT] };
    render(<Sidebar workspaceName="Acme" workspaceId="ws-1" />);

    const home = screen.getByRole('link', { name: 'Home' });
    expect(home).toHaveAttribute('href', '/app');
    expect(home).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('link', { name: /^engineering$/i })).not.toHaveAttribute(
      'aria-current',
    );
  });

  it('marks only the matching channel active on /app/channels/demo', () => {
    pathname.value = '/app/channels/demo';
    channelsState.value = {
      status: 'ready',
      channels: [ENGINEERING, { ...VAULT, name: 'demo', slug: 'demo' }],
    };
    render(<Sidebar workspaceName="Acme" workspaceId="ws-1" />);

    expect(screen.getByRole('link', { name: 'Home' })).not.toHaveAttribute('aria-current');
    const demo = screen.getByRole('link', { name: /^demo$/i });
    expect(demo).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('link', { name: /^engineering$/i })).not.toHaveAttribute(
      'aria-current',
    );
  });
});
