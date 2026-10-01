import React, { useState, useRef, useEffect } from 'react';
import { useApp } from '../../context/AppContext';
import { useRouter } from '../../hooks/useRouter';
import { useMenuKeyboard } from '../../hooks/useMenuKeyboard';
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

export const TopBar: React.FC = () => {
  const {
    currentUser,
    notifications,
    unreadNotificationCount,
    markNotificationAsRead,
    markAllNotificationsAsRead,
    setMobileSidebarOpen,
    showToast,
  } = useApp();

  const { pathname, searchParams, push } = useRouter();

  // Search state
  const [searchQuery, setSearchQuery] = useState(searchParams.get('q') || '');
  const searchInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setSearchQuery(searchParams.get('q') || '');
  }, [searchParams]);

  // Notifications popover state
  const [isNotifOpen, setNotifOpen] = useState(false);
  const notifTriggerRef = useRef<HTMLButtonElement>(null);
  const notifMenu = useMenuKeyboard({
    isOpen: isNotifOpen,
    onClose: () => setNotifOpen(false),
    itemCount: notifications.length + 1,
    triggerRef: notifTriggerRef,
  });

  // User menu popover state
  const [isUserMenuOpen, setUserMenuOpen] = useState(false);
  const userTriggerRef = useRef<HTMLButtonElement>(null);
  const userMenu = useMenuKeyboard({
    isOpen: isUserMenuOpen,
    onClose: () => setUserMenuOpen(false),
    itemCount: 3,
    triggerRef: userTriggerRef,
  });

  // Global ⌘K / Ctrl+K shortcut to focus search
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

  const handleSignOut = () => {
    setUserMenuOpen(false);
    showToast('Signed out of session. Session preserved in memory.', 'info');
  };

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
            aria-label={`Notifications${unreadNotificationCount > 0 ? `, ${unreadNotificationCount} unread` : ''}`}
            aria-expanded={isNotifOpen}
            aria-haspopup="true"
          >
            <Bell className="w-4 h-4" />
            {unreadNotificationCount > 0 && (
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
                  {unreadNotificationCount > 0 && (
                    <span className="bg-[#171A21] text-white text-[10px] font-semibold px-1.5 py-0.2 rounded-full tabular-nums">
                      {unreadNotificationCount}
                    </span>
                  )}
                </div>
                {unreadNotificationCount > 0 && (
                  <button
                    type="button"
                    onClick={markAllNotificationsAsRead}
                    className="text-[12px] font-medium text-[#3157D5] hover:underline"
                  >
                    Mark all read
                  </button>
                )}
              </div>

              <div className="max-h-72 overflow-y-auto divide-y divide-[#ECEAE7]" role="list">
                {notifications.length === 0 ? (
                  <div className="p-6 text-center text-[#737782] text-[13px]">
                    No notifications right now
                  </div>
                ) : (
                  notifications.map((n) => (
                    <div
                      key={n.id}
                      role="listitem"
                      onClick={() => markNotificationAsRead(n.id)}
                      className={`p-3 text-[13px] cursor-pointer hover:bg-[#FAF9F8] transition-colors flex items-start gap-2.5 ${
                        !n.isRead ? 'bg-[#EEF2FF]/40' : ''
                      }`}
                    >
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-[#171A21] leading-snug">{n.title}</p>
                        <p className="text-[#4F5360] text-[12px] mt-0.5 line-clamp-2">{n.body}</p>
                        <span className="text-[11px] text-[#737782] mt-1 block tabular-nums">
                          {n.createdAt}
                        </span>
                      </div>
                      {!n.isRead && (
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
            <div className="relative shrink-0">
              <img
                src={currentUser.avatarUrl}
                alt=""
                className="w-7 h-7 rounded-full object-cover bg-[#ECEAE7]"
              />
              <span
                role="img"
                aria-label={`Presence: ${currentUser.presence}`}
                className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-[#48B88A] border-2 border-white"
              />
            </div>

            {/* Name + Status */}
            <div className="hidden sm:block min-w-0 pr-1">
              <p className="text-[13px] font-semibold text-[#171A21] leading-tight truncate">
                {currentUser.name}
              </p>
              <p className="text-[11px] text-[#48B88A] font-medium leading-none mt-0.5 flex items-center gap-1">
                <span>●</span>
                <span className="capitalize">{currentUser.presence}</span>
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
                <p className="text-[13px] font-semibold text-[#171A21] truncate">{currentUser.name}</p>
                <p className="text-[11px] text-[#737782] truncate">{currentUser.email}</p>
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
                onClick={handleSignOut}
                className="w-full text-left px-2.5 py-1.5 text-[13px] text-[#C94A45] hover:bg-red-50 rounded-[6px] flex items-center gap-2 transition-colors"
              >
                <LogOut className="w-4 h-4 text-[#C94A45]" />
                <span>Sign out</span>
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
};
