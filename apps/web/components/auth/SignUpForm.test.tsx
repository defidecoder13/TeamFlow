import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SignUpForm } from './SignUpForm';

const { signUpEmail } = vi.hoisted(() => ({ signUpEmail: vi.fn() }));

vi.mock('../../lib/auth-client', () => ({
  getAuthClient: () => ({ signUp: { email: signUpEmail } }),
}));

beforeEach(() => {
  signUpEmail.mockReset();
});

async function fillValidForm(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText(/name/i), 'Ada Lovelace');
  await user.type(screen.getByLabelText(/email/i), 'ada@example.com');
  await user.type(screen.getByLabelText(/^password$/i), 'correct-password-123');
  await user.type(screen.getByLabelText(/confirm password/i), 'correct-password-123');
}

describe('SignUpForm', () => {
  it('renders all fields, actions, and the sign-in link', () => {
    render(<SignUpForm />);

    expect(screen.getByRole('heading', { name: /create your account/i })).toBeInTheDocument();
    expect(screen.getByLabelText(/name/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/email/i)).toHaveAttribute('type', 'email');
    expect(screen.getByLabelText(/^password$/i)).toHaveAttribute('type', 'password');
    expect(screen.getByLabelText(/confirm password/i)).toHaveAttribute('type', 'password');
    expect(screen.getByRole('button', { name: /create account/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /sign in/i })).toHaveAttribute('href', '/sign-in');
  });

  it('requires every field before submitting', async () => {
    const user = userEvent.setup();
    render(<SignUpForm />);

    await user.click(screen.getByRole('button', { name: /create account/i }));

    expect(await screen.findByText(/enter your name/i)).toBeInTheDocument();
    expect(screen.getByText(/enter your email address/i)).toBeInTheDocument();
    expect(screen.getByText(/enter your password/i)).toBeInTheDocument();
    expect(screen.getByText(/confirm your password/i)).toBeInTheDocument();
    expect(signUpEmail).not.toHaveBeenCalled();
  });

  it('rejects mismatched password confirmation', async () => {
    const user = userEvent.setup();
    render(<SignUpForm />);

    await user.type(screen.getByLabelText(/name/i), 'Ada Lovelace');
    await user.type(screen.getByLabelText(/email/i), 'ada@example.com');
    await user.type(screen.getByLabelText(/^password$/i), 'correct-password-123');
    await user.type(screen.getByLabelText(/confirm password/i), 'different-password');
    await user.click(screen.getByRole('button', { name: /create account/i }));

    expect(await screen.findByText(/passwords do not match/i)).toBeInTheDocument();
    expect(signUpEmail).not.toHaveBeenCalled();
  });

  it('disables submission while the request is in flight', async () => {
    const user = userEvent.setup();
    signUpEmail.mockReturnValue(new Promise(() => {}));
    render(<SignUpForm />);

    await fillValidForm(user);
    await user.click(screen.getByRole('button', { name: /create account/i }));

    expect(screen.getByRole('button', { name: /creating account/i })).toBeDisabled();
  });

  it('explains duplicate emails with a safe message', async () => {
    const user = userEvent.setup();
    signUpEmail.mockResolvedValue({ data: null, error: { code: 'USER_ALREADY_EXISTS' } });
    render(<SignUpForm />);

    await fillValidForm(user);
    await user.click(screen.getByRole('button', { name: /create account/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/already exists/i);
  });

  it('shows a success state linking to sign-in after account creation', async () => {
    const user = userEvent.setup();
    signUpEmail.mockResolvedValue({ data: { user: { email: 'ada@example.com' } }, error: null });
    render(<SignUpForm />);

    await fillValidForm(user);
    await user.click(screen.getByRole('button', { name: /create account/i }));

    expect(await screen.findByRole('status')).toHaveTextContent(/account created/i);
    expect(screen.getByRole('link', { name: /continue to sign in/i })).toHaveAttribute(
      'href',
      '/sign-in?status=account-created',
    );
  });
});
