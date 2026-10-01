/**
 * Component tests for NotificationItem (Phase 4H.7).
 *
 * Covers all notification types (MENTION, DM_MESSAGE, GROUP_MESSAGE, THREAD_REPLY),
 * read/unread visual and accessibility states, deleted message representation,
 * non-navigable fallback behavior, and navigation click callbacks.
 */
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { NotificationItem } from './NotificationItem';
import type { NotificationItem as NotificationItemType } from '../../lib/notifications';

function createItem(overrides: Partial<NotificationItemType> = {}): NotificationItemType {
  return {
    id: 'n-1',
    type: 'MENTION',
    workspaceId: 'ws-1',
    recipientUserId: 'u-1',
    actorUserId: 'u-2',
    actorName: 'Grace Hopper',
    actorImage: null,
    messageId: 'm-1',
    conversationId: null,
    channelId: 'ch-1',
    threadRootMessageId: null,
    channelName: 'general',
    conversationName: null,
    createdAt: new Date('2026-09-06T12:00:00.000Z'),
    readAt: null,
    ...overrides,
  };
}

describe('NotificationItem', () => {
  it('renders MENTION notification in a channel with title and context', () => {
    const item = createItem({
      type: 'MENTION',
      actorName: 'Grace Hopper',
      channelName: 'general',
    });
    render(<NotificationItem item={item} navigable={true} onOpen={vi.fn()} />);

    expect(screen.getByText('Grace Hopper mentioned you')).toBeInTheDocument();
    expect(screen.getByText('#general')).toBeInTheDocument();
  });

  it('renders DM_MESSAGE notification with actor name and context', () => {
    const item = createItem({
      type: 'DM_MESSAGE',
      actorName: 'Alan Turing',
      conversationName: 'Alan & Grace',
      channelId: null,
      channelName: null,
      conversationId: 'dm-1',
    });
    render(<NotificationItem item={item} navigable={true} onOpen={vi.fn()} />);

    expect(screen.getByText('Alan Turing sent you a direct message')).toBeInTheDocument();
    expect(screen.getByText('Alan & Grace')).toBeInTheDocument();
  });

  it('renders GROUP_MESSAGE notification with group conversation name', () => {
    const item = createItem({
      type: 'GROUP_MESSAGE',
      actorName: 'Margaret Hamilton',
      conversationName: 'Apollo Team',
      channelId: null,
      channelName: null,
      conversationId: 'grp-1',
    });
    render(<NotificationItem item={item} navigable={true} onOpen={vi.fn()} />);

    expect(screen.getByText('Margaret Hamilton posted in Apollo Team')).toBeInTheDocument();
    expect(screen.getByText('Apollo Team')).toBeInTheDocument();
  });

  it('renders THREAD_REPLY notification in a channel', () => {
    const item = createItem({
      type: 'THREAD_REPLY',
      actorName: 'Katherine Johnson',
      channelName: 'announcements',
      threadRootMessageId: 'root-1',
    });
    render(<NotificationItem item={item} navigable={true} onOpen={vi.fn()} />);

    expect(screen.getByText('Katherine Johnson replied to a thread')).toBeInTheDocument();
    expect(screen.getByText('#announcements')).toBeInTheDocument();
  });

  it('renders unread visual badge and includes unread in accessible label', () => {
    const item = createItem({ readAt: null });
    render(<NotificationItem item={item} navigable={true} onOpen={vi.fn()} />);

    expect(screen.getByText('Unread')).toBeInTheDocument();
    const button = screen.getByRole('button', {
      name: /Grace Hopper mentioned you, in #general/i,
    });
    expect(button).toHaveAccessibleName(expect.stringContaining('unread'));
  });

  it('renders read state without unread badge or label', () => {
    const item = createItem({ readAt: new Date('2026-09-06T12:05:00.000Z') });
    render(<NotificationItem item={item} navigable={true} onOpen={vi.fn()} />);

    expect(screen.queryByText('Unread')).not.toBeInTheDocument();
    const button = screen.getByRole('button');
    expect(button.getAttribute('aria-label')).not.toContain('unread');
  });

  it('handles deleted source when messageId is null with fallback notice', () => {
    const item = createItem({ messageId: null });
    render(<NotificationItem item={item} navigable={false} onOpen={vi.fn()} />);

    expect(screen.getByText('Original message unavailable')).toBeInTheDocument();
  });

  it('renders deleted or non-navigable source as plain non-clickable list item', () => {
    const item = createItem({ messageId: null, readAt: new Date('2026-09-06T12:05:00.000Z') });
    const onOpen = vi.fn();
    render(<NotificationItem item={item} navigable={false} onOpen={onOpen} />);

    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    const listItem = screen.getByRole('listitem');
    expect(listItem).toBeInTheDocument();
  });

  it('triggers onOpen with item when clicking navigable notification', () => {
    const item = createItem();
    const onOpen = vi.fn();
    render(<NotificationItem item={item} navigable={true} onOpen={onOpen} />);

    const button = screen.getByRole('button', {
      name: /Grace Hopper mentioned you, in #general/i,
    });
    fireEvent.click(button);
    expect(onOpen).toHaveBeenCalledWith(item);
  });

  it('provides complete accessible label with actor, context, and time', () => {
    const item = createItem({
      actorName: 'Grace Hopper',
      channelName: 'general',
      readAt: null,
    });
    render(<NotificationItem item={item} navigable={true} onOpen={vi.fn()} />);

    const button = screen.getByRole('button', {
      name: /Grace Hopper mentioned you, in #general/i,
    });
    expect(button).toHaveAccessibleName(
      expect.stringMatching(/Grace Hopper mentioned you, in #general, .+?, unread/),
    );
  });

  it('exposes an explicit mark-read action for unread rows without navigating', () => {
    const item = createItem({ readAt: null });
    const onOpen = vi.fn();
    const onMarkRead = vi.fn();
    render(
      <NotificationItem item={item} navigable={true} onOpen={onOpen} onMarkRead={onMarkRead} />,
    );

    const markButton = screen.getByRole('button', { name: /mark as read/i });
    fireEvent.click(markButton);
    expect(onMarkRead).toHaveBeenCalledWith(item);
    expect(onOpen).not.toHaveBeenCalled();
  });

  it('shows mark-read on non-navigable unread rows and hides it once read', () => {
    const unread = createItem({ messageId: null, readAt: null });
    const { rerender } = render(
      <NotificationItem item={unread} navigable={false} onOpen={vi.fn()} onMarkRead={vi.fn()} />,
    );
    expect(screen.getByRole('button', { name: /mark as read/i })).toBeInTheDocument();

    rerender(
      <NotificationItem
        item={{ ...unread, readAt: new Date('2026-09-06T12:05:00.000Z') }}
        navigable={false}
        onOpen={vi.fn()}
        onMarkRead={vi.fn()}
      />,
    );
    expect(screen.queryByRole('button', { name: /mark as read/i })).toBeNull();
  });
});
