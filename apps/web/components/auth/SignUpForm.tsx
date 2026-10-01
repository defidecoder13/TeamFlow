/**
 * Sign-up form: validates locally, then creates the account through the real
 * Express/Better Auth backend. On success the session is established by
 * Better Auth and the user continues to sign-in.
 */

'use client';

import { useState } from 'react';
import { getAuthClient } from '../../lib/auth-client';
import { SIGN_UP_FALLBACK, toAuthErrorMessage } from '../../lib/auth-errors';
import {
  validateEmail,
  validateName,
  validatePassword,
  validatePasswordConfirmation,
} from '../../lib/validation';
import { AuthError } from './AuthError';
import { AuthField } from './AuthField';
import { AuthSubmitButton } from './AuthSubmitButton';
import { AuthSwitchLink } from './AuthSwitchLink';
import { LockIcon, MailIcon, PersonIcon } from './field-icons';
import { PasswordField } from './PasswordField';
import { ProfileSetupStep } from './ProfileSetupStep';

export function SignUpForm() {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [touched, setTouched] = useState({
    name: false,
    email: false,
    password: false,
    confirmation: false,
  });
  const [authError, setAuthError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [created, setCreated] = useState(false);

  const nameError = touched.name ? validateName(name) : null;
  const emailError = touched.email ? validateEmail(email) : null;
  const passwordError = touched.password ? validatePassword(password) : null;
  const confirmationError = touched.confirmation
    ? validatePasswordConfirmation(password, confirmation)
    : null;

  function touch(field: keyof typeof touched) {
    setTouched((current) => ({ ...current, [field]: true }));
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (submitting) {
      return;
    }
    setTouched({ name: true, email: true, password: true, confirmation: true });
    const errors = [
      validateName(name),
      validateEmail(email),
      validatePassword(password),
      validatePasswordConfirmation(password, confirmation),
    ];
    if (errors.some((message) => message !== null)) {
      return;
    }
    setSubmitting(true);
    setAuthError(null);
    try {
      const { error } = await getAuthClient().signUp.email({
        name: name.trim(),
        email: email.trim(),
        password,
      });
      if (error) {
        setAuthError(toAuthErrorMessage(error, SIGN_UP_FALLBACK));
        return;
      }
      setCreated(true);
    } catch {
      setAuthError(SIGN_UP_FALLBACK);
    } finally {
      setSubmitting(false);
    }
  }

  if (created) {
    return <ProfileSetupStep name={name} email={email} />;
  }

  return (
    <div className="w-full min-w-0">
      <AuthSwitchLink prompt="Already have an account?" actionLabel="Sign in" href="/sign-in" />

      <h1 className="text-2xl font-semibold tracking-[-0.02em] text-[#171A21]">Create your account</h1>
      <p className="mt-2 text-sm leading-relaxed text-[#4F5360]">Get started with TeamFlow</p>

      <form onSubmit={handleSubmit} noValidate className="mt-8 space-y-4">
        <AuthError message={authError} />
        <AuthField
          id="signup-name"
          label="Full name"
          type="text"
          autoComplete="name"
          required
          value={name}
          error={nameError}
          disabled={submitting}
          icon={<PersonIcon />}
          placeholder="Your name"
          onChange={(event) => setName(event.target.value)}
          onBlur={() => touch('name')}
        />
        <AuthField
          id="signup-email"
          label="Email"
          type="email"
          autoComplete="email"
          inputMode="email"
          required
          value={email}
          error={emailError}
          disabled={submitting}
          icon={<MailIcon />}
          placeholder="you@teamflow.com"
          onChange={(event) => setEmail(event.target.value)}
          onBlur={() => touch('email')}
        />
        <PasswordField
          id="signup-password"
          label="Password"
          autoComplete="new-password"
          value={password}
          error={passwordError}
          disabled={submitting}
          icon={<LockIcon />}
          placeholder="Create a password"
          onChange={setPassword}
          onBlur={() => touch('password')}
        />
        <PasswordField
          id="signup-password-confirmation"
          label="Confirm password"
          autoComplete="new-password"
          value={confirmation}
          error={confirmationError}
          disabled={submitting}
          icon={<LockIcon />}
          placeholder="Confirm your password"
          onChange={setConfirmation}
          onBlur={() => touch('confirmation')}
        />
        <div className="pt-3">
          <AuthSubmitButton pending={submitting} pendingLabel="Creating account…">
            Create account
          </AuthSubmitButton>
        </div>
      </form>
    </div>
  );
}
