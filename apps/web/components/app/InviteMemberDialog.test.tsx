import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { InviteMemberDialog } from './InviteMemberDialog';
import type { CreatedInvitation } from '../../lib/invitations';

const { createInvitationMock } = vi.hoisted(() => ({ createInvitationMock: vi.fn() }));

vi.mock('../../lib/invitations', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../lib/invitations')>()),
  createInvitation: createInvitationMock,
}));

const CREATED: CreatedInvitation = {
  id: 'inv-1',
  email: 'newbie@example.com',
  expiresAt: '2026-09-13T00:00:00.000Z',
  createdAt: '2026-09-06T00:00:00.000Z',
  token: 'raw-development-token-value',
};

function renderDialog() {
  return render(
    <InviteMemberDialog
      workspaceId="ws-1"
      workspaceName="Real Workspace"
      onClose={vi.fn()}
      onCreated={vi.fn()}
      onUnauthenticated={vi.fn()}
    />,
  );
}

beforeEach(() => {
  createInvitationMock.mockReset();
  vi.stubEnv('NEXT_PUBLIC_API_URL', 'http://localhost:4000');
  Object.defineProperty(window.navigator, 'clipboard', {
    value: undefined,
    configurable: true,
  });
});

describe('InviteMemberDialog', () => {
  it('renders the invite form with accessible semantics', () => {
    renderDialog();

    expect(screen.getByRole('dialog', { name: /invite a member/i })).toBeInTheDocument();
    expect(screen.getByLabelText(/email/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /invite member/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /cancel/i })).toBeInTheDocument();
  });

  it('requires an email before submitting', async () => {
    const user = userEvent.setup();
    renderDialog();

    await user.click(screen.getByRole('button', { name: /invite member/i }));

    expect(await screen.findByText(/enter (your )?email address/i)).toBeInTheDocument();
    expect(createInvitationMock).not.toHaveBeenCalled();
  });

  it('rejects invalid emails and trims before submitting', async () => {
    const user = userEvent.setup();
    renderDialog();

    await user.type(screen.getByLabelText(/email/i), 'not-an-email');
    await user.click(screen.getByRole('button', { name: /invite member/i }));
    expect(await screen.findByText(/enter a valid email address/i)).toBeInTheDocument();
    expect(createInvitationMock).not.toHaveBeenCalled();

    await user.clear(screen.getByLabelText(/email/i));
    await user.type(screen.getByLabelText(/email/i), '  newbie@example.com  ');
    createInvitationMock.mockResolvedValue({ ok: true, invitation: CREATED });
    await user.click(screen.getByRole('button', { name: /invite member/i }));

    expect(createInvitationMock).toHaveBeenCalledWith(
      'http://localhost:4000',
      'ws-1',
      'newbie@example.com',
    );
  });

  it('disables submission while creating', async () => {
    const user = userEvent.setup();
    createInvitationMock.mockReturnValue(new Promise(() => {}));
    renderDialog();

    await user.type(screen.getByLabelText(/email/i), 'newbie@example.com');
    await user.click(screen.getByRole('button', { name: /invite member/i }));

    expect(screen.getByRole('button', { name: /inviting/i })).toBeDisabled();
  });

  it('shows conflict and generic errors safely', async () => {
    const user = userEvent.setup();
    createInvitationMock.mockResolvedValue({
      ok: false,
      kind: 'conflict',
      message: 'An invitation is already pending for this email address.',
    });
    renderDialog();

    await user.type(screen.getByLabelText(/email/i), 'newbie@example.com');
    await user.click(screen.getByRole('button', { name: /invite member/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/already pending/i);
  });

  it('shows the development link after success without email-sent claims', async () => {
    const user = userEvent.setup();
    const onCreated = vi.fn();
    createInvitationMock.mockResolvedValue({ ok: true, invitation: CREATED });
    render(
      <InviteMemberDialog
        workspaceId="ws-1"
        workspaceName="Real Workspace"
        onClose={vi.fn()}
        onCreated={onCreated}
        onUnauthenticated={vi.fn()}
      />,
    );

    await user.type(screen.getByLabelText(/email/i), 'newbie@example.com');
    await user.click(screen.getByRole('button', { name: /invite member/i }));

    expect(await screen.findByText(/invitation created/i)).toBeInTheDocument();
    expect(screen.getByText(/email delivery isn't configured yet/i)).toBeInTheDocument();
    expect(screen.queryByText(/email sent/i)).not.toBeInTheDocument();
    const link = screen.getByLabelText(/development invitation link/i) as HTMLInputElement;
    expect(link.value).toContain('/invite/accept?token=');
    expect(onCreated).toHaveBeenCalledTimes(1);
    expect(window.localStorage.length).toBe(0);
  });

  it('closes on Escape', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(
      <InviteMemberDialog
        workspaceId="ws-1"
        workspaceName="Real Workspace"
        onClose={onClose}
        onCreated={vi.fn()}
        onUnauthenticated={vi.fn()}
      />,
    );

    await user.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
