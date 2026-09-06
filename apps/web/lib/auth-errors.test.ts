import { describe, expect, it } from 'vitest';
import { SIGN_IN_FALLBACK, toAuthErrorMessage } from './auth-errors';

describe('toAuthErrorMessage', () => {
  it('explains duplicate emails', () => {
    expect(toAuthErrorMessage({ code: 'USER_ALREADY_EXISTS' })).toContain('already exists');
    expect(toAuthErrorMessage({ code: 'USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL' })).toContain(
      'already exists',
    );
  });

  it('explains invalid credentials without leaking details', () => {
    const message = toAuthErrorMessage({ code: 'INVALID_EMAIL_OR_PASSWORD' });
    expect(message).toContain('Incorrect email or password');
    expect(message).not.toContain('INVALID_EMAIL_OR_PASSWORD');
  });

  it('falls back safely for unknown shapes', () => {
    expect(toAuthErrorMessage({ code: 'SOME_FUTURE_CODE' })).toBe(
      'Something went wrong. Please try again.',
    );
    expect(toAuthErrorMessage(null)).toBe('Something went wrong. Please try again.');
    expect(toAuthErrorMessage(new Error('raw stack trace here'))).toBe(
      'Something went wrong. Please try again.',
    );
    expect(toAuthErrorMessage({ code: 'UNKNOWN' }, SIGN_IN_FALLBACK)).toBe(SIGN_IN_FALLBACK);
  });
});
