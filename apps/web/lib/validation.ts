/**
 * Client-side form validation for authentication.
 *
 * Pure functions (no React) so they are trivially unit-testable.
 * Mirrors Better Auth's server policy: minimum password length is 8.
 */

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const MIN_PASSWORD_LENGTH = 8;
export const MIN_NAME_LENGTH = 2;

export function validateEmail(value: string): string | null {
  if (value.trim().length === 0) {
    return 'Enter your email address.';
  }
  if (!EMAIL_PATTERN.test(value.trim())) {
    return 'Enter a valid email address.';
  }
  return null;
}

export function validatePassword(value: string): string | null {
  if (value.length === 0) {
    return 'Enter your password.';
  }
  if (value.length < MIN_PASSWORD_LENGTH) {
    return `Use at least ${MIN_PASSWORD_LENGTH} characters.`;
  }
  return null;
}

/**
 * Sign-in only requires a non-empty password. Length policy is enforced at
 * sign-up; the server remains authoritative for credential checks.
 */
export function validateExistingPassword(value: string): string | null {
  if (value.length === 0) {
    return 'Enter your password.';
  }
  return null;
}

export function validateName(value: string): string | null {
  if (value.trim().length === 0) {
    return 'Enter your name.';
  }
  if (value.trim().length < MIN_NAME_LENGTH) {
    return `Use at least ${MIN_NAME_LENGTH} characters.`;
  }
  return null;
}

export function validatePasswordConfirmation(
  password: string,
  confirmation: string,
): string | null {
  if (confirmation.length === 0) {
    return 'Confirm your password.';
  }
  if (password !== confirmation) {
    return 'Passwords do not match.';
  }
  return null;
}
