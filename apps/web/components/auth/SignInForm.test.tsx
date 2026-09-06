import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SignInForm } from './SignInForm';

const { signInEmail } = vi.hoisted(() => ({ signInEmail: vi.fn() }));
const { replaceMock } = vi.hoisted(() => ({ replaceMock: vi.fn() }));

vi.mock('../../lib/auth-client', () => ({
  getAuthClient: () => ({ signIn: { email: signInEmail } }),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: replaceMock, refresh: vi.fn() }),
}));

beforeEach(() => {
  signInEmail.mockReset();
  replaceMock.mockReset();
});

async function fillValidForm(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText(/email/i), 'ada@example.com');
  await user.type(screen.getByLabelText(/^password/i), 'correct-password-123');
}

describe('SignInForm', () => {
  it('renders branding, fields, actions, and the sign-up link', () => {
    render(<SignInForm />);

    expect(screen.getByRole('heading', { name: /welcome back/i })).toBeInTheDocument();
    expect(screen.getByLabelText(/email/i)).toHaveAttribute('type', 'email');
    expect(screen.getByLabelText(/^password/i)).toHaveAttribute('type', 'password');
    expect(screen.getByRole('button', { name: /^sign in$/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /create an account/i })).toHaveAttribute(
      'href',
      '/sign-up',
    );
  });

  it('requires email and password before submitting', async () => {
    const user = userEvent.setup();
    render(<SignInForm />);

    await user.click(screen.getByRole('button', { name: /^sign in$/i }));

    expect(await screen.findByText(/enter your email address/i)).toBeInTheDocument();
    expect(screen.getByText(/enter your password/i)).toBeInTheDocument();
    expect(signInEmail).not.toHaveBeenCalled();
  });

  it('toggles password visibility without submitting', async () => {
    const user = userEvent.setup();
    render(<SignInForm />);

    const password = screen.getByLabelText(/^password/i);
    expect(password).toHaveAttribute('type', 'password');

    await user.click(screen.getByRole('button', { name: /show password/i }));
    expect(password).toHaveAttribute('type', 'text');

    await user.click(screen.getByRole('button', { name: /hide password/i }));
    expect(password).toHaveAttribute('type', 'password');
    expect(signInEmail).not.toHaveBeenCalled();
  });

  it('rejects an invalid email without calling the API', async () => {
    const user = userEvent.setup();
    render(<SignInForm />);

    await user.type(screen.getByLabelText(/email/i), 'not-an-email');
    await user.type(screen.getByLabelText(/^password/i), 'correct-password-123');
    await user.click(screen.getByRole('button', { name: /^sign in$/i }));

    expect(await screen.findByText(/enter a valid email address/i)).toBeInTheDocument();
    expect(signInEmail).not.toHaveBeenCalled();
  });

  it('disables submission while the request is in flight', async () => {
    const user = userEvent.setup();
    signInEmail.mockReturnValue(new Promise(() => {}));
    render(<SignInForm />);

    await fillValidForm(user);
    await user.click(screen.getByRole('button', { name: /^sign in$/i }));

    expect(screen.getByRole('button', { name: /signing in/i })).toBeDisabled();
  });

  it('displays a safe message for invalid credentials', async () => {
    const user = userEvent.setup();
    signInEmail.mockResolvedValue({ data: null, error: { code: 'INVALID_EMAIL_OR_PASSWORD' } });
    render(<SignInForm />);

    await fillValidForm(user);
    await user.click(screen.getByRole('button', { name: /^sign in$/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/incorrect email or password/i);
    expect(screen.getByRole('button', { name: /^sign in$/i })).toBeEnabled();
  });

  it('redirects to /app after signing in', async () => {
    const user = userEvent.setup();
    signInEmail.mockResolvedValue({
      data: { user: { email: 'ada@example.com' } },
      error: null,
    });
    render(<SignInForm />);

    await fillValidForm(user);
    await user.click(screen.getByRole('button', { name: /^sign in$/i }));

    await waitFor(() => {
      expect(replaceMock).toHaveBeenCalledWith('/app');
    });
  });

  it('honors a validated return destination after signing in', async () => {
    const user = userEvent.setup();
    signInEmail.mockResolvedValue({
      data: { user: { email: 'ada@example.com' } },
      error: null,
    });
    render(<SignInForm returnTo="/invite/accept?token=abc123" />);

    await fillValidForm(user);
    await user.click(screen.getByRole('button', { name: /^sign in$/i }));

    await waitFor(() => {
      expect(replaceMock).toHaveBeenCalledWith('/invite/accept?token=abc123');
    });
  });
});
