/**
 * Authenticated user profile control (Phase 1D).
 *
 * Identity comes from the real session user. Profile/Settings link to the
 * real settings pages; Sign out calls Clerk's real sign-out, then
 * returns to / where the landing page reflects the signed-out state.
 */

'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { useClerk } from '@clerk/nextjs';
import type { SessionUser } from '../../lib/auth-guard';
import { clearAttachmentDownloadUrlCache } from '../../lib/attachments';
import { disconnectRealtime } from '../../lib/realtime-client';
import { ChevronDownIcon, SettingsIcon, SignOutIcon, PersonIcon } from './icons';
import { UserAvatar } from './UserAvatar';
import { useMenuKeyboard } from './dialog';

export function UserMenu({ user }: { user: SessionUser }) {
  const router = useRouter();
  const { signOut: clerkSignOut } = useClerk();
  const [open, setOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [signOutError, setSignOutError] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useMenuKeyboard({
    open,
    onClose: () => setOpen(false),
    triggerRef,
  });

  useEffect(() => {
    if (!open) {
      return;
    }
    function onPointerDown(event: PointerEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('pointerdown', onPointerDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
    };
  }, [open]);

  async function handleSignOut() {
    if (signingOut) {
      return;
    }
    setSigningOut(true);
    setSignOutError(null);
    try {
      await clerkSignOut();
    } catch {
      setSignOutError('Could not sign you out. Please try again.');
      setSigningOut(false);
      return;
    }
      // Tear down session-scoped client state: the Socket.IO singleton would
      // otherwise stay connected (and keep receiving) after logout. The
      // instance is retained so the next login reconnects through the normal
      // `connectRealtime` path; cached signed download URLs are dropped.
      disconnectRealtime();
      clearAttachmentDownloadUrlCache();
      router.replace('/');
      router.refresh();
      setSigningOut(false);
  }

  return (
    <div ref={containerRef} className="relative">
      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Account: ${user.name}`}
        onClick={() => setOpen((current) => !current)}
        className="flex items-center gap-1.5 rounded-[8px] p-1 transition-colors hover:bg-[#F1F0EE] focus-visible:outline-2 focus-visible:outline-[#3157D5]"
      >
        <div className="relative shrink-0">
          <UserAvatar name={user.name} image={user.image} size="sm" />
          <span
            role="img"
            aria-label="Presence: online"
            className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-[#48B88A] border-2 border-white"
          />
        </div>
        <ChevronDownIcon className="h-3.5 w-3.5 text-[#737782] shrink-0" />
      </button>

      {open ? (
        <div
          ref={menuRef}
          role="menu"
          aria-label="Account"
          className="absolute right-0 top-full z-50 mt-2 w-56 bg-white border border-[#E4E2DF] rounded-[10px] shadow-[0_12px_32px_rgba(20,24,32,0.12)] p-1.5 animate-in fade-in zoom-in-95 duration-150"
        >
          <div className="px-3 py-2 border-b border-[#ECEAE7] mb-1">
            <p className="truncate text-[13px] font-semibold text-[#171A21]">{user.name}</p>
            <p className="truncate text-[12px] text-[#737782]" title={user.email}>
              {user.email}
            </p>
          </div>
          <div className="space-y-0.5">
            <Link
              href="/app/settings/profile"
              role="menuitem"
              onClick={() => setOpen(false)}
              className="w-full text-left px-2.5 py-1.5 text-[13px] text-[#171A21] hover:bg-[#F1F0EE] rounded-[6px] flex items-center gap-2 transition-colors focus-visible:outline-2 focus-visible:outline-[#3157D5]"
            >
              <PersonIcon className="h-4 w-4 text-[#737782]" />
              <span>Profile</span>
            </Link>
            <Link
              href="/app/settings"
              role="menuitem"
              onClick={() => setOpen(false)}
              className="w-full text-left px-2.5 py-1.5 text-[13px] text-[#171A21] hover:bg-[#F1F0EE] rounded-[6px] flex items-center gap-2 transition-colors focus-visible:outline-2 focus-visible:outline-[#3157D5]"
            >
              <SettingsIcon className="h-4 w-4 text-[#737782]" />
              <span>Settings</span>
            </Link>
            <div aria-hidden="true" className="my-1 border-t border-[#ECEAE7]" />
            <button
              type="button"
              role="menuitem"
              disabled={signingOut}
              aria-busy={signingOut}
              onClick={() => void handleSignOut()}
              className="w-full text-left px-2.5 py-1.5 text-[13px] text-[#C94A45] hover:bg-rose-50 rounded-[6px] flex items-center gap-2 transition-colors disabled:cursor-not-allowed disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-[#3157D5]"
            >
              <SignOutIcon className="h-4 w-4 text-[#C94A45]" />
              <span>{signingOut ? 'Signing out…' : 'Sign out'}</span>
            </button>
            {signOutError ? (
              <p role="alert" className="px-2 pb-1.5 pt-1 text-xs text-[#C94A45]">
                {signOutError}
              </p>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
