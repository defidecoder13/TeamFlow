/**
 * TopBar search integration tests (Phase 4G.4): the search control links to
 * /app/search and the ⌘K/Ctrl+K shortcut navigates except from text inputs.
 */
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TopBar } from './TopBar';

const { pushMock } = vi.hoisted(() => ({ pushMock: vi.fn() }));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: pushMock, replace: vi.fn(), refresh: vi.fn() }),
}));

vi.mock('../../lib/auth-client', () => ({
  getAuthClient: () => ({ signOut: vi.fn() }),
}));

const USER = {
  id: 'u-1',
  name: 'Ada Lovelace',
  email: 'ada@example.com',
  image: null,
  emailVerified: true,
};

function renderBar() {
  render(<TopBar user={USER} workspaceName="Real Workspace" location="Search" />);
}

beforeEach(() => {
  pushMock.mockReset();
});

describe('TopBar search', () => {
  it('links to the search page with an accessible name', () => {
    renderBar();
    const link = screen.getByRole('link', { name: 'Search' });
    expect(link).toHaveAttribute('href', '/app/search');
  });

  it('navigates on ⌘K except from text inputs', () => {
    renderBar();
    fireEvent.keyDown(window, { key: 'k', metaKey: true });
    expect(pushMock).toHaveBeenCalledWith('/app/search');

    pushMock.mockReset();
    const input = document.createElement('input');
    document.body.appendChild(input);
    fireEvent.keyDown(input, { key: 'k', metaKey: true });
    expect(pushMock).not.toHaveBeenCalled();
    input.remove();

    fireEvent.keyDown(window, { key: 'k', ctrlKey: true });
    expect(pushMock).toHaveBeenCalledWith('/app/search');
  });

  it('renders the notification bell and disables it when workspace is missing', () => {
    renderBar();
    const bell = screen.getByRole('button', { name: 'Notifications' });
    expect(bell).toBeInTheDocument();
    expect(bell).toBeDisabled();
  });

  it('renders the notification bell as enabled when workspaceId is provided', () => {
    render(
      <TopBar user={USER} workspaceName="Real Workspace" workspaceId="ws-1" location="Search" />,
    );
    const bell = screen.getByRole('button', { name: 'Notifications' });
    expect(bell).toBeInTheDocument();
    expect(bell).not.toBeDisabled();
    expect(bell).toHaveAttribute('aria-haspopup', 'dialog');
    expect(bell).toHaveAttribute('aria-expanded', 'false');
  });
});
