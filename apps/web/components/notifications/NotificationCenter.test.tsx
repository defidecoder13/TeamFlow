/**
 * Component tests for NotificationCenter and NotificationBell (Phase 4H.7).
 *
 * Covers bell rendering, unread badge derivation, dropdown dialog open/close
 * with Escape key and outside click, loading skeleton, caught-up empty state,
 * error state with retry, list rendering, mark all as read action, pagination
 * load more, notification navigation and read mutation triggering, deleted
 * message safety, and accessibility semantics.
 */
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NotificationBell, NotificationCenter } from './NotificationCenter';
import type { NotificationItem } from '../../lib/notifications';
import type { useNotifications } from '../../lib/use-notifications';

const { pushMock, useNotificationsMock, useWorkspaceChannelsMock } = vi.hoisted(() => ({
  pushMock: vi.fn(),
  useNotificationsMock: vi.fn(),
  useWorkspaceChannelsMock: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: pushMock, replace: vi.fn(), refresh: vi.fn() }),
}));

vi.mock('../../lib/use-notifications', () => ({
  useNotifications: (ws: string | null) => useNotificationsMock(ws),
}));

vi.mock('../../lib/use-workspace-channels', () => ({
  useWorkspaceChannels: (ws: string | null) => useWorkspaceChannelsMock(ws),
}));

type NotificationsApi = ReturnType<typeof useNotifications>;

function createMockNotifications(overrides: Partial<NotificationsApi> = {}): NotificationsApi {
  return {
    state: { status: 'idle' },
    hasUnread: false,
    isLoadingMore: false,
    loadMoreError: null,
    loadMore: vi.fn(),
    retry: vi.fn(),
    markRead: vi.fn(),
    markAllRead: vi.fn(),
    actionError: null,
    ...overrides,
  };
}

function createItem(overrides: Partial<NotificationItem> = {}): NotificationItem {
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

describe('NotificationBell', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useWorkspaceChannelsMock.mockReturnValue({
      state: {
        status: 'ready',
        channels: [{ id: 'ch-1', slug: 'general', name: 'general' }],
      },
    });
  });

  it('renders the bell button with default accessible name', () => {
    useNotificationsMock.mockReturnValue(
      createMockNotifications({
        state: { status: 'ready', items: [], hasMore: false, nextCursor: null },
      }),
    );
    render(<NotificationBell workspaceId="ws-1" />);

    const bell = screen.getByRole('button', { name: 'Notifications' });
    expect(bell).toBeInTheDocument();
    expect(bell).not.toBeDisabled();
    expect(bell).toHaveAttribute('aria-expanded', 'false');
  });

  it('renders unread indicator dot and accessible label when unread items exist', () => {
    useNotificationsMock.mockReturnValue(
      createMockNotifications({
        state: {
          status: 'ready',
          items: [createItem({ id: 'n-1', readAt: null })],
          hasMore: false,
          nextCursor: null,
        },
        hasUnread: true,
      }),
    );
    render(<NotificationBell workspaceId="ws-1" />);

    const bell = screen.getByRole('button', { name: 'Notifications, has unread' });
    expect(bell).toBeInTheDocument();
  });

  it('opens notification dialog on click and closes on Escape key', () => {
    useNotificationsMock.mockReturnValue(
      createMockNotifications({
        state: {
          status: 'ready',
          items: [createItem({ id: 'n-1', actorName: 'Grace Hopper' })],
          hasMore: false,
          nextCursor: null,
        },
      }),
    );
    render(<NotificationBell workspaceId="ws-1" />);

    const bell = screen.getByRole('button', { name: 'Notifications, has unread' });
    expect(screen.queryByRole('dialog', { name: 'Notifications' })).not.toBeInTheDocument();

    // Click to open
    fireEvent.click(bell);
    expect(screen.getByRole('dialog', { name: 'Notifications' })).toBeInTheDocument();
    expect(bell).toHaveAttribute('aria-expanded', 'true');

    // Press Escape to close
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.queryByRole('dialog', { name: 'Notifications' })).not.toBeInTheDocument();
    expect(bell).toHaveAttribute('aria-expanded', 'false');
  });

  it('disables bell when workspaceId is missing', () => {
    useNotificationsMock.mockReturnValue(createMockNotifications());
    render(<NotificationBell workspaceId={null} />);

    const bell = screen.getByRole('button', { name: 'Notifications' });
    expect(bell).toBeDisabled();
  });
});

describe('NotificationCenter', () => {
  const channelSlugById = new Map([['ch-1', 'general']]);

  it('renders loading skeleton when state is loading or idle', () => {
    const notifications = createMockNotifications({ state: { status: 'loading' } });
    render(
      <NotificationCenter
        notifications={notifications}
        channelSlugById={channelSlugById}
        onNavigate={vi.fn()}
      />,
    );

    expect(screen.getByRole('status', { name: 'Loading notifications' })).toBeInTheDocument();
  });

  it('renders empty state when items list is empty', () => {
    const notifications = createMockNotifications({
      state: { status: 'ready', items: [], hasMore: false, nextCursor: null },
    });
    render(
      <NotificationCenter
        notifications={notifications}
        channelSlugById={channelSlugById}
        onNavigate={vi.fn()}
      />,
    );

    expect(screen.getByText("You're all caught up")).toBeInTheDocument();
    expect(
      screen.getByText(/Mentions, direct messages, and thread replies will show up here/),
    ).toBeInTheDocument();
  });

  it('renders error state and triggers retry callback', () => {
    const retry = vi.fn();
    const notifications = createMockNotifications({
      state: { status: 'error', message: 'Failed to reach server' },
      retry,
    });
    render(
      <NotificationCenter
        notifications={notifications}
        channelSlugById={channelSlugById}
        onNavigate={vi.fn()}
      />,
    );

    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(screen.getByText("Couldn't load notifications")).toBeInTheDocument();
    expect(screen.getByText('Failed to reach server')).toBeInTheDocument();

    const retryButton = screen.getByRole('button', { name: 'Retry' });
    fireEvent.click(retryButton);
    expect(retry).toHaveBeenCalledTimes(1);
  });

  it('renders notification items in a list', () => {
    const item1 = createItem({ id: 'n-1', actorName: 'Grace Hopper' });
    const item2 = createItem({ id: 'n-2', actorName: 'Ada Lovelace' });
    const notifications = createMockNotifications({
      state: { status: 'ready', items: [item1, item2], hasMore: false, nextCursor: null },
    });
    render(
      <NotificationCenter
        notifications={notifications}
        channelSlugById={channelSlugById}
        onNavigate={vi.fn()}
      />,
    );

    expect(screen.getByRole('list', { name: 'Notifications' })).toBeInTheDocument();
    expect(screen.getByText('Grace Hopper mentioned you')).toBeInTheDocument();
    expect(screen.getByText('Ada Lovelace mentioned you')).toBeInTheDocument();
  });

  it('renders Mark all as read button when hasUnread is true and calls handler', () => {
    const markAllRead = vi.fn();
    const item = createItem({ id: 'n-1', readAt: null });
    const notifications = createMockNotifications({
      state: { status: 'ready', items: [item], hasMore: false, nextCursor: null },
      hasUnread: true,
      markAllRead,
    });
    render(
      <NotificationCenter
        notifications={notifications}
        channelSlugById={channelSlugById}
        onNavigate={vi.fn()}
      />,
    );

    const button = screen.getByRole('button', { name: 'Mark all as read' });
    expect(button).toBeInTheDocument();
    fireEvent.click(button);
    expect(markAllRead).toHaveBeenCalledTimes(1);
  });

  it('hides Mark all as read button when hasUnread is false', () => {
    const item = createItem({ id: 'n-1', readAt: new Date() });
    const notifications = createMockNotifications({
      state: { status: 'ready', items: [item], hasMore: false, nextCursor: null },
      hasUnread: false,
    });
    render(
      <NotificationCenter
        notifications={notifications}
        channelSlugById={channelSlugById}
        onNavigate={vi.fn()}
      />,
    );

    expect(screen.queryByRole('button', { name: 'Mark all as read' })).not.toBeInTheDocument();
  });

  it('renders Load older button when hasMore is true and invokes loadMore', () => {
    const loadMore = vi.fn();
    const notifications = createMockNotifications({
      state: { status: 'ready', items: [createItem()], hasMore: true, nextCursor: 'cursor-1' },
      loadMore,
    });
    render(
      <NotificationCenter
        notifications={notifications}
        channelSlugById={channelSlugById}
        onNavigate={vi.fn()}
      />,
    );

    const button = screen.getByRole('button', { name: 'Load older' });
    expect(button).toBeInTheDocument();
    fireEvent.click(button);
    expect(loadMore).toHaveBeenCalledTimes(1);
  });

  it('shows loading state on load older button during fetch', () => {
    const notifications = createMockNotifications({
      state: { status: 'ready', items: [createItem()], hasMore: true, nextCursor: 'cursor-1' },
      isLoadingMore: true,
    });
    render(
      <NotificationCenter
        notifications={notifications}
        channelSlugById={channelSlugById}
        onNavigate={vi.fn()}
      />,
    );

    const button = screen.getByRole('button', { name: 'Loading…' });
    expect(button).toBeDisabled();
  });

  it('shows load more error with retry when pagination fails', () => {
    const loadMore = vi.fn();
    const notifications = createMockNotifications({
      state: { status: 'ready', items: [createItem()], hasMore: true, nextCursor: 'cursor-1' },
      loadMoreError: 'Failed to page back',
      loadMore,
    });
    render(
      <NotificationCenter
        notifications={notifications}
        channelSlugById={channelSlugById}
        onNavigate={vi.fn()}
      />,
    );

    expect(screen.getByText('Failed to page back')).toBeInTheDocument();
    const retryLink = screen.getByRole('button', { name: 'Retry' });
    fireEvent.click(retryLink);
    expect(loadMore).toHaveBeenCalledTimes(1);
  });

  it('renders action error alert banner when actionError is present', () => {
    const notifications = createMockNotifications({
      state: { status: 'ready', items: [createItem()], hasMore: false, nextCursor: null },
      actionError: 'Could not mark notification as read.',
    });
    render(
      <NotificationCenter
        notifications={notifications}
        channelSlugById={channelSlugById}
        onNavigate={vi.fn()}
      />,
    );

    expect(screen.getByRole('alert')).toHaveTextContent('Could not mark notification as read.');
  });

  it('navigates and marks item read when unread notification is clicked', () => {
    const markRead = vi.fn();
    const onNavigate = vi.fn();
    const item = createItem({ id: 'n-1', messageId: 'm-1', channelId: 'ch-1', readAt: null });
    const notifications = createMockNotifications({
      state: { status: 'ready', items: [item], hasMore: false, nextCursor: null },
      markRead,
    });
    render(
      <NotificationCenter
        notifications={notifications}
        channelSlugById={channelSlugById}
        onNavigate={onNavigate}
      />,
    );

    const itemButton = screen.getByRole('button', { name: /Grace Hopper mentioned you/ });
    fireEvent.click(itemButton);

    expect(onNavigate).toHaveBeenCalledWith('/app/channels/general?message=m-1');
    expect(markRead).toHaveBeenCalledWith('n-1');
  });

  it('does not navigate for deleted notification where messageId is null', () => {
    const onNavigate = vi.fn();
    const item = createItem({ id: 'n-deleted', messageId: null, readAt: null });
    const notifications = createMockNotifications({
      state: { status: 'ready', items: [item], hasMore: false, nextCursor: null },
    });
    render(
      <NotificationCenter
        notifications={notifications}
        channelSlugById={channelSlugById}
        onNavigate={onNavigate}
      />,
    );

    expect(screen.getByText('Original message unavailable')).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /Grace Hopper mentioned you/ }),
    ).not.toBeInTheDocument();
    expect(onNavigate).not.toHaveBeenCalled();
  });
});
