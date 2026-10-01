import { clerkMiddleware } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { decideAuthPageDestination } from './lib/auth-guard';

/**
 * Primary route protection (Clerk).
 *
 * Identity comes from the Clerk session (`auth()` validates server-side).
 * Redirect policy stays in `decideAuthPageDestination`, preserving the
 * product's `?next=` convention end to end:
 *
 * - `/app` requires a session (fail closed → `/sign-in?next=<path+query>`).
 * - Authenticated visitors to `/sign-in` / `/sign-up` bounce to the safe
 *   `?next=` destination or `/app`.
 * - `/` and `/invite/accept` stay public (invite handles sessions client-side).
 */
export default clerkMiddleware(async (auth, request: NextRequest) => {
  const { userId } = await auth();
  const decision = decideAuthPageDestination(
    request.nextUrl.pathname,
    userId !== null,
    request.nextUrl.searchParams.get('next'),
    request.nextUrl.search,
  );
  if (decision.kind === 'redirect') {
    return NextResponse.redirect(new URL(decision.to, request.url));
  }
  return NextResponse.next();
});

export const config = {
  matcher: ['/app/:path*', '/sign-in/:path*', '/sign-up/:path*', '/__clerk/:path*'],
};
