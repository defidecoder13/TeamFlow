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
 * plain history with navigation disabled — never a dead link. Unread rows
 * additionally expose an explicit mark-read action (a sibling button, never
 * nested) so clearing never requires navigating away.
 */
export function NotificationItem({
  item,
  navigable,
  onOpen,
  onMarkRead,
}: {
  item: NotificationItem;
  navigable: boolean;
  onOpen: (item: NotificationItem) => void;
  onMarkRead?: (item: NotificationItem) => void;
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
          <span className="truncate text-[13px] font-semibold text-[#1a1b22]" title={title}>
            {title}
          </span>
          {unread && (
            <span className="flex shrink-0 items-center gap-1 text-[11px] font-medium text-[#47464b]">
              <span
                aria-hidden="true"
                className="inline-block h-1.5 w-1.5 rounded-full bg-[#1f44e4]"
              />
              Unread
            </span>
          )}
        </div>
        <div className="mt-0.5 flex min-w-0 items-center gap-1 text-[12px] tabular-nums text-[#47464b]">
          <span className="truncate" title={context}>
            {context}
          </span>
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

  return (
    <li aria-label={navigable ? undefined : label} className="flex items-start gap-1 px-1 py-1">
      {navigable ? (
        <button
          type="button"
          onClick={() => onOpen(item)}
          aria-label={label}
          className="flex min-w-0 flex-1 items-start gap-3 rounded-xl border border-[#e3e1ec]/40 bg-white px-3 py-3 text-left shadow-[0_1px_2px_rgba(24,24,27,0.03)] transition-[box-shadow,border-color] duration-150 ease-out hover:shadow-[0_4px_12px_rgba(24,24,27,0.06)] focus-visible:border-[#1f44e4]/40 focus-visible:outline-2 focus-visible:outline-[#1f44e4] motion-reduce:transition-none"
        >
          {body}
        </button>
      ) : (
        <div className="flex min-w-0 flex-1 items-start gap-3 px-3 py-3">{body}</div>
      )}
      {unread && onMarkRead && (
        <button
          type="button"
          onClick={() => onMarkRead(item)}
          aria-label={`Mark as read: ${title}`}
          title="Mark as read"
          className="mt-2 shrink-0 rounded-md px-2 py-1 text-[12px] font-medium text-[#47464b] transition-colors hover:bg-[#f4f2fd] hover:text-[#1a1b22] focus-visible:outline-2 focus-visible:outline-[#1f44e4]"
        >
          Mark as read
        </button>
      )}
    </li>
  );
}
