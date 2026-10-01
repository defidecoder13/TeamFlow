'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useNotifications, type NotificationsState } from '../../lib/use-notifications';
import type { NotificationFilter, NotificationItem } from '../../lib/notifications';
import { NOTIFICATION_TYPE_FILTERS, searchNotificationUrl } from '../../lib/notifications';
import { useWorkspaceChannels } from '../../lib/use-workspace-channels';
import { BellIcon } from '../app/icons';
import { NotificationItem as NotificationRow } from './NotificationItem';

type NotificationsApi = ReturnType<typeof useNotifications>;

function resolveUrl(item: NotificationItem, channelSlugById: Map<string, string>): string | null {
  return searchNotificationUrl(item, channelSlugById);
}

function Skeleton() {
  return (
    <div className="flex flex-col gap-2 p-2" role="status" aria-label="Loading notifications">
      {[0, 1, 2].map((index) => (
        <div key={index} className="flex animate-pulse items-start gap-3 px-3 py-3">
          <div className="h-8 w-8 shrink-0 rounded-full bg-[#e3e1ec]" />
          <div className="flex-1 space-y-2">
            <div className="h-3 w-2/3 rounded bg-[#e3e1ec]" />
            <div className="h-3 w-full rounded bg-[#f4f2fd]" />
          </div>
        </div>
      ))}
      <span className="sr-only">Loading notifications…</span>
    </div>
  );
}

function Empty() {
  return (
    <div className="flex min-h-[200px] flex-col items-center justify-center gap-2 px-6 py-10 text-center">
      <p className="text-[14px] font-medium text-[#47464b]">You&apos;re all caught up</p>
      <p className="max-w-xs text-[13px] leading-relaxed text-[#47464b]">
        Mentions, direct messages, and thread replies will show up here.
      </p>
    </div>
  );
}

function FilterBar({
  filter,
  onFilterChange,
}: {
  filter: NotificationFilter;
  onFilterChange: (filter: NotificationFilter) => void;
}) {
  const segmentedButton = (active: boolean) =>
    [
      'rounded-md border px-2.5 py-1 text-[12px] font-medium transition-colors focus-visible:outline-2 focus-visible:outline-[#1f44e4]',
      active
        ? 'border-[#1a1b22] bg-[#f4f2fd] text-[#1a1b22]'
        : 'border-transparent text-[#47464b] hover:border-[#e3e1ec] hover:bg-white hover:text-[#1a1b22]',
    ].join(' ');
  return (
    <div className="flex items-center gap-1.5 px-1 pb-1">
      <div role="group" aria-label="Read status filter" className="flex items-center gap-0.5">
        <button
          type="button"
          aria-pressed={!filter.unreadOnly}
          onClick={() => onFilterChange({ ...filter, unreadOnly: false })}
          className={segmentedButton(!filter.unreadOnly)}
        >
          All
        </button>
        <button
          type="button"
          aria-pressed={filter.unreadOnly}
          onClick={() => onFilterChange({ ...filter, unreadOnly: true })}
          className={segmentedButton(filter.unreadOnly)}
        >
          Unread
        </button>
      </div>
      <label htmlFor="notification-type-filter" className="sr-only">
        Filter by notification type
      </label>
      <select
        id="notification-type-filter"
        value={filter.type ?? ''}
        onChange={(event) =>
          onFilterChange({
            ...filter,
            type: (event.target.value || undefined) as NotificationFilter['type'],
          })
        }
        className="h-7 min-w-0 flex-1 truncate rounded-md border border-[#e3e1ec] bg-white px-1.5 text-[12px] font-medium text-[#47464b] outline-none transition-colors hover:border-[#c8c5cb] focus:border-[#1f44e4] focus-visible:outline-2 focus-visible:outline-[#1f44e4]"
      >
        <option value="">All types</option>
        {NOTIFICATION_TYPE_FILTERS.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
  );
}

function filteredEmptyCopy(filter: NotificationFilter): {
  title: string;
  body: string;
} {
  if (filter.unreadOnly && !filter.type) {
    return {
      title: 'No unread notifications',
      body: 'New unread mentions, messages, and replies will appear here.',
    };
  }
  const typeLabel = NOTIFICATION_TYPE_FILTERS.find(
    (option) => option.value === filter.type,
  )?.label.toLowerCase();
  if (typeLabel) {
    return {
      title: `No ${typeLabel} notifications`,
      body: 'Try a different filter, or check back later.',
    };
  }
  return {
    title: 'No notifications',
    body: 'Try a different filter, or check back later.',
  };
}

export function NotificationCenter({
  notifications,
  channelSlugById,
  onNavigate,
  filter,
  onFilterChange,
}: {
  notifications: NotificationsApi;
  /** channelId → slug lookup from the workspace channel list. */
  channelSlugById: Map<string, string>;
  onNavigate: (url: string) => void;
  /** Active backend filter. Omitted = unfiltered list, no filter UI. */
  filter?: NotificationFilter;
  onFilterChange?: (filter: NotificationFilter) => void;
}) {
  const {
    state,
    hasUnread,
    isLoadingMore,
    loadMoreError,
    loadMore,
    retry,
    markRead,
    markAllRead,
    actionError,
  } = notifications;

  const handleOpen = (item: NotificationItem) => {
    const url = resolveUrl(item, channelSlugById);
    if (url) {
      onNavigate(url);
    }
    if (item.readAt === null) {
      markRead(item.id);
    }
  };

  const renderState = (current: NotificationsState) => {
    if (current.status === 'loading' || current.status === 'idle') {
      return <Skeleton />;
    }
    if (current.status === 'unauthenticated') {
      return (
        <div
          className="flex min-h-[200px] flex-col items-center justify-center gap-2 px-6 py-10 text-center"
          role="alert"
        >
          <p className="text-[14px] font-medium text-[#47464b]">Session expired</p>
          <p className="text-[13px] text-[#47464b]">Please sign in again to see notifications.</p>
        </div>
      );
    }
    if (current.status === 'error') {
      return (
        <div className="flex flex-col gap-2">
          {filter && onFilterChange ? (
            <FilterBar filter={filter} onFilterChange={onFilterChange} />
          ) : null}
          <div
            className="flex min-h-[200px] flex-col items-center justify-center gap-3 px-6 py-10 text-center"
            role="alert"
          >
            <p className="text-[14px] font-medium text-[#47464b]">
              Couldn&apos;t load notifications
            </p>
            <p className="max-w-xs text-[13px] text-[#47464b]">{current.message}</p>
            <button
              type="button"
              onClick={retry}
              className="rounded-lg bg-[#000000] px-4 py-2 text-[13px] font-medium text-white press hover:bg-[#1a1b22] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1f44e4] active:scale-[0.98] motion-reduce:active:scale-100"
            >
              Try again
            </button>
          </div>
        </div>
      );
    }
    if (current.items.length === 0) {
      if (!filter) {
        return <Empty />;
      }
      const copy = filteredEmptyCopy(filter);
      return (
        <div className="flex flex-col gap-2">
          {onFilterChange ? <FilterBar filter={filter} onFilterChange={onFilterChange} /> : null}
          <div className="flex min-h-[160px] flex-col items-center justify-center gap-2 px-6 py-10 text-center">
            <p className="text-[14px] font-medium text-[#47464b]">{copy.title}</p>
            <p className="max-w-xs text-[13px] leading-relaxed text-[#47464b]">{copy.body}</p>
            {onFilterChange ? (
              <button
                type="button"
                onClick={() => onFilterChange({ unreadOnly: false })}
                className="mt-1 rounded-lg border border-[#e3e1ec] bg-white px-3.5 py-1.5 text-[13px] font-medium text-[#1a1b22] transition-colors hover:bg-[#f4f2fd] focus-visible:outline-2 focus-visible:outline-[#1f44e4]"
              >
                Show all
              </button>
            ) : null}
          </div>
        </div>
      );
    }
    return (
      <div className="flex flex-col gap-2">
        {filter && onFilterChange ? (
          <FilterBar filter={filter} onFilterChange={onFilterChange} />
        ) : null}
        <div className="flex items-center justify-between px-1">
          <p role="status" className="text-[12px] tabular-nums text-[#47464b]">
            {current.items.length} notification{current.items.length === 1 ? '' : 's'}
            {current.hasMore ? ' (more available below)' : ''}
          </p>
          {hasUnread && (
            <button
              type="button"
              onClick={markAllRead}
              className="rounded-md px-2 py-1 text-[12px] font-medium text-[#47464b] transition-colors hover:bg-[#f4f2fd] hover:text-[#1a1b22] focus-visible:outline-2 focus-visible:outline-[#1f44e4]"
            >
              Mark all as read
            </button>
          )}
        </div>
        {actionError && (
          <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-[12px] text-red-700">
            {actionError}
          </p>
        )}
        <ul className="flex flex-col gap-1" aria-label="Notifications">
          {current.items.map((item) => (
            <NotificationRow
              key={item.id}
              item={item}
              navigable={resolveUrl(item, channelSlugById) !== null}
              onOpen={handleOpen}
              onMarkRead={(row) => markRead(row.id)}
            />
          ))}
        </ul>
        {current.hasMore && (
          <div className="flex flex-col items-center gap-2 py-2">
            <button
              type="button"
              onClick={loadMore}
              disabled={isLoadingMore}
              aria-busy={isLoadingMore}
              className="rounded-lg border border-[#e3e1ec] bg-white px-4 py-2 text-[13px] font-medium text-[#47464b] transition-colors hover:bg-[#f4f2fd] focus-visible:outline-2 focus-visible:outline-[#1f44e4] disabled:cursor-wait disabled:opacity-60"
            >
              {isLoadingMore ? 'Loading…' : 'Load more'}
            </button>
            {loadMoreError && (
              <div className="flex items-center gap-2 text-[12px] text-red-700" role="alert">
                <span>{loadMoreError}</span>
                <button
                  type="button"
                  onClick={loadMore}
                  className="rounded font-medium underline transition-colors hover:text-red-900 focus-visible:outline-2 focus-visible:outline-red-600"
                >
                  Retry
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    );
  };

  return <>{renderState(state)}</>;
}

/**
 * TopBar bell: single hook instance drives both the unread dot and the
 * dropdown panel (one fetch, one socket subscription set). The dot derives
 * from loaded data only — no exact counts, since only the current page is
 * loaded. Escape closes and refocuses the trigger; outside pointer closes.
 */
function NotificationPanel({
  workspaceId,
  channelSlugById,
  filter,
  onFilterChange,
  onNavigate,
}: {
  workspaceId: string;
  channelSlugById: Map<string, string>;
  filter: NotificationFilter;
  onFilterChange: (filter: NotificationFilter) => void;
  onNavigate: (url: string) => void;
}) {
  // Mounted only while the popover is open, so the filtered list is always
  // freshly fetched. The bell dot below uses its own unfiltered instance.
  const notifications = useNotifications(workspaceId, filter);
  return (
    <NotificationCenter
      notifications={notifications}
      channelSlugById={channelSlugById}
      onNavigate={onNavigate}
      filter={filter}
      onFilterChange={onFilterChange}
    />
  );
}

export function NotificationBell({ workspaceId }: { workspaceId: string | null }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState<NotificationFilter>({ unreadOnly: false });
  const panelRef = useRef<HTMLDivElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const notifications = useNotifications(workspaceId);
  const channelsState = useWorkspaceChannels(workspaceId);

  // Filter applies to the popover list only; reset it when the workspace
  // changes so a stale filter never follows the user elsewhere.
  useEffect(() => {
    setFilter({ unreadOnly: false });
  }, [workspaceId]);

  useEffect(() => {
    if (!open) {
      return;
    }
    // Move focus into the panel on open so keyboard users land in the list.
    dialogRef.current?.focus({ preventScroll: true });
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false);
        buttonRef.current?.focus();
      }
    };
    const onPointerDown = (event: PointerEvent) => {
      if (panelRef.current && !panelRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('pointerdown', onPointerDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('pointerdown', onPointerDown);
    };
  }, [open]);

  const channelSlugById = new Map<string, string>();
  if (channelsState.state.status === 'ready') {
    for (const channel of channelsState.state.channels) {
      channelSlugById.set(channel.id, channel.slug);
    }
  }

  const showDot =
    !open &&
    notifications.state.status === 'ready' &&
    notifications.state.items.some((item) => item.readAt === null);

  return (
    <div className="relative" ref={panelRef}>
      <button
        type="button"
        ref={buttonRef}
        onClick={() => setOpen((value) => !value)}
        aria-label={showDot ? 'Notifications, has unread' : 'Notifications'}
        aria-expanded={open}
        aria-haspopup="dialog"
        title="Notifications"
        className="relative p-2 rounded-[8px] text-[#737782] hover:text-[#171A21] hover:bg-[#F1F0EE] transition-colors focus-visible:ring-2 focus-visible:ring-[#3157D5] disabled:cursor-not-allowed disabled:opacity-50"
        disabled={!workspaceId}
      >
        <BellIcon className="h-4 w-4" />
        {showDot && (
          <span
            aria-hidden="true"
            className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-[#EE6A62] ring-2 ring-white"
          />
        )}
      </button>
      {open && workspaceId && (
        <div
          ref={dialogRef}
          role="dialog"
          aria-label="Notifications"
          tabIndex={-1}
          className="absolute right-0 z-50 mt-2 max-h-[70vh] w-[min(24rem,calc(100vw-2rem))] origin-top-right overflow-y-auto rounded-[12px] border border-[#E4E2DF] bg-white p-3 shadow-[0_12px_36px_rgba(20,24,32,0.12)] outline-none transition-[opacity,scale] duration-150 ease-out-expo starting:scale-[0.97] starting:opacity-0"
        >
          <NotificationPanel
            workspaceId={workspaceId}
            channelSlugById={channelSlugById}
            filter={filter}
            onFilterChange={setFilter}
            onNavigate={(url) => {
              setOpen(false);
              router.push(url);
            }}
          />
        </div>
      )}
    </div>
  );
}
