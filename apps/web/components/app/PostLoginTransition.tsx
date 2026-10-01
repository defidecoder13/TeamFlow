/**
 * Post-login transition (Clerk era).
 *
 * When the app boots straight from `/sign-in` or `/sign-up` (same-origin
 * referrer), the workspace hasn't loaded yet — this overlay owns that
 * moment: "Signing you in…" first, then flips to "Signed in ✓ Welcome
 * back" the instant the session authenticates, then fades. It always
 * appears BEFORE workspace content, never replays on refresh or in-app
 * navigation, never blocks pointer input, has a max-timeout so it can never
 * strand, and collapses under prefers-reduced-motion via the global guard.
 */

'use client';

import { useEffect, useRef, useState } from 'react';
import { useShell } from '../../lib/shell-context';

const SHOW_AFTER_AUTH_MS = 1000;
const MAX_VISIBLE_MS = 4000;

function cameFromAuthPage(): boolean {
  try {
    if (typeof document === 'undefined' || !document.referrer) {
      return false;
    }
    const url = new URL(document.referrer, window.location.origin);
    if (url.origin !== window.location.origin) {
      return false;
    }
    const path = url.pathname;
    return (
      path === '/sign-in' ||
      path.startsWith('/sign-in/') ||
      path === '/sign-up' ||
      path.startsWith('/sign-up/')
    );
  } catch {
    return false;
  }
}

function firstNameOf(name: string): string {
  const first = name.trim().split(/\s+/)[0];
  return first && first.length > 0 ? first : 'there';
}

type Phase = 'hidden' | 'waiting' | 'showing' | 'leaving';

export function PostLoginTransition() {
  const { session } = useShell();
  const authenticated = session.status === 'authenticated';
  const displayName = authenticated ? firstNameOf(session.user.name) : '';
  const [phase, setPhase] = useState<Phase>('hidden');
  const startedRef = useRef(false);
  const timersRef = useRef<number[]>([]);

  useEffect(() => {
    const resolved =
      session.status === 'unauthenticated' || session.status === 'error';
    if (startedRef.current || resolved || !cameFromAuthPage()) {
      return;
    }
    startedRef.current = true;
    // Show immediately — the workspace hasn't painted yet.
    setPhase(authenticated ? 'showing' : 'waiting');
    // Safety: never strand the overlay.
    timersRef.current.push(window.setTimeout(() => setPhase('hidden'), MAX_VISIBLE_MS));
    return () => {
      for (const timer of timersRef.current) {
        window.clearTimeout(timer);
      }
      timersRef.current = [];
    };
    // Intentionally mount-only: replaying on session flips would celebrate
    // routine re-authentications (e.g. tab refocus refetch).
  }, []);

  useEffect(() => {
    if (!startedRef.current || !authenticated) {
      return;
    }
    setPhase((current) => (current === 'waiting' ? 'showing' : current));
    const leaveTimer = window.setTimeout(() => setPhase('leaving'), SHOW_AFTER_AUTH_MS);
    const doneTimer = window.setTimeout(() => setPhase('hidden'), SHOW_AFTER_AUTH_MS + 400);
    return () => {
      window.clearTimeout(leaveTimer);
      window.clearTimeout(doneTimer);
    };
  }, [authenticated]);

  if (phase === 'hidden') {
    return null;
  }
  const signedIn = phase === 'showing' || phase === 'leaving';

  return (
    <div
      aria-hidden="true"
      className={[
        'pointer-events-none fixed inset-0 z-[60] flex items-center justify-center',
        'transition-opacity duration-300',
        phase === 'leaving' ? 'opacity-0' : 'opacity-100',
      ].join(' ')}
    >
      <div className="animate-celebrate-pop flex flex-col items-center gap-2 rounded-2xl border border-[#E4E2DF] bg-white/95 px-10 py-7 shadow-[0_20px_60px_rgba(20,25,35,0.16)] backdrop-blur">
        {signedIn ? (
          <span className="flex h-12 w-12 items-center justify-center rounded-full bg-[#E9F5EE]">
            <svg
              viewBox="0 0 24 24"
              className="h-6 w-6 text-[#1F7A4D]"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
              focusable="false"
            >
              <path
                d="M4.5 12.5l5 5 10-11"
                pathLength={1}
                strokeDasharray={1}
                strokeDashoffset={1}
                className="animate-celebrate-check"
              />
            </svg>
          </span>
        ) : (
          <span className="flex h-12 w-12 items-center justify-center rounded-full bg-[#EEF2FF]">
            <svg
              viewBox="0 0 16 16"
              className="h-5 w-5 animate-spin text-[#3157D5]"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              aria-hidden="true"
              focusable="false"
            >
              <path d="M8 1.5a6.5 6.5 0 1 0 6.5 6.5" strokeLinecap="round" />
            </svg>
          </span>
        )}
        <p className="text-[16px] font-semibold tracking-tight text-[#171A21]">
          {signedIn ? 'Signed in' : 'Signing you in…'}
        </p>
        <p className="text-[13px] text-[#4F5360]">
          {signedIn ? `Welcome back, ${displayName}.` : 'Taking you to your workspace.'}
        </p>
      </div>
    </div>
  );
}
