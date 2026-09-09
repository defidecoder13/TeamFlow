'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useNotifications, type NotificationsState } from '../../lib/use-notifications';
import type { NotificationItem } from '../../lib/notifications';
import { searchNotificationUrl } from '../../lib/notifications';
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
          <div className="h-8 w-8 shrink-0 rounded-full bg-stone-200" />
          <div className="flex-1 space-y-2">
            <div className="h-3 w-2/3 rounded bg-stone-200" />
            <div className="h-3 w-full rounded bg-stone-100" />
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
      <p className="text-[14px] font-medium text-stone-700">You&apos;re all caught up</p>
      <p className="max-w-xs text-[13px] leading-relaxed text-stone-500">
        Mentions, direct messages, and thread replies will show up here.
      </p>
    </div>
  );
}

export function NotificationCenter({
  notifications,
  channelSlugById,
  onNavigate,
}: {
  notifications: NotificationsApi;
  /** channelId → slug lookup from the workspace channel list. */
  channelSlugById: Map<string, string>;
  onNavigate: (url: string) => void;
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
          <p className="text-[14px] font-medium text-stone-700">Session expired</p>
          <p className="text-[13px] text-stone-500">Please sign in again to see notifications.</p>
        </div>
      );
    }
    if (current.status === 'error') {
      return (
        <div
          className="flex min-h-[200px] flex-col items-center justify-center gap-3 px-6 py-10 text-center"
          role="alert"
        >
          <p className="text-[14px] font-medium text-stone-700">Couldn&apos;t load notifications</p>
          <p className="max-w-xs text-[13px] text-stone-500">{current.message}</p>
          <button
            type="button"
            onClick={retry}
            className="rounded-lg bg-stone-900 px-4 py-2 text-[13px] font-medium text-white transition-colors hover:bg-stone-700 focus:outline-none focus:ring-2 focus:ring-stone-400"
          >
            Retry
          </button>
        </div>
      );
    }
    if (current.items.length === 0) {
      return <Empty />;
    }
    return (
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between px-1">
          <p role="status" className="text-[12px] text-stone-500">
            {current.items.length} notification{current.items.length === 1 ? '' : 's'}
            {current.hasMore ? ' (more available below)' : ''}
          </p>
          {hasUnread && (
            <button
              type="button"
              onClick={markAllRead}
              className="rounded-md px-2 py-1 text-[12px] font-medium text-stone-600 transition-colors hover:bg-stone-100 hover:text-stone-900 focus:outline-none focus:ring-1 focus:ring-stone-400"
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
            />
          ))}
        </ul>
        {current.hasMore && (
          <div className="flex flex-col items-center gap-2 py-2">
            <button
              type="button"
              onClick={loadMore}
              disabled={isLoadingMore}
              className="rounded-lg border border-stone-200 bg-white px-4 py-2 text-[13px] font-medium text-stone-700 transition-colors hover:bg-stone-50 focus:outline-none focus:ring-2 focus:ring-stone-400 disabled:cursor-wait disabled:opacity-60"
            >
              {isLoadingMore ? 'Loading…' : 'Load older'}
            </button>
            {loadMoreError && (
              <div className="flex items-center gap-2 text-[12px] text-red-700" role="alert">
                <span>{loadMoreError}</span>
                <button
                  type="button"
                  onClick={loadMore}
                  className="font-medium underline hover:text-red-900"
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
export function NotificationBell({ workspaceId }: { workspaceId: string | null }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const notifications = useNotifications(workspaceId);
  const channelsState = useWorkspaceChannels(workspaceId);

  useEffect(() => {
    if (!open) {
      return;
    }
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
        className="relative flex h-8 w-8 items-center justify-center rounded-md text-stone-500 transition-colors hover:bg-stone-100 hover:text-stone-800 focus:outline-none focus:ring-1 focus:ring-stone-400 disabled:cursor-not-allowed disabled:opacity-50"
        disabled={!workspaceId}
      >
        <BellIcon className="h-[18px] w-[18px]" />
        {showDot && (
          <span
            aria-hidden="true"
            className="absolute right-1.5 top-1.5 inline-block h-2 w-2 rounded-full bg-stone-900 ring-2 ring-white"
          />
        )}
      </button>
      {open && workspaceId && (
        <div
          role="dialog"
          aria-label="Notifications"
          className="absolute right-0 z-50 mt-2 max-h-[70vh] w-[min(24rem,calc(100vw-2rem))] overflow-y-auto rounded-xl border border-stone-200 bg-white p-3 shadow-lg"
        >
          <NotificationCenter
            notifications={notifications}
            channelSlugById={channelSlugById}
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
