/**
 * Server-aware route protection helpers (Phase 1D).
 *
 * The Next.js middleware uses these to gate routes against the authoritative
 * Express session (`GET /api/me`) BEFORE rendering — this is the primary
 * protection mechanism, not a client-side redirect. Client components add a
 * second layer (loading/error/expired-session handling) on top.
 *
 * This module is intentionally free of `next/*` imports so the decision logic
 * and session fetch are plain unit-testable functions.
 */

/** Safe identity shape returned by the Express `GET /api/me` endpoint. */
export interface SessionUser {
  id: string;
  name: string;
  email: string;
  image: string | null;
  emailVerified: boolean;
}

export const APP_PATH = '/app';
export const SIGN_IN_PATH = '/sign-in';

const AUTH_PAGES = new Set(['/sign-in', '/sign-up']);

/**
 * Validate a post-sign-in return destination. Only same-origin app paths are
 * allowed (single leading slash, no backslashes) — anything else falls back
 * to null so open redirects are impossible.
 */
export function getSafeReturnTo(value: string | null | undefined): string | null {
  if (!value || !value.startsWith('/') || value.startsWith('//') || value.includes('\\')) {
    return null;
  }
  return value;
}

export type GuardDecision = { kind: 'allow' } | { kind: 'redirect'; to: string };

/**
 * Decide route access from authentication state.
 *
 * - `/app` (and anything under it) requires a session → else `/sign-in`.
 * - `/sign-in` and `/sign-up` bounce authenticated users → `/app`.
 * - Everything else is unaffected.
 *
 * The two rules point at opposite destinations, so redirect loops are
 * impossible: each redirect lands on a route that allows its own state.
 */
export function decideRouteAccess(pathname: string, isAuthenticated: boolean): GuardDecision {
  const isAppRoute = pathname === APP_PATH || pathname.startsWith(`${APP_PATH}/`);
  if (isAppRoute) {
    return isAuthenticated ? { kind: 'allow' } : { kind: 'redirect', to: SIGN_IN_PATH };
  }
  if (AUTH_PAGES.has(pathname)) {
    return isAuthenticated ? { kind: 'redirect', to: APP_PATH } : { kind: 'allow' };
  }
  return { kind: 'allow' };
}

/**
 * Where an authenticated visitor to an auth page should land: a validated
 * `?next=` destination (e.g. back to an invitation) or `/app` by default.
 * Loop-safe: `?next=` only ever points at app paths, and `/app` allows its
 * own authenticated state.
 */
export function decideAuthPageDestination(
  pathname: string,
  isAuthenticated: boolean,
  nextParam: string | null,
): GuardDecision {
  if (!AUTH_PAGES.has(pathname) || !isAuthenticated) {
    return decideRouteAccess(pathname, isAuthenticated);
  }
  const next = getSafeReturnTo(nextParam);
  const nextPath = next?.split('?')[0] ?? '';
  if (next && !AUTH_PAGES.has(nextPath)) {
    return { kind: 'redirect', to: next };
  }
  return { kind: 'redirect', to: APP_PATH };
}

interface SessionUserShape {
  id: string;
  name: string;
  email: string;
  image?: string | null;
  emailVerified?: boolean;
}

function isUserShape(candidate: unknown): candidate is SessionUserShape {
  if (typeof candidate !== 'object' || candidate === null) {
    return false;
  }
  const record = candidate as Record<string, unknown>;
  return (
    typeof record.id === 'string' &&
    typeof record.name === 'string' &&
    typeof record.email === 'string'
  );
}

function isSessionUserBody(value: unknown): value is { user: SessionUserShape } {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  return isUserShape((value as { user?: unknown }).user);
}

/**
 * Ask the Express API for the current session user, forwarding the browser
 * cookies. Returns `null` for missing/invalid sessions AND for transport
 * failures — callers fail closed (treat as unauthenticated).
 */
export async function fetchSessionUser(
  apiBaseUrl: string,
  cookieHeader: string,
): Promise<SessionUser | null> {
  try {
    const response = await fetch(`${apiBaseUrl}/api/me`, {
      headers: { cookie: cookieHeader },
      cache: 'no-store',
    });
    if (!response.ok) {
      return null;
    }
    const body: unknown = await response.json();
    if (!isSessionUserBody(body)) {
      return null;
    }
    const { id, name, email, image, emailVerified } = body.user;
    return { id, name, email, image: image ?? null, emailVerified: emailVerified ?? false };
  } catch {
    return null;
  }
}
