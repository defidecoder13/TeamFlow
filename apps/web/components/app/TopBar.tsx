/**
 * Application top bar — Stitch "Workspace Home — TeamFlow" reference.
 *
 * Live reference: Stitch project projects/8727821180897355571
 * ("Workspace Home — TeamFlow" screen). h-14 white bar: workspace / location
 * breadcrumb, real search input (submits to the existing /app/search route
 * with ?q=, ⌘K/Ctrl+K focuses it), emerald Active badge, real notification
 * bell, and user menu. No fake controls: the bell and menu are the real
 * notification center and session menu.
 */

'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { SessionUser } from '../../lib/auth-guard';
import { Search, Menu } from 'lucide-react';
import { NotificationBell } from '../notifications/NotificationCenter';
import { UserMenu } from './UserMenu';

export function TopBar({
  user,
  workspaceName,
  workspaceId,
  location,
  onMenuClick,
}: {
  user: SessionUser;
  workspaceName: string | null;
  workspaceId?: string | null;
  location: string;
  /** Opens the mobile navigation drawer. Rendered only when provided. */
  onMenuClick?: () => void;
}) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState('');

  const submitSearch = useCallback(
    (event: React.FormEvent) => {
      event.preventDefault();
      const trimmed = query.trim();
      router.push(trimmed ? `/app/search?q=${encodeURIComponent(trimmed)}` : '/app/search');
    },
    [query, router],
  );

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
      const input = inputRef.current;
      if (!input) {
        return;
      }
      event.preventDefault();
      input.focus();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  return (
    <header className="flex h-[52px] shrink-0 items-center justify-between gap-4 border-b border-[#E4E2DF] bg-white px-4 sm:px-6 z-30">
      <div className="flex items-center gap-2.5 min-w-0">
        {onMenuClick ? (
          <button
            type="button"
            id="mobile-nav-trigger"
            onClick={onMenuClick}
            aria-label="Open navigation"
            title="Open navigation"
            className="p-1.5 text-[#737782] hover:text-[#171A21] hover:bg-[#F1F0EE] rounded-[6px] transition-colors focus-visible:ring-2 focus-visible:ring-[#3157D5] lg:hidden shrink-0"
          >
            <Menu className="w-5 h-5" />
          </button>
        ) : null}

        <nav aria-label="Breadcrumb" className="min-w-0">
          <p className="truncate text-[13px] text-[#737782]">
            <span className="font-medium text-[#171A21]">{workspaceName ?? 'TeamFlow'}</span>
            <span aria-hidden="true" className="mx-1.5 text-[#A5A29D]">/</span>
            <span className="font-medium text-[#4F5360]">{location}</span>
          </p>
        </nav>
      </div>

      {/* Center Search Bar matching visual reference */}
      <div className="flex-1 max-w-[420px]">
        <form
          role="search"
          aria-label="Workspace search"
          onSubmit={submitSearch}
          className="relative group"
        >
          <label htmlFor="global-search-input" className="sr-only">
            Search messages, channels, and people
          </label>
          <Search className="w-4 h-4 text-[#737782] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none group-focus-within:text-[#3157D5] transition-colors" />
          <input
            ref={inputRef}
            id="global-search-input"
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search messages, channels, and people..."
            aria-label="Search"
            autoComplete="off"
            className="w-full pl-9 pr-12 py-1.5 text-[13px] bg-[#FAF9F8] border border-[#E4E2DF] hover:border-[#D2D0CC] focus:border-[#3157D5] focus:bg-white rounded-[8px] outline-none transition-all text-[#171A21] placeholder:text-[#737782] focus:ring-1 focus:ring-[#EEF2FF]"
          />
          <div className="absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none">
            <kbd className="px-1.5 py-0.5 text-[10px] font-medium text-[#737782] bg-white border border-[#E4E2DF] rounded-[4px] shadow-2xs">
              ⌘ K
            </kbd>
          </div>
        </form>
      </div>

      {/* Right zone: Notification Bell + User Profile */}
      <div className="flex items-center gap-3 shrink-0">
        <NotificationBell workspaceId={workspaceId ?? null} />
        <UserMenu user={user} />
      </div>
    </header>
  );
}
