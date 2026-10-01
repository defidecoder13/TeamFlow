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
    expect(screen.getByLabelText(/email/i)).toHaveAttribute('autocomplete', 'email');
    expect(screen.getByLabelText(/^password/i)).toHaveAttribute(
      'autocomplete',
      'current-password',
    );
    expect(screen.getByRole('button', { name: /^sign in$/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /create an account/i })).toHaveAttribute(
      'href',
      '/sign-up',
    );
  });

  it('submits when Enter is pressed in a field', async () => {
    const user = userEvent.setup();
    signInEmail.mockResolvedValue({
      data: { user: { email: 'ada@example.com' } },
      error: null,
    });
    render(<SignInForm />);

    await fillValidForm(user);
    await user.keyboard('{Enter}');

    await waitFor(() => {
      expect(replaceMock).toHaveBeenCalledWith('/app');
    });
    expect(signInEmail).toHaveBeenCalledTimes(1);
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

  it('accepts a non-empty password of any length (length policy is sign-up only)', async () => {
    const user = userEvent.setup();
    signInEmail.mockResolvedValue({
      data: { user: { email: 'ada@example.com' } },
      error: null,
    });
    render(<SignInForm />);

    await user.type(screen.getByLabelText(/email/i), 'ada@example.com');
    await user.type(screen.getByLabelText(/^password/i), 'x');
    await user.click(screen.getByRole('button', { name: /^sign in$/i }));

    await waitFor(() => {
      expect(signInEmail).toHaveBeenCalledWith({
        email: 'ada@example.com',
        password: 'x',
      });
    });
    expect(screen.queryByText(/at least 8 characters/i)).not.toBeInTheDocument();
  });

  it('disables submission while the request is in flight', async () => {
    const user = userEvent.setup();
    signInEmail.mockReturnValue(new Promise(() => {}));
    render(<SignInForm />);

    await fillValidForm(user);
    await user.click(screen.getByRole('button', { name: /^sign in$/i }));

    expect(screen.getByRole('button', { name: /signing in/i })).toBeDisabled();
    expect(screen.getByLabelText(/email/i)).toBeDisabled();
    expect(screen.getByLabelText(/^password/i)).toBeDisabled();
  });

  it('prevents duplicate submission from rapid repeated clicks', async () => {
    const user = userEvent.setup();
    signInEmail.mockReturnValue(new Promise(() => {}));
    render(<SignInForm />);

    await fillValidForm(user);
    const button = screen.getByRole('button', { name: /^sign in$/i });
    await user.click(button);
    await user.click(button);
    await user.click(button);

    expect(signInEmail).toHaveBeenCalledTimes(1);
  });

  it('displays a safe message for invalid credentials', async () => {
    const user = userEvent.setup();
    signInEmail.mockResolvedValue({ data: null, error: { code: 'INVALID_EMAIL_OR_PASSWORD' } });
    render(<SignInForm />);

    await fillValidForm(user);
    await user.click(screen.getByRole('button', { name: /^sign in$/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/incorrect email or password/i);
    expect(screen.getByRole('button', { name: /^sign in$/i })).toBeEnabled();
    expect(replaceMock).not.toHaveBeenCalled();
  });

  it('shows a safe fallback when the network request fails', async () => {
    const user = userEvent.setup();
    signInEmail.mockRejectedValue(new Error('ECONNREFUSED secret-hostname'));
    render(<SignInForm />);

    await fillValidForm(user);
    await user.click(screen.getByRole('button', { name: /^sign in$/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      /could not sign you in\. please try again/i,
    );
    expect(screen.getByRole('alert')).not.toHaveTextContent(/ECONNREFUSED/);
    expect(screen.getByRole('button', { name: /^sign in$/i })).toBeEnabled();
    expect(replaceMock).not.toHaveBeenCalled();
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
    render(<SignInForm returnTo="/app/channels/general" />);

    await fillValidForm(user);
    await user.click(screen.getByRole('button', { name: /^sign in$/i }));

    await waitFor(() => {
      expect(replaceMock).toHaveBeenCalledWith('/app/channels/general');
    });
  });

  it('honors a safe ?next= with a query string', async () => {
    const user = userEvent.setup();
    signInEmail.mockResolvedValue({
      data: { user: { email: 'ada@example.com' } },
      error: null,
    });
    render(<SignInForm returnTo="/app/search?q=hello" />);

    await fillValidForm(user);
    await user.click(screen.getByRole('button', { name: /^sign in$/i }));

    await waitFor(() => {
      expect(replaceMock).toHaveBeenCalledWith('/app/search?q=hello');
    });
  });

  it('falls back to /app when returnTo is an unsafe external redirect', async () => {
    const user = userEvent.setup();
    signInEmail.mockResolvedValue({
      data: { user: { email: 'ada@example.com' } },
      error: null,
    });
    render(<SignInForm returnTo="https://malicious-site.example/steal" />);

    await fillValidForm(user);
    await user.click(screen.getByRole('button', { name: /^sign in$/i }));

    await waitFor(() => {
      expect(replaceMock).toHaveBeenCalledWith('/app');
    });
    expect(replaceMock).not.toHaveBeenCalledWith('https://malicious-site.example/steal');
  });

  it('falls back to /app for protocol-relative unsafe destinations', async () => {
    const user = userEvent.setup();
    signInEmail.mockResolvedValue({
      data: { user: { email: 'ada@example.com' } },
      error: null,
    });
    render(<SignInForm returnTo="//evil.example/phish" />);

    await fillValidForm(user);
    await user.click(screen.getByRole('button', { name: /^sign in$/i }));

    await waitFor(() => {
      expect(replaceMock).toHaveBeenCalledWith('/app');
    });
  });

  it('renders the account-created notice when provided', () => {
    render(<SignInForm notice="Account created — sign in to continue." />);

    expect(screen.getByRole('status')).toHaveTextContent(/account created/i);
  });

  it('keeps the form usable at narrow widths (full-bleed container, full-width form)', () => {
    const { container } = render(<SignInForm />);
    const root = container.firstElementChild as HTMLElement;

    expect(root).toHaveClass('w-full');
    expect(root).toHaveClass('min-w-0');
    const form = container.querySelector('form');
    expect(form).not.toBeNull();
    expect(form).toHaveClass('space-y-5');
    const submit = screen.getByRole('button', { name: /^sign in$/i });
    expect(submit).toHaveClass('w-full');
  });
});
