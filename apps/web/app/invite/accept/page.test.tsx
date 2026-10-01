import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getSafeReturnTo } from '../../../lib/auth-guard';
import type { SessionState } from '../../../lib/use-session-user';
import AcceptInvitationPage from './page';

const { acceptInvitationMock, sessionState, searchParamsState, refreshMock } = vi.hoisted(
  () => ({
    acceptInvitationMock: vi.fn(),
    sessionState: { value: { status: 'loading' } as SessionState },
    searchParamsState: { value: 'token=test-token-value' },
    refreshMock: vi.fn(),
  }),
);

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: vi.fn(), refresh: vi.fn() }),
  useSearchParams: () => new URLSearchParams(searchParamsState.value),
  usePathname: () => '/invite/accept',
}));

vi.mock('../../../lib/use-session-user', () => ({
  useSessionUser: () => ({
    refresh: refreshMock,
    setUser: vi.fn(),
    ...sessionState.value,
  }),
}));

vi.mock('../../../lib/invitations', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../lib/invitations')>()),
  acceptInvitation: acceptInvitationMock,
}));

const USER = {
  id: 'u-9',
  name: 'Newbie User',
  email: 'newbie@example.com',
  image: null,
  emailVerified: false,
};

beforeEach(() => {
  acceptInvitationMock.mockReset();
  refreshMock.mockReset();
  sessionState.value = { status: 'loading' };
  searchParamsState.value = 'token=test-token-value';
  vi.stubEnv('NEXT_PUBLIC_API_URL', 'http://localhost:4000');
});

describe('/invite/accept', () => {
  it('renders a loading state while the session resolves', () => {
    render(<AcceptInvitationPage />);

    expect(screen.getByRole('status')).toBeInTheDocument();
  });

  it('directs unauthenticated visitors through sign-in with the token preserved', () => {
    sessionState.value = { status: 'unauthenticated' };
    render(<AcceptInvitationPage />);

    const link = screen.getByRole('link', { name: /sign in to accept/i });
    expect(link.getAttribute('href')).toContain('/sign-in?next=');
    expect(link.getAttribute('href')).toContain(encodeURIComponent('test-token-value'));
  });

  it('accepts and navigates to the workspace', async () => {
    const user = userEvent.setup();
    sessionState.value = { status: 'authenticated', user: USER };
    acceptInvitationMock.mockResolvedValue({
      ok: true,
      workspace: { id: 'ws-1', name: 'Real Workspace', slug: 'real-workspace' },
      alreadyMember: false,
    });
    render(<AcceptInvitationPage />);

    await user.click(screen.getByRole('button', { name: /accept invitation/i }));

    expect(acceptInvitationMock).toHaveBeenCalledWith('http://localhost:4000', 'test-token-value');
    expect(await screen.findByText(/real workspace/i)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /open workspace/i })).toHaveAttribute('href', '/app');
  });

  it('explains invalid and wrong-user failures safely', async () => {
    const user = userEvent.setup();
    sessionState.value = { status: 'authenticated', user: USER };
    acceptInvitationMock.mockResolvedValue({ ok: false, kind: 'invalid' });
    render(<AcceptInvitationPage />);

    await user.click(screen.getByRole('button', { name: /accept invitation/i }));
    expect(await screen.findByText(/invalid or has expired/i)).toBeInTheDocument();
  });

  it('shows the wrong-account message with the session email', async () => {
    const user = userEvent.setup();
    sessionState.value = { status: 'authenticated', user: USER };
    acceptInvitationMock.mockResolvedValue({
      ok: false,
      kind: 'forbidden',
      message: 'This invitation was sent to a different email address.',
    });
    render(<AcceptInvitationPage />);

    await user.click(screen.getByRole('button', { name: /accept invitation/i }));

    expect(await screen.findByText(/wrong account/i)).toBeInTheDocument();
    expect(screen.getByText(/newbie@example.com/i)).toBeInTheDocument();
  });

  it('explains a missing token without calling the API', async () => {
    searchParamsState.value = '';
    render(<AcceptInvitationPage />);

    expect(await screen.findByText(/missing its token/i)).toBeInTheDocument();
    expect(acceptInvitationMock).not.toHaveBeenCalled();
  });

  it('prevents duplicate submission while accepting', async () => {
    const user = userEvent.setup();
    sessionState.value = { status: 'authenticated', user: USER };
    acceptInvitationMock.mockReturnValue(new Promise(() => {}));
    render(<AcceptInvitationPage />);

    const button = screen.getByRole('button', { name: /accept invitation/i });
    await user.click(button);
    expect(await screen.findByRole('button', { name: /accepting/i })).toBeDisabled();
    await user.click(screen.getByRole('button', { name: /accepting/i }));

    expect(acceptInvitationMock).toHaveBeenCalledTimes(1);
  });

  it('offers a retry after failure that returns to the idle action', async () => {
    const user = userEvent.setup();
    sessionState.value = { status: 'authenticated', user: USER };
    acceptInvitationMock.mockResolvedValue({ ok: false, kind: 'failed' });
    render(<AcceptInvitationPage />);

    await user.click(screen.getByRole('button', { name: /accept invitation/i }));

    expect(await screen.findByText(/couldn’t accept the invitation/i)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /try again/i }));

    expect(await screen.findByRole('button', { name: /accept invitation/i })).toBeInTheDocument();
    expect(acceptInvitationMock).toHaveBeenCalledTimes(1);
  });

  it('re-checks the session when accept reports unauthenticated, then offers sign-in', async () => {
    const user = userEvent.setup();
    sessionState.value = { status: 'authenticated', user: USER };
    acceptInvitationMock.mockResolvedValue({ ok: false, kind: 'unauthenticated' });
    const { rerender } = render(<AcceptInvitationPage />);

    await user.click(screen.getByRole('button', { name: /accept invitation/i }));

    expect(refreshMock).toHaveBeenCalledTimes(1);
    sessionState.value = { status: 'unauthenticated' };
    rerender(<AcceptInvitationPage />);
    expect(screen.getByRole('link', { name: /sign in to accept/i })).toBeInTheDocument();
  });

  it('encodes a next destination that round-trips through the safe-redirect guard', () => {
    sessionState.value = { status: 'unauthenticated' };
    render(<AcceptInvitationPage />);

    const href = screen
      .getByRole('link', { name: /sign in to accept/i })
      .getAttribute('href') as string;
    const url = new URL(href, 'http://localhost:3000');
    expect(url.pathname).toBe('/sign-in');
    expect(getSafeReturnTo(url.searchParams.get('next'))).toBe(
      '/invite/accept?token=test-token-value',
    );
  });
});
