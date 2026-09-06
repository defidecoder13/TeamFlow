/**
 * Authenticated user profile control (Phase 1D).
 *
 * Identity comes from the real session user. Profile/Settings are disabled
 * placeholders; Sign out calls Better Auth's real sign-out, then returns to
 * /sign-in where the middleware re-verifies the (now invalid) session.
 */

'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import type { SessionUser } from '../../lib/auth-guard';
import { getAuthClient } from '../../lib/auth-client';
import { ChevronDownIcon, SettingsIcon, SignOutIcon, PersonIcon } from './icons';
import { UserAvatar } from './UserAvatar';

export function UserMenu({ user }: { user: SessionUser }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [signOutError, setSignOutError] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) {
      return;
    }
    function onPointerDown(event: PointerEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setOpen(false);
      }
    }
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  async function handleSignOut() {
    if (signingOut) {
      return;
    }
    setSigningOut(true);
    setSignOutError(null);
    try {
      const { error } = await getAuthClient().signOut();
      if (error) {
        setSignOutError('Could not sign you out. Please try again.');
        return;
      }
      router.replace('/sign-in');
      router.refresh();
    } catch {
      setSignOutError('Could not sign you out. Please try again.');
    } finally {
      setSigningOut(false);
    }
  }

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Account: ${user.name}`}
        onClick={() => setOpen((current) => !current)}
        className="flex items-center gap-2 rounded-lg px-1.5 py-1 transition-colors hover:bg-stone-900/[0.05] focus-visible:outline-2 focus-visible:outline-stone-900"
      >
        <UserAvatar name={user.name} image={user.image} size="sm" />
        <ChevronDownIcon className="h-3.5 w-3.5 text-stone-400" />
      </button>

      {open ? (
        <div
          role="menu"
          aria-label="Account"
          className="absolute right-0 top-full z-20 mt-2 w-60 overflow-hidden rounded-xl border border-stone-200 bg-white shadow-[0_8px_24px_rgba(0,0,0,0.08)]"
        >
          <div className="flex items-center gap-2.5 border-b border-stone-100 px-3.5 py-3">
            <UserAvatar name={user.name} image={user.image} size="md" />
            <div className="min-w-0">
              <p className="truncate text-[13px] font-semibold text-stone-900">{user.name}</p>
              <p className="truncate text-xs text-stone-500">{user.email}</p>
            </div>
          </div>
          <div className="p-1.5">
            <button
              type="button"
              role="menuitem"
              disabled
              title="Profile arrives in a later phase"
              className="flex h-8 w-full items-center gap-2.5 rounded-md px-2 text-[13px] text-stone-400 disabled:cursor-not-allowed"
            >
              <PersonIcon className="h-4 w-4" />
              Profile
            </button>
            <button
              type="button"
              role="menuitem"
              disabled
              title="Settings arrive in a later phase"
              className="flex h-8 w-full items-center gap-2.5 rounded-md px-2 text-[13px] text-stone-400 disabled:cursor-not-allowed"
            >
              <SettingsIcon className="h-4 w-4" />
              Settings
            </button>
            <div aria-hidden="true" className="mx-2 my-1.5 border-t border-stone-100" />
            <button
              type="button"
              role="menuitem"
              disabled={signingOut}
              onClick={() => void handleSignOut()}
              className="flex h-8 w-full items-center gap-2.5 rounded-md px-2 text-[13px] font-medium text-stone-700 transition-colors hover:bg-stone-900/[0.05] disabled:cursor-not-allowed disabled:opacity-60"
            >
              <SignOutIcon className="h-4 w-4" />
              {signingOut ? 'Signing out…' : 'Sign out'}
            </button>
            {signOutError ? (
              <p role="alert" className="px-2 pb-1.5 pt-1 text-xs text-red-700">
                {signOutError}
              </p>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
