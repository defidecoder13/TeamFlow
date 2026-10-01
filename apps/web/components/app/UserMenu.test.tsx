import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { UserMenu } from './UserMenu';

const { replaceMock, signOutMock, disconnectRealtimeMock, clearCacheMock } = vi.hoisted(() => ({
  replaceMock: vi.fn(),
  signOutMock: vi.fn(),
  disconnectRealtimeMock: vi.fn(),
  clearCacheMock: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: replaceMock, refresh: vi.fn() }),
}));

vi.mock('../../lib/auth-client', () => ({
  getAuthClient: () => ({ signOut: signOutMock }),
}));

vi.mock('../../lib/realtime-client', () => ({
  disconnectRealtime: disconnectRealtimeMock,
}));

vi.mock('../../lib/attachments', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../lib/attachments')>();
  return {
    ...actual,
    clearAttachmentDownloadUrlCache: clearCacheMock,
  };
});

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
  disconnectRealtimeMock.mockReset();
  clearCacheMock.mockReset();
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
      '/app/settings',
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

  it('disconnects realtime and clears cached download URLs on sign-out', async () => {
    const user = userEvent.setup();
    signOutMock.mockResolvedValue({ data: { success: true }, error: null });
    render(<UserMenu user={USER} />);

    await user.click(screen.getByRole('button', { name: /account: ada lovelace/i }));
    await user.click(screen.getByRole('menuitem', { name: /sign out/i }));

    expect(disconnectRealtimeMock).toHaveBeenCalledTimes(1);
    expect(clearCacheMock).toHaveBeenCalledTimes(1);
  });

  it('keeps the socket connected when sign-out fails', async () => {
    const user = userEvent.setup();
    signOutMock.mockResolvedValue({ data: null, error: { code: 'FAILED' } });
    render(<UserMenu user={USER} />);

    await user.click(screen.getByRole('button', { name: /account: ada lovelace/i }));
    await user.click(screen.getByRole('menuitem', { name: /sign out/i }));

    expect(disconnectRealtimeMock).not.toHaveBeenCalled();
    expect(replaceMock).not.toHaveBeenCalled();
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
