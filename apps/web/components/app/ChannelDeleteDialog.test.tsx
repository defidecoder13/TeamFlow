import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ChannelDeleteDialog } from './ChannelDeleteDialog';
import type { Channel } from '../../lib/channels';

const { deleteChannelMock } = vi.hoisted(() => ({ deleteChannelMock: vi.fn() }));
vi.mock('../../lib/channels', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../lib/channels')>()),
  deleteChannel: deleteChannelMock,
}));

const CHANNEL: Channel = {
  id: 'ch1',
  name: 'general',
  slug: 'general',
  description: null,
  type: 'PUBLIC',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

beforeEach(() => {
  deleteChannelMock.mockReset();
  vi.stubEnv('NEXT_PUBLIC_API_URL', 'http://localhost:4000');
});

describe('ChannelDeleteDialog', () => {
  it('requires typed slug to enable', async () => {
    const user = userEvent.setup();
    render(
      <ChannelDeleteDialog
        workspaceId="ws1"
        channel={CHANNEL}
        onClose={vi.fn()}
        onDeleted={vi.fn()}
        onUnauthenticated={vi.fn()}
      />,
    );
    const btn = screen.getByRole('button', { name: /delete channel/i });
    expect(btn).toBeDisabled();
    await user.type(screen.getByLabelText(/type.*to confirm/i), 'general');
    expect(btn).toBeEnabled();
  });

  it('calls delete and onDeleted', async () => {
    const user = userEvent.setup();
    const onDeleted = vi.fn();
    deleteChannelMock.mockResolvedValue({ ok: true });
    render(
      <ChannelDeleteDialog
        workspaceId="ws1"
        channel={CHANNEL}
        onClose={vi.fn()}
        onDeleted={onDeleted}
        onUnauthenticated={vi.fn()}
      />,
    );
    await user.type(screen.getByLabelText(/type.*to confirm/i), 'general');
    await user.click(screen.getByRole('button', { name: /delete channel/i }));
    expect(deleteChannelMock).toHaveBeenCalledWith('http://localhost:4000', 'ws1', 'general');
    expect(onDeleted).toHaveBeenCalled();
  });

  it('shows forbidden error', async () => {
    const user = userEvent.setup();
    deleteChannelMock.mockResolvedValue({ ok: false, kind: 'forbidden' });
    render(
      <ChannelDeleteDialog
        workspaceId="ws1"
        channel={CHANNEL}
        onClose={vi.fn()}
        onDeleted={vi.fn()}
        onUnauthenticated={vi.fn()}
      />,
    );
    await user.type(screen.getByLabelText(/type.*to confirm/i), 'general');
    await user.click(screen.getByRole('button', { name: /delete channel/i }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/permission/i);
  });
});
