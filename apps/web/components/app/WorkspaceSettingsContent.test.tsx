import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { WorkspaceSettingsContent } from './WorkspaceSettingsContent';

const { updateWorkspaceMock, deleteWorkspaceMock } = vi.hoisted(() => ({
  updateWorkspaceMock: vi.fn(),
  deleteWorkspaceMock: vi.fn(),
}));
vi.mock('../../lib/workspaces', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../lib/workspaces')>()),
  updateWorkspace: updateWorkspaceMock,
  deleteWorkspace: deleteWorkspaceMock,
}));

const WS = { id: 'ws1', name: 'Acme Studio', slug: 'acme-studio' };

function renderContent(role: 'OWNER' | 'ADMIN' | 'MEMBER' = 'OWNER') {
  return render(
    <WorkspaceSettingsContent
      workspace={WS}
      currentUserRole={role}
      onRenamed={vi.fn()}
      onDeleted={vi.fn()}
      onUnauthenticated={vi.fn()}
    />,
  );
}

beforeEach(() => {
  updateWorkspaceMock.mockReset();
  deleteWorkspaceMock.mockReset();
  vi.stubEnv('NEXT_PUBLIC_API_URL', 'http://localhost:4000');
});

describe('WorkspaceSettingsContent', () => {
  it('shows slug read-only and rename disabled for MEMBER', () => {
    renderContent('MEMBER');
    expect(screen.getByDisplayValue('acme-studio')).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'Workspace name' })).toBeDisabled();
    expect(screen.getByText(/only owners and admins can rename/i)).toBeInTheDocument();
    expect(screen.getByText(/only the workspace owner can delete/i)).toBeInTheDocument();
  });

  it('allows OWNER to rename', async () => {
    const user = userEvent.setup();
    const onRenamed = vi.fn();
    updateWorkspaceMock.mockResolvedValue({
      ok: true,
      workspace: {
        ...WS,
        name: 'New',
        slug: 'acme-studio',
        role: 'OWNER',
        createdAt: '',
        updatedAt: '',
      },
    });
    render(
      <WorkspaceSettingsContent
        workspace={WS}
        currentUserRole="OWNER"
        onRenamed={onRenamed}
        onDeleted={vi.fn()}
        onUnauthenticated={vi.fn()}
      />,
    );
    const input = screen.getByRole('textbox', { name: 'Workspace name' });
    await user.clear(input);
    await user.type(input, 'New');
    await user.click(screen.getByRole('button', { name: /save changes/i }));
    expect(updateWorkspaceMock).toHaveBeenCalledWith('http://localhost:4000', 'ws1', 'New');
  });

  it('requires exact name to enable delete', async () => {
    const user = userEvent.setup();
    renderContent('OWNER');
    const deleteBtn = screen.getByRole('button', { name: /delete workspace/i });
    expect(deleteBtn).toBeDisabled();
    const input = screen.getByLabelText(/type.*to confirm/i);
    await user.type(input, 'Wrong');
    expect(deleteBtn).toBeDisabled();
    await user.clear(input);
    await user.type(input, 'Acme Studio');
    expect(deleteBtn).toBeEnabled();
  });

  it('shows slug unchanged notice', () => {
    renderContent('OWNER');
    expect(screen.getByText(/slug stays/i)).toBeInTheDocument();
    expect(screen.getByText(/renaming does not change/i)).toBeInTheDocument();
  });

  it('handles delete success via onDeleted', async () => {
    const user = userEvent.setup();
    const onDeleted = vi.fn();
    deleteWorkspaceMock.mockResolvedValue({ ok: true });
    render(
      <WorkspaceSettingsContent
        workspace={WS}
        currentUserRole="OWNER"
        onRenamed={vi.fn()}
        onDeleted={onDeleted}
        onUnauthenticated={vi.fn()}
      />,
    );
    await user.type(screen.getByLabelText(/type.*to confirm/i), 'Acme Studio');
    await user.click(screen.getByRole('button', { name: /delete workspace/i }));
    expect(deleteWorkspaceMock).toHaveBeenCalled();
  });
});
