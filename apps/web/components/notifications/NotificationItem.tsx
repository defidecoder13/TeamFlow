'use client';

import type { NotificationItem } from '../../lib/notifications';
import { UserAvatar } from '../app/UserAvatar';
import { formatRelativeTime } from '../app/message-utils';

function describeNotification(item: NotificationItem): { title: string; context: string } {
  switch (item.type) {
    case 'MENTION':
      return {
        title: `${item.actorName} mentioned you`,
        context: item.channelName
          ? `#${item.channelName}`
          : (item.conversationName ?? 'Direct message'),
      };
    case 'DM_MESSAGE':
      return {
        title: `${item.actorName} sent you a direct message`,
        context: item.conversationName ?? 'Direct message',
      };
    case 'GROUP_MESSAGE':
      return {
        title: `${item.actorName} posted in ${item.conversationName ?? 'a group'}`,
        context: item.conversationName ?? 'Group message',
      };
    case 'THREAD_REPLY':
      return {
        title: `${item.actorName} replied to a thread`,
        context: item.channelName
          ? `#${item.channelName}`
          : (item.conversationName ?? 'Direct message'),
      };
  }
}

/**
 * One notification row. Navigable results render as buttons; rows whose
 * source is gone (deleted message without container context) render as
 * plain history with navigation disabled — never a dead link.
 */
export function NotificationItem({
  item,
  navigable,
  onOpen,
}: {
  item: NotificationItem;
  navigable: boolean;
  onOpen: (item: NotificationItem) => void;
}) {
  const { title, context } = describeNotification(item);
  const unread = item.readAt === null;
  const label = `${title}, in ${context}, ${formatRelativeTime(item.createdAt)}${unread ? ', unread' : ''}`;

  const body = (
    <>
      <div className="shrink-0 pt-0.5">
        <UserAvatar name={item.actorName} image={item.actorImage} size="md" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 items-baseline gap-2">
          <span className="truncate text-[13px] font-semibold text-stone-900">{title}</span>
          {unread && (
            <span className="flex shrink-0 items-center gap-1 text-[11px] font-medium text-stone-700">
              <span
                aria-hidden="true"
                className="inline-block h-1.5 w-1.5 rounded-full bg-stone-900"
              />
              Unread
            </span>
          )}
        </div>
        <div className="mt-0.5 flex min-w-0 items-center gap-1 text-[12px] text-stone-500">
          <span className="truncate">{context}</span>
          <span aria-hidden="true" className="shrink-0">
            ·
          </span>
          <span className="shrink-0">{formatRelativeTime(item.createdAt)}</span>
          {item.messageId === null && (
            <>
              <span aria-hidden="true" className="shrink-0">
                ·
              </span>
              <span className="shrink-0 italic">Original message unavailable</span>
            </>
          )}
        </div>
      </div>
    </>
  );

  if (!navigable) {
    return (
      <li aria-label={label} className="flex items-start gap-3 px-3 py-3">
        {body}
      </li>
    );
  }
  return (
    <li>
      <button
        type="button"
        onClick={() => onOpen(item)}
        aria-label={label}
        className="flex w-full items-start gap-3 rounded-xl border border-transparent px-3 py-3 text-left transition-colors hover:border-stone-200 hover:bg-stone-50 focus:border-stone-300 focus:bg-stone-50 focus:outline-none"
      >
        {body}
      </button>
    </li>
  );
}
