import React, { useState, useRef, useEffect } from 'react';
import { useApp } from '../../../lib/mock-context';
import { useShell } from '../../../lib/shell-context';
import { useRouter } from '../../../lib/mock-hooks/useRouter';
import { useMenuKeyboard } from '../../../lib/mock-hooks/useMenuKeyboard';
import { Avatar } from '@/components/ui/Avatar';
import { Dialog } from '../primitives/Dialog';
import {
  Search,
  Bell,
  Check,
  User,
  Settings,
  LogOut,
  ChevronDown,
  Menu,
} from 'lucide-react';

function formatNotificationTime(date: Date): string {
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(date);
}

export const TopBar: React.FC = () => {
  const { setMobileSidebarOpen } = useApp();
  const shell = useShell();
  const { session, currentUser, notifications, signOut } = shell;

  const { pathname, searchParams, push } = useRouter();

  const [searchQuery, setSearchQuery] = useState(searchParams.get('q') || '');
  const searchInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setSearchQuery(searchParams.get('q') || '');
  }, [searchParams]);

  const notifItems = notifications.state.status === 'ready' ? notifications.state.items : [];
  const unreadCount = notifItems.filter((n) => !n.readAt).length;

  const [isNotifOpen, setNotifOpen] = useState(false);
  const notifTriggerRef = useRef<HTMLButtonElement>(null);
  const notifMenu = useMenuKeyboard({
    isOpen: isNotifOpen,
    onClose: () => setNotifOpen(false),
    itemCount: notifItems.length + 1,
    triggerRef: notifTriggerRef,
  });

  const [isUserMenuOpen, setUserMenuOpen] = useState(false);
  const [isSignOutOpen, setSignOutOpen] = useState(false);
  const [isSigningOut, setSigningOut] = useState(false);
  const userTriggerRef = useRef<HTMLButtonElement>(null);
  const userMenu = useMenuKeyboard({
    isOpen: isUserMenuOpen,
    onClose: () => setUserMenuOpen(false),
    itemCount: 3,
    triggerRef: userTriggerRef,
  });

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        searchInputRef.current?.focus();
        if (pathname !== '/app/search') {
          push('/app/search');
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [pathname, push]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchQuery.trim()) {
      push(`/app/search?q=${encodeURIComponent(searchQuery.trim())}`);
    } else {
      push('/app/search');
    }
  };

  const handleSignOut = async () => {
    if (isSigningOut) {
      return;
    }
    setSigningOut(true);
    try {
      await signOut();
    } finally {
      setSigningOut(false);
    }
  };

  const userName = currentUser?.name ?? '…';
  const userEmail = currentUser?.email ?? '';
  const userImage = currentUser?.image ?? null;
  const presenceLabel = session.status === 'authenticated' ? 'online' : 'offline';

  return (
    <header className="h-[52px] bg-white border-b border-[#E4E2DF] px-4 sm:px-6 flex items-center justify-between gap-4 z-30 shrink-0">
      {/* Mobile drawer toggle */}
      <button
        type="button"
        onClick={() => setMobileSidebarOpen(true)}
        className="md:hidden p-1.5 text-[#737782] hover:text-[#171A21] hover:bg-[#F1F0EE] rounded-[6px] transition-colors"
        aria-label="Open sidebar menu"
      >
        <Menu className="w-5 h-5" />
      </button>

      {/* Center Search Bar matching visual reference */}
      <div className="flex-1 max-w-[420px]">
        <form onSubmit={handleSearchSubmit} className="relative group">
          <label htmlFor="global-search-input" className="sr-only">
            Search messages, channels, and people
          </label>
          <Search className="w-4 h-4 text-[#737782] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none group-focus-within:text-[#3157D5] transition-colors" />
          <input
            ref={searchInputRef}
            id="global-search-input"
            type="search"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search messages, channels, and people..."
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
        {/* Notifications Popover */}
        <div className="relative">
          <button
            ref={notifTriggerRef}
            type="button"
            onClick={() => setNotifOpen(!isNotifOpen)}
            className="relative p-2 rounded-[8px] text-[#737782] hover:text-[#171A21] hover:bg-[#F1F0EE] transition-colors focus-visible:ring-2 focus-visible:ring-[#3157D5]"
            aria-label={`Notifications${unreadCount > 0 ? `, ${unreadCount} unread` : ''}`}
            aria-expanded={isNotifOpen}
            aria-haspopup="true"
          >
            <Bell className="w-4 h-4" />
            {unreadCount > 0 && (
              <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-[#EE6A62] ring-2 ring-white" />
            )}
          </button>

          {isNotifOpen && (
            <div
              ref={notifMenu.menuRef}
              onKeyDown={notifMenu.handleKeyDown}
              role="region"
              aria-label="Notifications"
              className="absolute right-0 top-11 w-80 sm:w-88 bg-white border border-[#E4E2DF] rounded-[12px] shadow-[0_12px_36px_rgba(20,24,32,0.12)] p-0 z-50 animate-in fade-in zoom-in-95 duration-150 overflow-hidden"
            >
              <div className="flex items-center justify-between p-3.5 border-b border-[#E4E2DF] bg-[#FAF9F8]">
                <div className="flex items-center gap-2">
                  <h3 className="text-[13px] font-semibold text-[#171A21]">Notifications</h3>
                  {unreadCount > 0 && (
                    <span className="bg-[#171A21] text-white text-[10px] font-semibold px-1.5 py-0.2 rounded-full tabular-nums">
                      {unreadCount}
                    </span>
                  )}
                </div>
                {unreadCount > 0 && (
                  <button
                    type="button"
                    onClick={() => notifications.markAllRead()}
                    className="text-[12px] font-medium text-[#3157D5] hover:underline"
                  >
                    Mark all read
                  </button>
                )}
              </div>

              <div className="max-h-72 overflow-y-auto divide-y divide-[#ECEAE7]" role="list">
                {notifications.state.status === 'loading' ? (
                  <div className="p-6 text-center text-[#737782] text-[13px]">
                    Loading notifications…
                  </div>
                ) : notifications.state.status === 'error' ? (
                  <div className="p-6 text-center text-[#C94A45] text-[13px]">
                    {notifications.state.message}
                  </div>
                ) : notifItems.length === 0 ? (
                  <div className="p-6 text-center text-[#737782] text-[13px]">
                    No notifications right now
                  </div>
                ) : (
                  notifItems.map((n) => (
                    <div
                      key={n.id}
                      role="listitem"
                      onClick={() => notifications.markRead(n.id)}
                      className={`p-3 text-[13px] cursor-pointer hover:bg-[#FAF9F8] transition-colors flex items-start gap-2.5 ${
                        !n.readAt ? 'bg-[#EEF2FF]/40' : ''
                      }`}
                    >
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-[#171A21] leading-snug">
                          {n.actorName}
                        </p>
                        <p className="text-[#4F5360] text-[12px] mt-0.5 line-clamp-2">
                          {n.channelName
                            ? `In #${n.channelName}`
                            : n.conversationName
                              ? `In ${n.conversationName}`
                              : n.type === 'MENTION'
                                ? 'Mentioned you'
                                : 'New activity'}
                        </p>
                        <span className="text-[11px] text-[#737782] mt-1 block tabular-nums">
                          {formatNotificationTime(n.createdAt)}
                        </span>
                      </div>
                      {!n.readAt && (
                        <div
                          className="w-2 h-2 rounded-full bg-[#3157D5] shrink-0 mt-1"
                          title="Unread"
                        />
                      )}
                    </div>
                  ))
                )}
              </div>
            </div>
          )}
        </div>

        {/* User Profile Pill Trigger matching Reference Image */}
        <div className="relative">
          <button
            ref={userTriggerRef}
            type="button"
            onClick={() => setUserMenuOpen(!isUserMenuOpen)}
            className="flex items-center gap-2.5 p-1 pl-1.5 pr-2 rounded-[8px] hover:bg-[#F1F0EE] transition-colors focus-visible:ring-2 focus-visible:ring-[#3157D5] text-left"
            aria-expanded={isUserMenuOpen}
            aria-haspopup="menu"
          >
            {/* Avatar with presence status dot */}
            <Avatar
              name={userName}
              src={userImage}
              size={32}
              presence={presenceLabel}
              showPresence
            />

            {/* Name + Status */}
            <div className="hidden sm:block min-w-0 pr-1">
              <p className="text-[13px] font-semibold text-[#171A21] leading-tight truncate">
                {userName}
              </p>
              <p className="text-[11px] text-[#48B88A] font-medium leading-none mt-0.5 flex items-center gap-1">
                <span>●</span>
                <span className="capitalize">{presenceLabel}</span>
              </p>
            </div>

            <ChevronDown className="w-3.5 h-3.5 text-[#737782] shrink-0" />
          </button>

          {/* User Popover Menu */}
          {isUserMenuOpen && (
            <div
              ref={userMenu.menuRef}
              onKeyDown={userMenu.handleKeyDown}
              role="menu"
              aria-label="User profile options"
              className="absolute right-0 top-11 w-56 bg-white border border-[#E4E2DF] rounded-[10px] shadow-[0_12px_32px_rgba(20,24,32,0.12)] p-1.5 z-50 animate-in fade-in zoom-in-95 duration-150"
            >
              <div className="px-3 py-2 border-b border-[#ECEAE7] mb-1">
                <p className="text-[13px] font-semibold text-[#171A21] truncate">{userName}</p>
                <p className="text-[11px] text-[#737782] truncate">{userEmail}</p>
              </div>

              <button
                role="menuitem"
                tabIndex={userMenu.activeIndex === 0 ? 0 : -1}
                onClick={() => {
                  setUserMenuOpen(false);
                  push('/app/settings/profile');
                }}
                className="w-full text-left px-2.5 py-1.5 text-[13px] text-[#171A21] hover:bg-[#F1F0EE] rounded-[6px] flex items-center gap-2 transition-colors"
              >
                <User className="w-4 h-4 text-[#737782]" />
                <span>Profile & status</span>
              </button>

              <button
                role="menuitem"
                tabIndex={userMenu.activeIndex === 1 ? 0 : -1}
                onClick={() => {
                  setUserMenuOpen(false);
                  push('/app/settings');
                }}
                className="w-full text-left px-2.5 py-1.5 text-[13px] text-[#171A21] hover:bg-[#F1F0EE] rounded-[6px] flex items-center gap-2 transition-colors"
              >
                <Settings className="w-4 h-4 text-[#737782]" />
                <span>Preferences</span>
              </button>

              <div className="my-1 border-t border-[#ECEAE7]" />

              <button
                role="menuitem"
                tabIndex={userMenu.activeIndex === 2 ? 0 : -1}
                onClick={() => {
                  setUserMenuOpen(false);
                  setSignOutOpen(true);
                }}
                className="w-full text-left px-2.5 py-1.5 text-[13px] text-[#C94A45] hover:bg-red-50 rounded-[6px] flex items-center gap-2 transition-colors"
              >
                <LogOut className="w-4 h-4 text-[#C94A45]" />
                <span>Sign out</span>
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Sign-out confirmation */}
      <Dialog
        isOpen={isSignOutOpen}
        onClose={() => {
          if (!isSigningOut) {
            setSignOutOpen(false);
          }
        }}
        title="Sign out of TeamFlow?"
        description="You'll be signed out on this device and returned to the home page."
        role="alertdialog"
        maxWidth="sm"
      >
        <div className="flex items-center justify-end gap-2">
          <button
            type="button"
            disabled={isSigningOut}
            onClick={() => setSignOutOpen(false)}
            className="rounded-[8px] px-4 py-2 text-[13px] font-medium text-[#171A21] transition-colors hover:bg-[#F1F0EE] disabled:cursor-not-allowed disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-[#3157D5]"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={isSigningOut}
            aria-busy={isSigningOut}
            onClick={() => void handleSignOut()}
            className="rounded-[8px] bg-[#C94A45] px-4 py-2 text-[13px] font-medium text-white transition-colors hover:bg-[#A93A35] disabled:cursor-not-allowed disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#C94A45] active:scale-[0.98]"
          >
            {isSigningOut ? 'Signing out…' : 'Sign out'}
          </button>
        </div>
      </Dialog>
    </header>
  );
};
