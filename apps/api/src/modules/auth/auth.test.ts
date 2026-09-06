import { afterEach, describe, expect, it } from 'vitest';
import { getAuth } from './auth';

const TEST_SECRET = 'test-secret-0123456789abcdef-0123456789abcdef';
const TEST_DATABASE_URL = 'postgresql://teamflow:teamflow@localhost:5432/teamflow';

describe('auth foundation', () => {
  afterEach(() => {
    delete process.env.BETTER_AUTH_SECRET;
    delete process.env.BETTER_AUTH_URL;
    delete process.env.DATABASE_URL;
  });

  it('throws a clear error when BETTER_AUTH_SECRET is missing', () => {
    delete process.env.BETTER_AUTH_SECRET;
    process.env.BETTER_AUTH_URL = 'http://localhost:4000';
    process.env.DATABASE_URL = TEST_DATABASE_URL;

    expect(() => getAuth()).toThrow('BETTER_AUTH_SECRET is not set');
  });

  it('throws a clear error when BETTER_AUTH_URL is missing', () => {
    process.env.BETTER_AUTH_SECRET = TEST_SECRET;
    delete process.env.BETTER_AUTH_URL;
    process.env.DATABASE_URL = TEST_DATABASE_URL;

    expect(() => getAuth()).toThrow('BETTER_AUTH_URL is not set');
  });

  it('throws a clear error when DATABASE_URL is missing', () => {
    process.env.BETTER_AUTH_SECRET = TEST_SECRET;
    process.env.BETTER_AUTH_URL = 'http://localhost:4000';
    delete process.env.DATABASE_URL;

    expect(() => getAuth()).toThrow('DATABASE_URL is not set');
  });

  it('returns an auth instance with a request handler when fully configured', () => {
    process.env.BETTER_AUTH_SECRET = TEST_SECRET;
    process.env.BETTER_AUTH_URL = 'http://localhost:4000';
    process.env.DATABASE_URL = TEST_DATABASE_URL;

    const auth = getAuth();

    expect(typeof auth.handler).toBe('function');
  });
});
