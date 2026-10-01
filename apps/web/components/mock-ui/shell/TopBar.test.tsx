import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TopBar } from './TopBar';

const { pushMock, signOutMock } = vi.hoisted(() => ({
  pushMock: vi.fn(),
  signOutMock: vi.fn(),
}));

const USER = {
  id: 'u-1',
  name: 'Ada Lovelace',
  email: 'ada@example.com',
  image: null,
  emailVerified: true,
} as const;

vi.mock('../../../lib/mock-context', () => ({
  useApp: () => ({ setMobileSidebarOpen: vi.fn() }),
}));

vi.mock('../../../lib/shell-context', () => ({
  useShell: () => ({
    session: { status: 'authenticated' },
    currentUser: { ...USER },
    notifications: { state: { status: 'idle', items: [] } },
    signOut: signOutMock,
  }),
}));

vi.mock('../../../lib/mock-hooks/useRouter', () => ({
  useRouter: () => ({
    pathname: '/app',
    searchParams: new URLSearchParams(),
    push: pushMock,
  }),
}));

beforeEach(() => {
  pushMock.mockReset();
  signOutMock.mockReset().mockResolvedValue(undefined);
});

describe('TopBar sign-out', () => {
  async function openSignOutDialog(user: ReturnType<typeof userEvent.setup>) {
    render(<TopBar />);
    const trigger = screen.getByRole('button', { name: /ada lovelace/i });
    await user.click(trigger);
    await user.click(screen.getByRole('menuitem', { name: /sign out/i }));
    return screen.getByRole('alertdialog', { name: /sign out of teamflow/i });
  }

  it('asks for confirmation before signing out', async () => {
    const user = userEvent.setup();
    const dialog = await openSignOutDialog(user);

    expect(dialog).toBeInTheDocument();
    expect(
      screen.getByText(/returned to the home page/i),
    ).toBeInTheDocument();
    expect(signOutMock).not.toHaveBeenCalled();
  });

  it('cancels without signing out', async () => {
    const user = userEvent.setup();
    await openSignOutDialog(user);

    await user.click(screen.getByRole('button', { name: /^cancel$/i }));

    expect(signOutMock).not.toHaveBeenCalled();
    expect(screen.queryByRole('alertdialog')).toBeNull();
  });

  it('signs out once on confirm and disables the buttons while leaving', async () => {
    const user = userEvent.setup();
    signOutMock.mockReturnValue(new Promise(() => {}));
    await openSignOutDialog(user);

    const confirm = screen.getByRole('button', { name: /^sign out$/i });
    await user.click(confirm);
    // Clicking again while the request is in flight must not re-fire.
    await user.click(screen.getByRole('button', { name: /signing out/i }));

    expect(signOutMock).toHaveBeenCalledTimes(1);
  });
});
