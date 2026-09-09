import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { MessageRow } from './MessageRow';
import type { Message } from '../../lib/messages';

function makeMessage(overrides: Partial<Message> = {}): Message {
  return {
    id: 'm-1',
    channelId: 'ch-1',
    authorId: 'u-1',
    body: 'Hello team',
    createdAt: new Date('2026-09-06T12:00:00.000Z'),
    updatedAt: new Date('2026-09-06T12:00:00.000Z'),
    editedAt: null,
    deletedAt: null,
    author: { id: 'u-1', name: 'Ada Lovelace', image: null },
    ...overrides,
  };
}

describe('MessageRow', () => {
  it("renders another user's name, body, and timestamp without actions", () => {
    render(
      <MessageRow
        message={makeMessage()}
        isCurrentUser={false}
        showTimestamp
        previousMessage={null}
      />,
    );

    expect(screen.getByText('Ada Lovelace')).toBeInTheDocument();
    expect(screen.getByText('Hello team')).toBeInTheDocument();
    expect(screen.queryByText('You')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /message actions/i })).not.toBeInTheDocument();
  });

  it('badges the current user and exposes the actions menu', async () => {
    const user = userEvent.setup();
    const onEdit = vi.fn();
    const onDelete = vi.fn();
    render(
      <MessageRow
        message={makeMessage()}
        isCurrentUser
        showTimestamp
        previousMessage={null}
        onEdit={onEdit}
        onDelete={onDelete}
      />,
    );

    expect(screen.getByText('You')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /message actions/i }));
    await user.click(screen.getByRole('menuitem', { name: 'Edit' }));
    expect(onEdit).toHaveBeenCalledWith('m-1');

    await user.click(screen.getByRole('button', { name: /message actions/i }));
    await user.click(screen.getByRole('menuitem', { name: 'Delete' }));
    expect(onDelete).toHaveBeenCalledWith('m-1');
  });

  it('renders the deleted tombstone without content or actions', () => {
    render(
      <MessageRow
        message={makeMessage({ body: null, deletedAt: new Date('2026-09-06T14:00:00.000Z') })}
        isCurrentUser
        showTimestamp
        previousMessage={null}
      />,
    );

    expect(screen.getByLabelText('Message deleted')).toBeInTheDocument();
    expect(screen.queryByText('Hello team')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /message actions/i })).not.toBeInTheDocument();
  });

  it('shows the edited marker for edited messages', () => {
    render(
      <MessageRow
        message={makeMessage({ editedAt: new Date('2026-09-06T13:00:00.000Z') })}
        isCurrentUser={false}
        showTimestamp={false}
        previousMessage={null}
      />,
    );

    expect(screen.getByText('edited')).toBeInTheDocument();
  });

  it('exposes quick Edit and Delete icon buttons for authorized user', async () => {
    const user = userEvent.setup();
    const onEdit = vi.fn();
    const onDelete = vi.fn();
    render(
      <MessageRow
        message={makeMessage()}
        isCurrentUser
        showTimestamp
        previousMessage={null}
        onEdit={onEdit}
        onDelete={onDelete}
      />,
    );

    const editBtn = screen.getByRole('button', { name: /edit message/i });
    const deleteBtn = screen.getByRole('button', { name: /delete message/i });
    expect(editBtn).toBeInTheDocument();
    expect(deleteBtn).toBeInTheDocument();

    await user.click(editBtn);
    expect(onEdit).toHaveBeenCalledWith('m-1');

    await user.click(deleteBtn);
    expect(onDelete).toHaveBeenCalledWith('m-1');
  });

  it('supports keyboard navigation through action toolbar', async () => {
    const user = userEvent.setup();
    const onEdit = vi.fn();
    const onDelete = vi.fn();
    const onReplyInThread = vi.fn();
    render(
      <MessageRow
        message={makeMessage()}
        isCurrentUser
        showTimestamp
        previousMessage={null}
        onEdit={onEdit}
        onDelete={onDelete}
        onReplyInThread={onReplyInThread}
      />,
    );

    // Tab into the action toolbar -> first action is Reply in thread
    await user.tab();
    expect(screen.getByRole('button', { name: /reply in thread/i })).toHaveFocus();

    // Tab to Add reaction button
    await user.tab();
    expect(screen.getByRole('button', { name: /add reaction/i })).toHaveFocus();

    // Tab to Edit button
    await user.tab();
    expect(screen.getByRole('button', { name: /edit message/i })).toHaveFocus();

    // Activate Edit via keyboard Enter
    await user.keyboard('{Enter}');
    expect(onEdit).toHaveBeenCalledWith('m-1');

    // Tab to Delete button
    await user.tab();
    expect(screen.getByRole('button', { name: /delete message/i })).toHaveFocus();

    // Tab to Message actions (More) button
    await user.tab();
    expect(screen.getByRole('button', { name: /message actions/i })).toHaveFocus();
  });

  describe('Phase 4D.2 - Root Message Thread Indicators', () => {
    it('does not display thread summary when replyCount = 0', () => {
      render(
        <MessageRow
          message={makeMessage({ replyCount: 0 })}
          isCurrentUser={false}
          showTimestamp
          previousMessage={null}
        />,
      );

      expect(screen.queryByRole('button', { name: /view thread/i })).not.toBeInTheDocument();
      expect(screen.queryByText(/reply|replies/i)).not.toBeInTheDocument();
    });

    it('displays singular reply count when replyCount = 1 without latestReplyAt', () => {
      render(
        <MessageRow
          message={makeMessage({ replyCount: 1, latestReplyAt: null })}
          isCurrentUser={false}
          showTimestamp
          previousMessage={null}
        />,
      );

      expect(screen.getByText('1 reply')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /view thread, 1 reply/i })).toBeInTheDocument();
    });

    it('displays plural reply count and latest reply timing when replyCount > 1 and latestReplyAt present', () => {
      const twoMinutesAgo = new Date(Date.now() - 2 * 60 * 1000);
      render(
        <MessageRow
          message={makeMessage({ replyCount: 3, latestReplyAt: twoMinutesAgo })}
          isCurrentUser={false}
          showTimestamp
          previousMessage={null}
        />,
      );

      expect(screen.getByText(/3 replies · Last reply 2m ago/i)).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /view thread, 3 replies/i })).toBeInTheDocument();
    });

    it('exposes "Reply in thread" action on root messages for non-author users', () => {
      render(
        <MessageRow
          message={makeMessage()}
          isCurrentUser={false}
          showTimestamp
          previousMessage={null}
        />,
      );

      expect(screen.getByRole('button', { name: /reply in thread/i })).toBeInTheDocument();
      // Edit and Delete must not be shown for other users
      expect(screen.queryByRole('button', { name: /edit message/i })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /delete message/i })).not.toBeInTheDocument();
    });

    it('calls onReplyInThread with the root message when "Reply in thread" button is clicked', async () => {
      const user = userEvent.setup();
      const onReplyInThread = vi.fn();
      const message = makeMessage();

      render(
        <MessageRow
          message={message}
          isCurrentUser={false}
          showTimestamp
          previousMessage={null}
          onReplyInThread={onReplyInThread}
        />,
      );

      await user.click(screen.getByRole('button', { name: /reply in thread/i }));
      expect(onReplyInThread).toHaveBeenCalledTimes(1);
      expect(onReplyInThread).toHaveBeenCalledWith(message);
    });

    it('calls onReplyInThread when thread summary button is clicked', async () => {
      const user = userEvent.setup();
      const onReplyInThread = vi.fn();
      const message = makeMessage({ replyCount: 4 });

      render(
        <MessageRow
          message={message}
          isCurrentUser={false}
          showTimestamp
          previousMessage={null}
          onReplyInThread={onReplyInThread}
        />,
      );

      await user.click(screen.getByRole('button', { name: /view thread, 4 replies/i }));
      expect(onReplyInThread).toHaveBeenCalledTimes(1);
      expect(onReplyInThread).toHaveBeenCalledWith(message);
    });

    it('supports keyboard activation (Enter and Space) on Reply in thread action', async () => {
      const user = userEvent.setup();
      const onReplyInThread = vi.fn();
      const message = makeMessage();

      render(
        <MessageRow
          message={message}
          isCurrentUser={false}
          showTimestamp
          previousMessage={null}
          onReplyInThread={onReplyInThread}
        />,
      );

      await user.tab();
      const replyBtn = screen.getByRole('button', { name: /reply in thread/i });
      expect(replyBtn).toHaveFocus();

      await user.keyboard('{Enter}');
      expect(onReplyInThread).toHaveBeenCalledWith(message);

      await user.keyboard(' ');
      expect(onReplyInThread).toHaveBeenCalledTimes(2);
    });

    it('supports keyboard activation (Enter and Space) on thread summary button', async () => {
      const user = userEvent.setup();
      const onReplyInThread = vi.fn();
      const message = makeMessage({ replyCount: 2 });

      render(
        <MessageRow
          message={message}
          isCurrentUser={false}
          showTimestamp
          previousMessage={null}
          onReplyInThread={onReplyInThread}
        />,
      );

      const summaryBtn = screen.getByRole('button', { name: /view thread, 2 replies/i });
      summaryBtn.focus();
      expect(summaryBtn).toHaveFocus();

      await user.keyboard('{Enter}');
      expect(onReplyInThread).toHaveBeenCalledWith(message);
    });

    it('does not display reply indicators on reply messages if rendered', () => {
      render(
        <MessageRow
          message={makeMessage({ parentMessageId: 'root-999', replyCount: 3 })}
          isCurrentUser={false}
          showTimestamp
          previousMessage={null}
        />,
      );

      expect(screen.queryByRole('button', { name: /reply in thread/i })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /view thread/i })).not.toBeInTheDocument();
    });

    it('renders thread summary for deleted root message with replies', () => {
      render(
        <MessageRow
          message={makeMessage({
            body: null,
            deletedAt: new Date(),
            replyCount: 5,
          })}
          isCurrentUser={false}
          showTimestamp
          previousMessage={null}
        />,
      );

      expect(screen.getByText('Message deleted')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /view thread, 5 replies/i })).toBeInTheDocument();
      expect(screen.getByText('5 replies')).toBeInTheDocument();
    });

    it('applies selected styling when isSelected is true', () => {
      const { container } = render(
        <MessageRow
          message={makeMessage()}
          isCurrentUser={false}
          showTimestamp
          previousMessage={null}
          isSelected
        />,
      );

      const row = container.querySelector('[data-message-id="m-1"]');
      expect(row?.className).toContain('bg-stone-50/90');
    });
  });
});
