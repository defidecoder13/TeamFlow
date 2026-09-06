import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { decideAuthPageDestination, fetchSessionUser } from './lib/auth-guard';
import { getServerApiBaseUrl } from './lib/config';

/**
 * Primary route protection (Phase 1D).
 *
 * For gated routes, the middleware forwards the request cookies to the
 * authoritative Express session (`GET /api/me`) and redirects before any
 * page renders. Missing configuration or an unreachable API fails closed
 * (treated as unauthenticated).
 */
export async function middleware(request: NextRequest) {
  let authenticated = false;
  try {
    const user = await fetchSessionUser(getServerApiBaseUrl(), request.headers.get('cookie') ?? '');
    authenticated = user !== null;
  } catch {
    authenticated = false;
  }

  const decision = decideAuthPageDestination(
    request.nextUrl.pathname,
    authenticated,
    request.nextUrl.searchParams.get('next'),
  );
  if (decision.kind === 'redirect') {
    return NextResponse.redirect(new URL(decision.to, request.url));
  }
  return NextResponse.next();
}

export const config = {
  matcher: ['/app/:path*', '/sign-in', '/sign-up'],
};
