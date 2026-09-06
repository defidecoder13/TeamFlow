import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { EditChannelDialog } from './EditChannelDialog';
import type { Channel } from '../../lib/channels';

const { updateChannelMock } = vi.hoisted(() => ({ updateChannelMock: vi.fn() }));

vi.mock('../../lib/channels', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../lib/channels')>()),
  updateChannel: updateChannelMock,
}));

const CHANNEL: Channel = {
  id: 'ch-1',
  name: 'Engineering',
  slug: 'engineering',
  description: 'Build things',
  type: 'PUBLIC',
  createdAt: '2026-09-06T00:00:00.000Z',
  updatedAt: '2026-09-06T00:00:00.000Z',
};

function renderDialog() {
  return render(
    <EditChannelDialog
      workspaceId="ws-1"
      channel={CHANNEL}
      onClose={vi.fn()}
      onUpdated={vi.fn()}
      onUnauthenticated={vi.fn()}
    />,
  );
}

beforeEach(() => {
  updateChannelMock.mockReset();
  vi.stubEnv('NEXT_PUBLIC_API_URL', 'http://localhost:4000');
});

describe('EditChannelDialog', () => {
  it('prefills name and description without exposing immutable fields', () => {
    renderDialog();

    expect(screen.getByLabelText(/channel name/i)).toHaveValue('Engineering');
    expect(screen.getByLabelText(/description/i)).toHaveValue('Build things');
    expect(screen.queryByLabelText(/slug|workspace|creator|type/i)).not.toBeInTheDocument();
  });

  it('saves name and description changes', async () => {
    const user = userEvent.setup();
    const onUpdated = vi.fn();
    updateChannelMock.mockResolvedValue({ ok: true, channel: { ...CHANNEL, name: 'Eng' } });
    render(
      <EditChannelDialog
        workspaceId="ws-1"
        channel={CHANNEL}
        onClose={vi.fn()}
        onUpdated={onUpdated}
        onUnauthenticated={vi.fn()}
      />,
    );

    await user.clear(screen.getByLabelText(/channel name/i));
    await user.type(screen.getByLabelText(/channel name/i), 'Eng');
    await user.click(screen.getByRole('button', { name: /save changes/i }));

    expect(updateChannelMock).toHaveBeenCalledWith('http://localhost:4000', 'ws-1', 'engineering', {
      name: 'Eng',
      description: 'Build things',
    });
    expect(onUpdated).toHaveBeenCalledTimes(1);
  });

  it('maps forbidden and conflict outcomes to safe messages', async () => {
    const user = userEvent.setup();
    updateChannelMock.mockResolvedValue({ ok: false, kind: 'forbidden' });
    renderDialog();

    await user.click(screen.getByRole('button', { name: /save changes/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/do not have permission/i);
  });
});
