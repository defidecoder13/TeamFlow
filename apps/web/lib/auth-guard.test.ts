import { describe, expect, it, vi } from 'vitest';
import {
  APP_PATH,
  SIGN_IN_PATH,
  decideAuthPageDestination,
  decideRouteAccess,
  fetchSessionUser,
  getSafeReturnTo,
} from './auth-guard';
import type { SessionUser } from './use-session-user';

const mockUser: SessionUser = {
  id: 'user-1',
  name: 'Ada Lovelace',
  email: 'ada@example.com',
  image: null,
  emailVerified: true,
};

describe('decideRouteAccess', () => {
  it('redirects unauthenticated /app visitors to sign-in', () => {
    expect(decideRouteAccess('/app', null)).toEqual({ kind: 'redirect', to: SIGN_IN_PATH });
  });

  it('redirects unauthenticated nested /app routes to sign-in', () => {
    expect(decideRouteAccess('/app/threads', null)).toEqual({
      kind: 'redirect',
      to: SIGN_IN_PATH,
    });
  });

  it('allows authenticated /app visitors', () => {
    expect(decideRouteAccess('/app', mockUser)).toEqual({ kind: 'allow' });
    expect(decideRouteAccess('/app/threads', mockUser)).toEqual({ kind: 'allow' });
  });

  it('allows unauthenticated sign-in and sign-up', () => {
    expect(decideRouteAccess('/sign-in', null)).toEqual({ kind: 'allow' });
    expect(decideRouteAccess('/sign-up', null)).toEqual({ kind: 'allow' });
  });

  it('bounces authenticated auth-page visitors to /app', () => {
    expect(decideRouteAccess('/sign-in', mockUser)).toEqual({ kind: 'redirect', to: APP_PATH });
    expect(decideRouteAccess('/sign-up', mockUser)).toEqual({ kind: 'redirect', to: APP_PATH });
  });

  it('leaves unrelated routes alone', () => {
    expect(decideRouteAccess('/', null)).toEqual({ kind: 'allow' });
    expect(decideRouteAccess('/', mockUser)).toEqual({ kind: 'allow' });
  });
});

describe('fetchSessionUser', () => {
  const apiBase = 'http://localhost:4000';

  it('returns the session user on 200 with a valid shape', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          user: {
            id: 'user-1',
            name: 'Ada Lovelace',
            email: 'ada@example.com',
            image: null,
            emailVerified: true,
          },
        }),
      }),
    );

    await expect(fetchSessionUser(apiBase, 'session=abc')).resolves.toEqual({
      id: 'user-1',
      name: 'Ada Lovelace',
      email: 'ada@example.com',
      image: null,
      emailVerified: true,
    });
    vi.unstubAllGlobals();
  });

  it('returns null on 401 without throwing', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: false, status: 401, json: async () => ({}) }),
    );

    await expect(fetchSessionUser(apiBase, '')).resolves.toBeNull();
    vi.unstubAllGlobals();
  });

  it('returns null on server errors and malformed payloads', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: false, status: 500, json: async () => ({}) }),
    );
    await expect(fetchSessionUser(apiBase, 'session=abc')).resolves.toBeNull();

    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, json: async () => ({ unexpected: true }) }),
    );
    await expect(fetchSessionUser(apiBase, 'session=abc')).resolves.toBeNull();

    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('connection refused')));
    await expect(fetchSessionUser(apiBase, 'session=abc')).resolves.toBeNull();
    vi.unstubAllGlobals();
  });
});

describe('getSafeReturnTo', () => {
  it('accepts same-origin app paths including query strings', () => {
    expect(getSafeReturnTo('/app')).toBe('/app');
    expect(getSafeReturnTo('/invite/accept?token=abc123')).toBe('/invite/accept?token=abc123');
  });

  it('rejects open redirects and garbage', () => {
    expect(getSafeReturnTo(null)).toBeNull();
    expect(getSafeReturnTo('')).toBeNull();
    expect(getSafeReturnTo('https://evil.example/app')).toBeNull();
    expect(getSafeReturnTo('//evil.example/app')).toBeNull();
    expect(getSafeReturnTo('/\\evil')).toBeNull();
    expect(getSafeReturnTo('app')).toBeNull();
  });
});

describe('decideAuthPageDestination', () => {
  it('honors a safe ?next= for authenticated auth-page visitors', () => {
    expect(decideAuthPageDestination('/sign-in', true, '/invite/accept?token=x')).toEqual({
      kind: 'redirect',
      to: '/invite/accept?token=x',
    });
    expect(decideAuthPageDestination('/sign-in', true, null)).toEqual({
      kind: 'redirect',
      to: '/app',
    });
  });

  it('ignores unsafe or self-referential ?next= values', () => {
    expect(decideAuthPageDestination('/sign-in', true, 'https://evil.example/')).toEqual({
      kind: 'redirect',
      to: '/app',
    });
    expect(decideAuthPageDestination('/sign-in', true, '/sign-in')).toEqual({
      kind: 'redirect',
      to: '/app',
    });
  });

  it('leaves unauthenticated auth pages alone', () => {
    expect(decideAuthPageDestination('/sign-in', false, '/app')).toEqual({ kind: 'allow' });
  });
});
