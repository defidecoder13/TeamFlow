import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CreateWorkspace } from './CreateWorkspace';
import type { WorkspaceSummary } from '../../lib/workspaces';

const { createWorkspaceMock } = vi.hoisted(() => ({ createWorkspaceMock: vi.fn() }));

vi.mock('../../lib/workspaces', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../lib/workspaces')>()),
  createWorkspace: createWorkspaceMock,
}));

const CREATED: WorkspaceSummary = {
  id: 'ws-1',
  name: 'Acme Studio',
  slug: 'acme-studio',
  role: 'OWNER',
  createdAt: '2026-09-06T00:00:00.000Z',
  updatedAt: '2026-09-06T00:00:00.000Z',
};

beforeEach(() => {
  createWorkspaceMock.mockReset();
  vi.stubEnv('NEXT_PUBLIC_API_URL', 'http://localhost:4000');
});

describe('CreateWorkspace', () => {
  it('renders the name input and an enabled action', () => {
    render(<CreateWorkspace onCreated={vi.fn()} onUnauthenticated={vi.fn()} />);

    expect(screen.getByLabelText(/workspace name/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /create workspace/i })).toBeEnabled();
  });

  it('rejects empty and whitespace-only names without calling the API', async () => {
    const user = userEvent.setup();
    const onCreated = vi.fn();
    render(<CreateWorkspace onCreated={onCreated} onUnauthenticated={vi.fn()} />);

    await user.click(screen.getByRole('button', { name: /create workspace/i }));
    expect(await screen.findByText(/workspace name is required/i)).toBeInTheDocument();
    expect(createWorkspaceMock).not.toHaveBeenCalled();

    await user.type(screen.getByLabelText(/workspace name/i), '   ');
    await user.click(screen.getByRole('button', { name: /create workspace/i }));
    expect(createWorkspaceMock).not.toHaveBeenCalled();
    expect(onCreated).not.toHaveBeenCalled();
  });

  it('rejects overlong names without calling the API', async () => {
    const user = userEvent.setup();
    render(<CreateWorkspace onCreated={vi.fn()} onUnauthenticated={vi.fn()} />);

    // The input caps typing at maxLength; set a longer value programmatically
    // to exercise the validation rule itself.
    fireEvent.change(screen.getByLabelText(/workspace name/i), {
      target: { value: 'a'.repeat(101) },
    });
    await user.click(screen.getByRole('button', { name: /create workspace/i }));

    expect(await screen.findByText(/100 characters or fewer/i)).toBeInTheDocument();
    expect(createWorkspaceMock).not.toHaveBeenCalled();
  });

  it('disables submission while creating', async () => {
    const user = userEvent.setup();
    createWorkspaceMock.mockReturnValue(new Promise(() => {}));
    render(<CreateWorkspace onCreated={vi.fn()} onUnauthenticated={vi.fn()} />);

    await user.type(screen.getByLabelText(/workspace name/i), 'Acme Studio');
    await user.click(screen.getByRole('button', { name: /create workspace/i }));

    expect(screen.getByRole('button', { name: /creating workspace/i })).toBeDisabled();
    expect(screen.getByLabelText(/workspace name/i)).toBeDisabled();
  });

  it('shows server validation and conflict messages', async () => {
    const user = userEvent.setup();
    createWorkspaceMock.mockResolvedValue({
      ok: false,
      kind: 'validation',
      message: 'Enter a workspace name.',
    });
    render(<CreateWorkspace onCreated={vi.fn()} onUnauthenticated={vi.fn()} />);

    await user.type(screen.getByLabelText(/workspace name/i), 'Acme Studio');
    await user.click(screen.getByRole('button', { name: /create workspace/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/enter a workspace name/i);
    expect(screen.getByRole('button', { name: /create workspace/i })).toBeEnabled();
  });

  it('reports unexpected failures generically', async () => {
    const user = userEvent.setup();
    createWorkspaceMock.mockResolvedValue({ ok: false, kind: 'failed' });
    render(<CreateWorkspace onCreated={vi.fn()} onUnauthenticated={vi.fn()} />);

    await user.type(screen.getByLabelText(/workspace name/i), 'Acme Studio');
    await user.click(screen.getByRole('button', { name: /create workspace/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/couldn't create the workspace/i);
  });

  it('follows the auth guard on 401', async () => {
    const user = userEvent.setup();
    const onCreated = vi.fn();
    const onUnauthenticated = vi.fn();
    createWorkspaceMock.mockResolvedValue({ ok: false, kind: 'unauthenticated' });
    render(<CreateWorkspace onCreated={onCreated} onUnauthenticated={onUnauthenticated} />);

    await user.type(screen.getByLabelText(/workspace name/i), 'Acme Studio');
    await user.click(screen.getByRole('button', { name: /create workspace/i }));

    expect(onUnauthenticated).toHaveBeenCalledTimes(1);
    expect(onCreated).not.toHaveBeenCalled();
  });

  it('trims the name and reports the created workspace', async () => {
    const user = userEvent.setup();
    const onCreated = vi.fn();
    createWorkspaceMock.mockResolvedValue({ ok: true, workspace: CREATED });
    render(<CreateWorkspace onCreated={onCreated} onUnauthenticated={vi.fn()} />);

    await user.type(screen.getByLabelText(/workspace name/i), '  Acme Studio  ');
    await user.click(screen.getByRole('button', { name: /create workspace/i }));

    expect(createWorkspaceMock).toHaveBeenCalledWith('http://localhost:4000', 'Acme Studio');
    expect(onCreated).toHaveBeenCalledWith(CREATED);
  });
});
