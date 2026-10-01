import { describe, expect, it, vi, beforeEach } from 'vitest';
import { decideAuthPageDestination, fetchSessionUser, getSafeReturnTo } from './auth-guard';

const { fetchMock } = vi.hoisted(() => ({ fetchMock: vi.fn() }));

vi.stubGlobal('fetch', fetchMock);

beforeEach(() => {
  fetchMock.mockReset();
});

/**
 * Middleware behavior: session check + destination decision for the
 * matcher ['/app/:path*', '/sign-in', '/sign-up'].
 */
describe('middleware decision matrix', () => {
  it('allows unauthenticated /sign-in and /sign-up', () => {
    expect(decideAuthPageDestination('/sign-in', false, null)).toEqual({ kind: 'allow' });
    expect(decideAuthPageDestination('/sign-up', false, null)).toEqual({ kind: 'allow' });
  });

  it('redirects authenticated visitors off auth pages to safe next or /app', () => {
    expect(decideAuthPageDestination('/sign-in', true, null)).toEqual({
      kind: 'redirect',
      to: '/app',
    });
    expect(decideAuthPageDestination('/sign-in', true, '/app/dms/123')).toEqual({
      kind: 'redirect',
      to: '/app/dms/123',
    });
    expect(decideAuthPageDestination('/sign-up', true, null)).toEqual({
      kind: 'redirect',
      to: '/app',
    });
  });

  it('redirects unauthenticated /app visitors to sign-in preserving path+query', () => {
    expect(decideAuthPageDestination('/app', false, null)).toEqual({
      kind: 'redirect',
      to: '/sign-in?next=%2Fapp',
    });
    expect(decideAuthPageDestination('/app/channels/general', false, null, '?page=2')).toEqual({
      kind: 'redirect',
      to: `/sign-in?next=${encodeURIComponent('/app/channels/general?page=2')}`,
    });
  });

  it('round-trips a middleware-built next through getSafeReturnTo', () => {
    const decision = decideAuthPageDestination('/app/search', false, null, '?q=hello');
    expect(decision.kind).toBe('redirect');
    if (decision.kind !== 'redirect') return;
    const url = new URL(decision.to, 'http://localhost:3000');
    const next = url.searchParams.get('next');
    expect(getSafeReturnTo(next)).toBe('/app/search?q=hello');
  });

  it('treats failed session lookups as unauthenticated (fail closed)', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => ({}),
    });
    await expect(fetchSessionUser('http://localhost:4000', 'cookie')).resolves.toBeNull();
    const decision = decideAuthPageDestination(
      '/app',
      (await fetchSessionUser('http://localhost:4000', 'cookie')) !== null,
      null,
    );
    expect(decision.kind).toBe('redirect');
  });
});
