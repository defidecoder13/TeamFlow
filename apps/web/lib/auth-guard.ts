/**
 * Server-aware route protection helpers.
 *
 * This module must stay free of client-only code ('use client', React,
 * `window`): it is imported by `middleware.ts`, which runs in the Edge
 * runtime. The Next.js middleware uses these helpers to gate routes against
 * the authoritative Express session (`GET /api/me`) BEFORE rendering — this
 * is the primary protection mechanism, not a client-side redirect. Client
 * components add a second layer (loading/error/expired-session handling)
 * on top via `use-session-user.ts`.
 */
import type { SessionUser } from './use-session-user';
export type { SessionUser };

/**
 * Server-side session fetcher used by middleware.
 * Works in both Edge and Node runtimes.
 */
export async function fetchSessionUser(
  apiBase: string,
  cookieHeader: string,
): Promise<SessionUser | null> {
  let res: Response;
  try {
    res = await fetch(`${apiBase}/api/me`, {
      method: 'GET',
      headers: {
        Cookie: cookieHeader,
        Accept: 'application/json',
      },
      credentials: 'omit',
      cache: 'no-store',
    });
  } catch {
    return null;
  }

  if (res.status === 401) {
    return null;
  }
  if (!res.ok) {
    return null;
  }

  const body: unknown = await res.json();
  if (!isSessionUserBody(body)) {
    return null;
  }
  const session = body as {
    user: {
      id: string;
      name: string;
      email: string;
      image?: string | null;
      emailVerified?: boolean;
    };
  };
  const u = session.user;
  return {
    id: u.id,
    name: u.name,
    email: u.email,
    image: u.image ?? null,
    emailVerified: u.emailVerified ?? false,
  };
}

/**
 * Safe return path derived from `next` query param, bounded to app routes.
 * Allows /app/* routes and known safe routes like /invite/accept.
 * Only relative paths starting with / are accepted.
 * Protocol-relative URLs (//evil.com) are rejected.
 */
export function getSafeReturnTo(returnTo: string | null): string | null {
  if (!returnTo) {
    return null;
  }
  if (!returnTo.startsWith('/')) {
    return null;
  }
  if (returnTo.startsWith('//')) {
    return null;
  }
  try {
    const url = new URL(returnTo, 'http://localhost');
    const pathname = url.pathname;
    if (pathname.startsWith('/app/') || pathname === '/app' || pathname === '/invite/accept') {
      return pathname + url.search;
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Decide where an incoming request should go based on auth state and path.
 * This function accepts `true`/`false` for backward compatibility with tests.
 */
export function decideAuthPageDestination(
  pathname: string,
  authenticated: boolean | SessionUser | null,
  returnTo: string | null,
): { kind: 'allow' } | { kind: 'redirect'; to: string } {
  const safeReturnTo = getSafeReturnTo(returnTo);

  const isAuth = authenticated === true || (authenticated as SessionUser | null);
  if (isAuth) {
    if (pathname === '/sign-in' || pathname === '/sign-up') {
      return { kind: 'redirect', to: safeReturnTo ?? APP_PATH };
    }
    return { kind: 'allow' };
  }

  if (pathname === '/sign-in' || pathname === '/sign-up') {
    return { kind: 'allow' };
  }

  if (pathname.startsWith('/app/') || pathname === '/app') {
    return { kind: 'redirect', to: `/sign-in?next=${encodeURIComponent(pathname)}` };
  }

  return { kind: 'allow' };
}

/**
 * Decides whether a client-side navigation target is accessible.
 */
export const APP_PATH = '/app';
export const SIGN_IN_PATH = '/sign-in';

export function decideRouteAccess(
  pathname: string,
  session: SessionUser | null,
): { kind: 'allow' } | { kind: 'redirect'; to: string } {
  if (session) {
    if (pathname.startsWith('/app/') || pathname === '/app') {
      return { kind: 'allow' };
    }
    if (pathname === '/sign-in' || pathname === '/sign-up') {
      return { kind: 'redirect', to: APP_PATH };
    }
    return { kind: 'allow' };
  }

  if (pathname.startsWith('/app/') || pathname === '/app') {
    return { kind: 'redirect', to: SIGN_IN_PATH };
  }

  return { kind: 'allow' };
}

function isSessionUserBody(value: unknown): value is {
  user: { id: string; name: string; email: string; image?: string | null; emailVerified?: boolean };
} {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const userProp = (value as Record<string, unknown>).user;
  if (typeof userProp !== 'object' || userProp === null) {
    return false;
  }
  const candidate = userProp as Record<string, unknown>;
  return (
    typeof candidate.id === 'string' &&
    typeof candidate.name === 'string' &&
    typeof candidate.email === 'string'
  );
}
