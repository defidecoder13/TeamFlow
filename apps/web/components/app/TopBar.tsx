/**
 * Compact application top bar (Phase 1D shell chrome, search enabled 4G.4).
 *
 * The search control links to `/app/search`; ⌘K/Ctrl+K focuses search from
 * anywhere except text inputs. Notifications remain an explicit visual-only
 * placeholder (not a fake control).
 */

'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import type { SessionUser } from '../../lib/auth-guard';
import { SearchIcon } from './icons';
import { NotificationBell } from '../notifications/NotificationCenter';
import { UserMenu } from './UserMenu';

export function TopBar({
  user,
  workspaceName,
  workspaceId,
  location,
}: {
  user: SessionUser;
  workspaceName: string | null;
  workspaceId?: string | null;
  location: string;
}) {
  const router = useRouter();

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey) || event.key.toLowerCase() !== 'k') {
        return;
      }
      const target = event.target;
      if (
        target instanceof HTMLElement &&
        (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)
      ) {
        return;
      }
      event.preventDefault();
      router.push('/app/search');
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [router]);

  return (
    <header className="flex h-13 shrink-0 items-center gap-3 border-b border-stone-200 bg-white px-4 sm:px-6">
      <nav aria-label="Breadcrumb" className="min-w-0 flex-1">
        <p className="truncate text-[13px] text-stone-500">
          <span className="font-medium text-stone-700">{workspaceName ?? 'TeamFlow'}</span>{' '}
          <span aria-hidden="true" className="mx-1 text-stone-300">
            /
          </span>{' '}
          <span className="font-medium text-stone-900">{location}</span>
        </p>
      </nav>

      <div className="ml-auto flex items-center gap-1.5">
        <Link
          href="/app/search"
          aria-label="Search"
          title="Search (⌘K)"
          className="hidden h-8 items-center gap-2 rounded-md border border-stone-200 bg-stone-50 px-2.5 text-[13px] text-stone-500 transition-colors hover:bg-stone-100 hover:text-stone-800 focus:outline-none focus:ring-1 focus:ring-stone-400 sm:flex sm:w-52"
        >
          <SearchIcon className="h-4 w-4 shrink-0" />
          <span className="truncate">Search</span>
          <kbd
            aria-hidden="true"
            className="ml-auto rounded border border-stone-200 bg-white px-1 font-sans text-[11px] text-stone-400"
          >
            ⌘K
          </kbd>
        </Link>
        <NotificationBell workspaceId={workspaceId ?? null} />
        <UserMenu user={user} />
      </div>
    </header>
  );
}
