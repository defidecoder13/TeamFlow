/**
 * Sign-in form: validates locally, then authenticates against the real
 * Express/Better Auth backend. Session cookies are managed by Better Auth —
 * nothing sensitive is stored in browser storage by this form.
 *
 * Presentation follows the locked Stitch Sign In reference; behavior
 * (validation, errors, /app redirect) is unchanged.
 */

'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { getAuthClient } from '../../lib/auth-client';
import { SIGN_IN_FALLBACK, toAuthErrorMessage } from '../../lib/auth-errors';
import { validateEmail, validatePassword } from '../../lib/validation';
import { AuthError } from './AuthError';
import { AuthField } from './AuthField';
import { AuthSubmitButton } from './AuthSubmitButton';
import { AuthSwitchLink } from './AuthSwitchLink';
import { LockIcon, MailIcon } from './field-icons';
import { PasswordField } from './PasswordField';

export function SignInForm({ notice, returnTo }: { notice?: string; returnTo?: string }) {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [touched, setTouched] = useState({ email: false, password: false });
  const [authError, setAuthError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const emailError = touched.email ? validateEmail(email) : null;
  const passwordError = touched.password ? validatePassword(password) : null;

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (submitting) {
      return;
    }
    setTouched({ email: true, password: true });
    const nextEmailError = validateEmail(email);
    const nextPasswordError = validatePassword(password);
    if (nextEmailError || nextPasswordError) {
      return;
    }
    setSubmitting(true);
    setAuthError(null);
    try {
      const { error } = await getAuthClient().signIn.email({
        email: email.trim(),
        password,
      });
      if (error) {
        setAuthError(toAuthErrorMessage(error, SIGN_IN_FALLBACK));
        return;
      }
      router.replace(returnTo ?? '/app');
    } catch {
      setAuthError(SIGN_IN_FALLBACK);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div>
      <AuthSwitchLink prompt="New to TeamFlow?" actionLabel="Create an account" href="/sign-up" />

      <h1 className="text-2xl font-semibold tracking-tight text-zinc-900">Welcome back</h1>
      <p className="mt-1.5 text-sm leading-relaxed text-zinc-500">
        Sign in to your TeamFlow account
      </p>

      {notice ? (
        <p
          role="status"
          className="mt-5 rounded-lg border border-stone-200 bg-stone-50 px-3.5 py-3 text-[13px] leading-snug text-zinc-700"
        >
          {notice}
        </p>
      ) : null}

      <form onSubmit={handleSubmit} noValidate className="mt-7 space-y-4">
        <AuthError message={authError} />
        <AuthField
          id="signin-email"
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
          onBlur={() => setTouched((current) => ({ ...current, email: true }))}
        />
        <PasswordField
          id="signin-password"
          label="Password"
          autoComplete="current-password"
          value={password}
          error={passwordError}
          disabled={submitting}
          icon={<LockIcon />}
          placeholder="Your password"
          onChange={setPassword}
          onBlur={() => setTouched((current) => ({ ...current, password: true }))}
        />
        <div className="pt-2">
          <AuthSubmitButton pending={submitting} pendingLabel="Signing in…">
            Sign in
          </AuthSubmitButton>
        </div>
      </form>
    </div>
  );
}
