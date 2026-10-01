import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SessionState } from '../../lib/use-session-user';
import type { WorkspaceSummary } from '../../lib/workspaces';
import { SettingsWorkspaceView } from './SettingsWorkspaceView';

const {
  shellRef,
  appRef,
  showToastMock,
  getApiBaseUrlMock,
  updateWorkspaceMock,
  deleteWorkspaceMock,
  updateStoreMock,
  removeStoreMock,
  pushMock,
} = vi.hoisted(() => ({
  shellRef: { value: {} as Record<string, unknown> },
  appRef: { value: {} as Record<string, unknown> },
  showToastMock: vi.fn(),
  getApiBaseUrlMock: vi.fn(() => 'http://localhost:4000'),
  updateWorkspaceMock: vi.fn(),
  deleteWorkspaceMock: vi.fn(),
  updateStoreMock: vi.fn(),
  removeStoreMock: vi.fn(),
  pushMock: vi.fn(),
}));

vi.mock('../../lib/config', () => ({
  getApiBaseUrl: getApiBaseUrlMock,
}));

vi.mock('../../lib/workspaces', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../lib/workspaces')>()),
  updateWorkspace: updateWorkspaceMock,
  deleteWorkspace: deleteWorkspaceMock,
}));

vi.mock('../../lib/mock-context', () => ({
  useApp: () => appRef.value,
}));

vi.mock('../../lib/shell-context', () => ({
  useShell: () => shellRef.value,
}));

vi.mock('../../lib/mock-hooks/useRouter', () => ({
  useRouter: () => ({ push: pushMock, pathname: '/app/settings/workspace' }),
}));

const WORKSPACE: WorkspaceSummary = {
  id: 'ws-1',
  name: 'Acme Flow',
  slug: 'acme-flow',
  role: 'OWNER',
  createdAt: '2026-09-01T00:00:00.000Z',
  updatedAt: '2026-09-01T00:00:00.000Z',
};

function setShell(
  overrides: Record<string, unknown> = {},
  workspace: WorkspaceSummary | null = WORKSPACE,
  sessionStatus: SessionState['status'] = 'authenticated',
) {
  shellRef.value = {
    session: { status: sessionStatus } as SessionState,
    currentWorkspace: workspace,
    workspaces: {
      updateWorkspace: updateStoreMock,
      removeWorkspace: removeStoreMock,
      state: { status: 'ready', workspaces: workspace ? [workspace] : [], current: workspace },
      retry: vi.fn(),
      addWorkspace: vi.fn(),
      setCurrentWorkspace: vi.fn(),
      resyncWorkspaces: vi.fn(),
    },
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  appRef.value = { showToast: showToastMock };
  updateWorkspaceMock.mockReset();
  deleteWorkspaceMock.mockReset();
  setShell();
});

describe('SettingsWorkspaceView', () => {
  it('shows a loading state until the session resolves', () => {
    setShell({}, WORKSPACE, 'loading');
    render(<SettingsWorkspaceView />);
    expect(
      screen.getByRole('status', { name: /loading workspace settings/i }),
    ).toBeInTheDocument();
    expect(screen.queryByLabelText(/workspace name/i)).not.toBeInTheDocument();
  });

  it('shows an unauthenticated message when there is no session user', async () => {
    const user = userEvent.setup();
    setShell({}, WORKSPACE, 'unauthenticated');
    render(<SettingsWorkspaceView />);
    expect(screen.getByRole('status')).toHaveTextContent(/please sign in/i);

    await user.click(screen.getByRole('button', { name: /go to sign in/i }));
    expect(pushMock).toHaveBeenCalledWith('/sign-in');
  });

  it('shows a prompt when no workspace is selected', () => {
    setShell({}, null, 'authenticated');
    render(<SettingsWorkspaceView />);
    expect(screen.getByRole('status')).toHaveTextContent(/select a workspace/i);
  });

  it('renders real workspace name, slug, and avatar initial from the shell', () => {
    render(<SettingsWorkspaceView />);

    expect(screen.getByDisplayValue('Acme Flow')).toBeInTheDocument();
    expect(screen.getAllByText('acme-flow').length).toBeGreaterThan(0);
    expect(screen.getByRole('heading', { name: 'Workspace settings' })).toBeInTheDocument();
    // Avatar tile derived from name
    expect(screen.getByText('A')).toBeInTheDocument();
  });

  it('does not render mock-only fields (plan edition, fake teamflow.io domain)', () => {
    render(<SettingsWorkspaceView />);

    expect(screen.queryByText(/enterprise edition/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/pro edition/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/teamflow\.io/i)).not.toBeInTheDocument();
    expect(screen.queryByDisplayValue(/teamflow\.io/)).not.toBeInTheDocument();
  });

  it('validates empty name before calling the API', async () => {
    render(<SettingsWorkspaceView />);
    await userEvent.clear(screen.getByLabelText(/workspace name/i));
    await userEvent.click(screen.getByRole('button', { name: /save changes/i }));

    expect(await screen.findByText(/workspace name is required/i)).toBeInTheDocument();
    expect(updateWorkspaceMock).not.toHaveBeenCalled();
  });

  it('renames via PATCH /api/workspaces/:id and updates the store', async () => {
    const renamed: WorkspaceSummary = { ...WORKSPACE, name: 'Acme Flow Inc' };
    updateWorkspaceMock.mockResolvedValue({ ok: true, workspace: renamed });

    render(<SettingsWorkspaceView />);
    await userEvent.clear(screen.getByLabelText(/workspace name/i));
    await userEvent.type(screen.getByLabelText(/workspace name/i), 'Acme Flow Inc');
    await userEvent.click(screen.getByRole('button', { name: /save changes/i }));

    await waitFor(() => {
      expect(updateWorkspaceMock).toHaveBeenCalledWith(
        'http://localhost:4000',
        'ws-1',
        'Acme Flow Inc',
      );
    });
    expect(updateStoreMock).toHaveBeenCalledWith(renamed);
    expect(await screen.findByText(/workspace name updated/i)).toBeInTheDocument();
    expect(showToastMock).toHaveBeenCalledWith(
      'Workspace renamed successfully.',
      'success',
    );
  });

  it('does not call the API when the name is unchanged', async () => {
    render(<SettingsWorkspaceView />);
    await userEvent.click(screen.getByRole('button', { name: /save changes/i }));

    expect(await screen.findByText(/workspace name updated/i)).toBeInTheDocument();
    expect(updateWorkspaceMock).not.toHaveBeenCalled();
  });

  it('surfaces API validation errors without updating the store', async () => {
    updateWorkspaceMock.mockResolvedValue({
      ok: false,
      kind: 'validation',
      message: 'Use 100 characters or fewer.',
    });

    render(<SettingsWorkspaceView />);
    await userEvent.clear(screen.getByLabelText(/workspace name/i));
    await userEvent.type(screen.getByLabelText(/workspace name/i), 'X'.repeat(101));
    await userEvent.click(screen.getByRole('button', { name: /save changes/i }));

    expect(await screen.findByText(/use 100 characters or fewer/i)).toBeInTheDocument();
    expect(updateStoreMock).not.toHaveBeenCalled();
    expect(showToastMock).not.toHaveBeenCalled();
  });

  it('disables rename and shows permission hint for MEMBER role', () => {
    setShell({}, { ...WORKSPACE, role: 'MEMBER' });
    render(<SettingsWorkspaceView />);

    expect(screen.getByLabelText(/workspace name/i)).toBeDisabled();
    expect(screen.getByRole('button', { name: /save changes/i })).toBeDisabled();
    expect(
      screen.getByText(/only owners and admins can rename/i),
    ).toBeInTheDocument();
    // No delete button for non-owner
    expect(
      screen.queryByRole('button', { name: /delete workspace/i }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByText(/only the workspace owner can delete/i),
    ).toBeInTheDocument();
  });

  it('allows ADMIN to rename but not delete', () => {
    setShell({}, { ...WORKSPACE, role: 'ADMIN' });
    render(<SettingsWorkspaceView />);

    expect(screen.getByLabelText(/workspace name/i)).toBeEnabled();
    expect(
      screen.getByRole('button', { name: /save changes/i }),
    ).toBeEnabled();
    expect(
      screen.queryByRole('button', { name: /^delete workspace$/i }),
    ).not.toBeInTheDocument();
  });

  it('requires type-to-confirm before deleting', async () => {
    render(<SettingsWorkspaceView />);

    await userEvent.click(screen.getByRole('button', { name: /^delete workspace$/i }));
    expect(
      await screen.findByRole('heading', { name: /delete acme flow/i }),
    ).toBeInTheDocument();

    await userEvent.type(screen.getByLabelText(/confirmation/i), 'Wrong Name');
    await userEvent.click(
      screen.getByRole('button', { name: /delete acme flow/i }),
    );

    expect(
      await screen.findByText(/please type "Acme Flow" to confirm/i),
    ).toBeInTheDocument();
    expect(deleteWorkspaceMock).not.toHaveBeenCalled();
  });

  it('deletes via DELETE, removes from store, and navigates to /app', async () => {
    deleteWorkspaceMock.mockResolvedValue({ ok: true });

    render(<SettingsWorkspaceView />);
    await userEvent.click(screen.getByRole('button', { name: /^delete workspace$/i }));
    await userEvent.type(screen.getByLabelText(/confirmation/i), 'Acme Flow');
    await userEvent.click(
      screen.getByRole('button', { name: /delete acme flow/i }),
    );

    await waitFor(() => {
      expect(deleteWorkspaceMock).toHaveBeenCalledWith(
        'http://localhost:4000',
        'ws-1',
      );
    });
    expect(removeStoreMock).toHaveBeenCalledWith('ws-1');
    expect(pushMock).toHaveBeenCalledWith('/app');
    expect(showToastMock).toHaveBeenCalledWith(
      'Deleted Acme Flow',
      'success',
    );
  });

  it('treats notFound on delete as already gone and still navigates', async () => {
    deleteWorkspaceMock.mockResolvedValue({ ok: false, kind: 'notFound' });

    render(<SettingsWorkspaceView />);
    await userEvent.click(screen.getByRole('button', { name: /^delete workspace$/i }));
    await userEvent.type(screen.getByLabelText(/confirmation/i), 'Acme Flow');
    await userEvent.click(
      screen.getByRole('button', { name: /delete acme flow/i }),
    );

    await waitFor(() => {
      expect(removeStoreMock).toHaveBeenCalledWith('ws-1');
      expect(pushMock).toHaveBeenCalledWith('/app');
    });
  });

  it('surfaces forbidden delete errors without navigating', async () => {
    deleteWorkspaceMock.mockResolvedValue({ ok: false, kind: 'forbidden' });

    render(<SettingsWorkspaceView />);
    await userEvent.click(screen.getByRole('button', { name: /^delete workspace$/i }));
    await userEvent.type(screen.getByLabelText(/confirmation/i), 'Acme Flow');
    await userEvent.click(
      screen.getByRole('button', { name: /delete acme flow/i }),
    );

    expect(
      await screen.findByText(/you do not have permission to delete/i),
    ).toBeInTheDocument();
    expect(removeStoreMock).not.toHaveBeenCalled();
    expect(pushMock).not.toHaveBeenCalled();
  });

  it('disables the delete submit while the request is in flight', async () => {
    let resolveDelete: (v: unknown) => void = () => {};
    deleteWorkspaceMock.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveDelete = resolve;
        }),
    );

    render(<SettingsWorkspaceView />);
    await userEvent.click(screen.getByRole('button', { name: /^delete workspace$/i }));
    await userEvent.type(screen.getByLabelText(/confirmation/i), 'Acme Flow');
    await userEvent.click(
      screen.getByRole('button', { name: /delete acme flow/i }),
    );

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /deleting/i })).toBeDisabled();
    });

    resolveDelete({ ok: true });
    await waitFor(() => {
      expect(pushMock).toHaveBeenCalledWith('/app');
    });
  });
});
