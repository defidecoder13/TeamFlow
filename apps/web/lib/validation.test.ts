import { describe, expect, it } from 'vitest';
import {
  MIN_NAME_LENGTH,
  MIN_PASSWORD_LENGTH,
  validateEmail,
  validateExistingPassword,
  validateName,
  validatePassword,
  validatePasswordConfirmation,
} from './validation';

describe('auth validation', () => {
  it('requires an email address', () => {
    expect(validateEmail('')).toBe('Enter your email address.');
    expect(validateEmail('   ')).toBe('Enter your email address.');
  });

  it('rejects invalid email formats', () => {
    expect(validateEmail('not-an-email')).toBe('Enter a valid email address.');
    expect(validateEmail('user@')).toBe('Enter a valid email address.');
    expect(validateEmail('user@example')).toBe('Enter a valid email address.');
  });

  it('accepts valid email addresses', () => {
    expect(validateEmail('ada@example.com')).toBeNull();
    expect(validateEmail('  ada@example.com  ')).toBeNull();
  });

  it('requires a password of minimum length', () => {
    expect(validatePassword('')).toBe('Enter your password.');
    expect(validatePassword('short')).toBe(`Use at least ${MIN_PASSWORD_LENGTH} characters.`);
    expect(validatePassword('long-enough-password')).toBeNull();
  });

  it('requires only a non-empty password for sign-in', () => {
    expect(validateExistingPassword('')).toBe('Enter your password.');
    expect(validateExistingPassword('short')).toBeNull();
    expect(validateExistingPassword('long-enough-password')).toBeNull();
  });

  it('requires a name of minimum length', () => {
    expect(validateName('')).toBe('Enter your name.');
    expect(validateName('A')).toBe(`Use at least ${MIN_NAME_LENGTH} characters.`);
    expect(validateName('Ada')).toBeNull();
  });

  it('requires matching password confirmation', () => {
    expect(validatePasswordConfirmation('secret-123', '')).toBe('Confirm your password.');
    expect(validatePasswordConfirmation('secret-123', 'different')).toBe('Passwords do not match.');
    expect(validatePasswordConfirmation('secret-123', 'secret-123')).toBeNull();
  });
});
