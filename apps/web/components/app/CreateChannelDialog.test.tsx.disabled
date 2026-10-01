import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CreateChannelDialog } from './CreateChannelDialog';
import type { Channel } from '../../lib/channels';

const { createChannelMock } = vi.hoisted(() => ({ createChannelMock: vi.fn() }));

vi.mock('../../lib/channels', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../lib/channels')>()),
  createChannel: createChannelMock,
}));

const CREATED: Channel = {
  id: 'ch-9',
  name: 'Engineering',
  slug: 'engineering',
  description: null,
  type: 'PUBLIC',
  createdAt: '2026-09-06T00:00:00.000Z',
  updatedAt: '2026-09-06T00:00:00.000Z',
};

function renderDialog() {
  return render(
    <CreateChannelDialog
      workspaceId="ws-1"
      workspaceName="Acme"
      onClose={vi.fn()}
      onCreated={vi.fn()}
      onUnauthenticated={vi.fn()}
    />,
  );
}

beforeEach(() => {
  createChannelMock.mockReset();
  vi.stubEnv('NEXT_PUBLIC_API_URL', 'http://localhost:4000');
});

describe('CreateChannelDialog', () => {
  it('renders name, description, and visibility selection', () => {
    renderDialog();

    expect(screen.getByRole('dialog', { name: /create a channel/i })).toBeInTheDocument();
    expect(screen.getByLabelText(/channel name/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/description/i)).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: /public/i })).toBeChecked();
    expect(screen.getByRole('radio', { name: /private/i })).not.toBeChecked();
  });

  it('requires a name and enforces length limits', async () => {
    const user = userEvent.setup();
    renderDialog();

    await user.click(screen.getByRole('button', { name: /create channel/i }));
    expect(await screen.findByText(/channel name is required/i)).toBeInTheDocument();
    expect(createChannelMock).not.toHaveBeenCalled();
  });

  it('creates public channels by default and private on selection', async () => {
    const user = userEvent.setup();
    const onCreated = vi.fn();
    createChannelMock.mockResolvedValue({ ok: true, channel: CREATED });
    render(
      <CreateChannelDialog
        workspaceId="ws-1"
        workspaceName="Acme"
        onClose={vi.fn()}
        onCreated={onCreated}
        onUnauthenticated={vi.fn()}
      />,
    );

    await user.type(screen.getByLabelText(/channel name/i), '  Engineering  ');
    await user.click(screen.getByRole('radio', { name: /private/i }));
    await user.click(screen.getByRole('button', { name: /create channel/i }));

    expect(createChannelMock).toHaveBeenCalledWith('http://localhost:4000', 'ws-1', {
      name: 'Engineering',
      description: undefined,
      type: 'PRIVATE',
    });
    expect(onCreated).toHaveBeenCalledWith(CREATED);
  });

  it('disables submission while creating', async () => {
    const user = userEvent.setup();
    createChannelMock.mockReturnValue(new Promise(() => {}));
    renderDialog();

    await user.type(screen.getByLabelText(/channel name/i), 'Engineering');
    await user.click(screen.getByRole('button', { name: /create channel/i }));
    expect(screen.getByRole('button', { name: /creating channel/i })).toBeDisabled();
    expect(screen.getByLabelText(/channel name/i)).toBeDisabled();
  });

  it('shows conflict, validation, and generic errors safely', async () => {
    const user = userEvent.setup();
    createChannelMock.mockResolvedValue({
      ok: false,
      kind: 'conflict',
      message: 'A channel with this name already exists.',
    });
    renderDialog();

    await user.type(screen.getByLabelText(/channel name/i), 'Engineering');
    await user.click(screen.getByRole('button', { name: /create channel/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/already exists/i);
  });

  it('closes on Escape', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(
      <CreateChannelDialog
        workspaceId="ws-1"
        workspaceName="Acme"
        onClose={onClose}
        onCreated={vi.fn()}
        onUnauthenticated={vi.fn()}
      />,
    );

    await user.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
