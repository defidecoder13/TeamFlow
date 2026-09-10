import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { UserMenu } from './UserMenu';

const { replaceMock, signOutMock } = vi.hoisted(() => ({
  replaceMock: vi.fn(),
  signOutMock: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: replaceMock, refresh: vi.fn() }),
}));

vi.mock('../../lib/auth-client', () => ({
  getAuthClient: () => ({ signOut: signOutMock }),
}));

const USER = {
  id: 'user-1',
  name: 'Ada Lovelace',
  email: 'ada@example.com',
  image: null,
  emailVerified: true,
};

beforeEach(() => {
  replaceMock.mockReset();
  signOutMock.mockReset();
});

describe('UserMenu', () => {
  it('shows the real name and email, with profile enabled', async () => {
    const user = userEvent.setup();
    render(<UserMenu user={USER} />);

    await user.click(screen.getByRole('button', { name: /account: ada lovelace/i }));

    expect(screen.getByText('Ada Lovelace')).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: /profile/i })).toHaveAttribute(
      'href',
      '/app/settings/profile',
    );
    expect(screen.getByRole('menuitem', { name: /settings/i })).toHaveAttribute(
      'href',
      '/app/settings/notifications',
    );
  });

  it('signs out through Better Auth and returns to sign-in', async () => {
    const user = userEvent.setup();
    signOutMock.mockResolvedValue({ data: { success: true }, error: null });
    render(<UserMenu user={USER} />);

    await user.click(screen.getByRole('button', { name: /account: ada lovelace/i }));
    await user.click(screen.getByRole('menuitem', { name: /sign out/i }));

    expect(signOutMock).toHaveBeenCalledTimes(1);
    expect(replaceMock).toHaveBeenCalledWith('/sign-in');
  });

  it('reports sign-out failures safely', async () => {
    const user = userEvent.setup();
    signOutMock.mockResolvedValue({ data: null, error: { code: 'FAILED_TO_UPDATE_USER' } });
    render(<UserMenu user={USER} />);

    await user.click(screen.getByRole('button', { name: /account: ada lovelace/i }));
    await user.click(screen.getByRole('menuitem', { name: /sign out/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/could not sign you out/i);
    expect(replaceMock).not.toHaveBeenCalled();
  });
});
