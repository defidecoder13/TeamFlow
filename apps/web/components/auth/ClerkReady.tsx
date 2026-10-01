/**
 * Clerk load gate for the sign-in / sign-up pages.
 *
 * Clerk's components render client-side. If its script is slow, show a
 * branded skeleton in the same footprint (never a blank panel); if it never
 * loads (offline, script blocked), show an explicit error with a retry
 * instead of stranding the user on an empty card. Collapses under
 * prefers-reduced-motion via the global guard.
 */

'use client';

import { useAuth } from '@clerk/nextjs';
import { useEffect, useState, type ReactNode } from 'react';

const LOAD_TIMEOUT_MS = 8000;

export function ClerkReady({ children, label }: { children: ReactNode; label: string }) {
  const { isLoaded } = useAuth();
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (isLoaded) {
      return;
    }
    const timer = window.setTimeout(() => setFailed(true), LOAD_TIMEOUT_MS);
    return () => window.clearTimeout(timer);
  }, [isLoaded]);

  if (!isLoaded && failed) {
    return (
      <div
        role="alert"
        className="w-full max-w-[400px] rounded-2xl border border-[#E2E1E1] bg-white p-8 text-center shadow-[0_20px_60px_rgba(20,25,35,0.08)]"
      >
        <p className="text-[15px] font-semibold text-[#171A21]">Couldn&apos;t load sign in</p>
        <p className="mx-auto mt-2 max-w-sm text-[13px] leading-relaxed text-[#4F5360]">
          Check your connection (or pause your ad blocker) and try again.
        </p>
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="mt-5 rounded-[8px] bg-[#2E3440] px-4 py-2 text-[13px] font-medium text-white transition-colors hover:bg-[#1E222A] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#3157D5] active:scale-[0.98]"
        >
          Try again
        </button>
      </div>
    );
  }

  if (!isLoaded) {
    return (
      <div
        role="status"
        aria-label={label}
        className="w-full max-w-[400px] space-y-3 rounded-2xl border border-[#E2E1E1] bg-white p-8 shadow-[0_20px_60px_rgba(20,25,35,0.08)]"
      >
        <div aria-hidden="true" className="mx-auto h-5 w-40 animate-pulse rounded bg-[#E8E7F1]" />
        <div aria-hidden="true" className="mx-auto h-3 w-56 animate-pulse rounded bg-[#E8E7F1]" />
        <div aria-hidden="true" className="h-10 w-full animate-pulse rounded-lg bg-[#E8E7F1]" />
        <div aria-hidden="true" className="h-10 w-full animate-pulse rounded-lg bg-[#E8E7F1]" />
        <div aria-hidden="true" className="h-10 w-full animate-pulse rounded-lg bg-[#2E3440]/70" />
      </div>
    );
  }

  return <>{children}</>;
}
