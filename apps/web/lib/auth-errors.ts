/**
 * Maps Better Auth client errors to safe, user-facing messages.
 *
 * Only known codes get specific copy; everything else falls back to a
 * generic message. Raw server payloads, status codes, and stack traces are
 * never surfaced.
 */

interface AuthClientError {
  code?: string;
  message?: string;
}

const FALLBACK_MESSAGE = 'Something went wrong. Please try again.';

export function toAuthErrorMessage(error: unknown, fallback: string = FALLBACK_MESSAGE): string {
  if (typeof error !== 'object' || error === null || !('code' in error)) {
    return fallback;
  }
  const code = (error as AuthClientError).code;
  switch (code) {
    case 'USER_ALREADY_EXISTS':
    case 'USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL':
      return 'An account with this email already exists. Try signing in instead.';
    case 'INVALID_EMAIL_OR_PASSWORD':
      return 'Incorrect email or password. Please try again.';
    case 'INVALID_EMAIL':
      return 'Enter a valid email address.';
    case 'PASSWORD_TOO_SHORT':
      return 'Use a longer password and try again.';
    case 'PASSWORD_TOO_LONG':
      return 'That password is too long. Try a shorter one.';
    case 'USER_NOT_FOUND':
      return 'No account found for this email. Check it and try again.';
    default:
      return fallback;
  }
}

export const SIGN_IN_FALLBACK = 'Could not sign you in. Please try again.';
export const SIGN_UP_FALLBACK = 'Could not create your account. Please try again.';
