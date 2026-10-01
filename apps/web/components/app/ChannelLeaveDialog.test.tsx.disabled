import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ChannelLeaveDialog } from './ChannelLeaveDialog';
import type { Channel } from '../../lib/channels';

const { leaveChannelMock } = vi.hoisted(() => ({ leaveChannelMock: vi.fn() }));
vi.mock('../../lib/channels', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../lib/channels')>()),
  leaveChannel: leaveChannelMock,
}));

const CHANNEL: Channel = {
  id: 'ch1',
  name: 'secret',
  slug: 'secret',
  description: null,
  type: 'PRIVATE',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

beforeEach(() => {
  leaveChannelMock.mockReset();
  vi.stubEnv('NEXT_PUBLIC_API_URL', 'http://localhost:4000');
});

describe('ChannelLeaveDialog', () => {
  it('calls leave and onLeft', async () => {
    const user = userEvent.setup();
    const onLeft = vi.fn();
    leaveChannelMock.mockResolvedValue({ ok: true });
    render(
      <ChannelLeaveDialog
        workspaceId="ws1"
        channel={CHANNEL}
        onClose={vi.fn()}
        onLeft={onLeft}
        onUnauthenticated={vi.fn()}
      />,
    );
    await user.click(screen.getByRole('button', { name: /leave channel/i }));
    expect(leaveChannelMock).toHaveBeenCalledWith('http://localhost:4000', 'ws1', 'secret');
    expect(onLeft).toHaveBeenCalled();
  });
});
