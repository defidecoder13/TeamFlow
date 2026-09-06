/**
 * Compact application top bar (Phase 1D shell chrome).
 *
 * Search and notifications are explicitly visual-only here — disabled with
 * explanatory titles, not fake controls. No website-navbar behavior.
 */

import type { SessionUser } from '../../lib/auth-guard';
import { BellIcon, SearchIcon } from './icons';
import { UserMenu } from './UserMenu';

export function TopBar({
  user,
  workspaceName,
  location,
}: {
  user: SessionUser;
  workspaceName: string | null;
  location: string;
}) {
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
        <button
          type="button"
          disabled
          title="Search arrives in a later phase"
          aria-label="Search (unavailable)"
          className="hidden h-8 items-center gap-2 rounded-md border border-stone-200 bg-stone-50 px-2.5 text-[13px] text-stone-400 disabled:cursor-not-allowed sm:flex sm:w-52"
        >
          <SearchIcon className="h-4 w-4 shrink-0" />
          <span className="truncate">Search</span>
          <kbd
            aria-hidden="true"
            className="ml-auto rounded border border-stone-200 bg-white px-1 font-sans text-[11px] text-stone-400"
          >
            ⌘K
          </kbd>
        </button>
        <button
          type="button"
          disabled
          title="Notifications arrive in a later phase"
          aria-label="Notifications (unavailable)"
          className="flex h-8 w-8 items-center justify-center rounded-md text-stone-400 disabled:cursor-not-allowed"
        >
          <BellIcon />
        </button>
        <UserMenu user={user} />
      </div>
    </header>
  );
}
