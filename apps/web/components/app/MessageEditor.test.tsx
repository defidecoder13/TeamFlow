import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { MessageEditor } from './MessageEditor';
import type { Message } from '../../lib/messages';

function makeMessage(overrides: Partial<Message> = {}): Message {
  return {
    id: 'm-1',
    channelId: 'ch-1',
    authorId: 'u-1',
    body: 'Original message text',
    createdAt: new Date('2026-09-06T12:00:00.000Z'),
    updatedAt: new Date('2026-09-06T12:00:00.000Z'),
    editedAt: null,
    deletedAt: null,
    author: { id: 'u-1', name: 'Ada Lovelace', image: null },
    ...overrides,
  };
}

describe('MessageEditor', () => {
  it('replaces the original message body with the editor textarea', () => {
    const cancelEdit = vi.fn();
    const submitEdit = vi.fn();
    const setEditingBody = vi.fn();

    render(
      <MessageEditor
        message={makeMessage()}
        isCurrentUser={true}
        showTimestamp={true}
        previousMessage={null}
        editingBody="Original message text"
        setEditingBody={setEditingBody}
        cancelEdit={cancelEdit}
        submitEdit={submitEdit}
        submitting={false}
      />,
    );

    // The textarea should be visible with current value
    const textarea = screen.getByRole('textbox', { name: /edit message/i });
    expect(textarea).toBeInTheDocument();
    expect(textarea).toHaveValue('Original message text');

    // The original static text paragraph must NOT be rendered
    expect(screen.queryByText('Original message text', { selector: 'p' })).not.toBeInTheDocument();

    // Save and Cancel buttons must be visible immediately (no hover required)
    expect(screen.getByRole('button', { name: /cancel/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /save/i })).toBeInTheDocument();
    expect(screen.getByText(/escape to cancel · enter to save/i)).toBeInTheDocument();
  });

  it('calls cancelEdit when Cancel button is clicked', async () => {
    const user = userEvent.setup();
    const cancelEdit = vi.fn();
    const submitEdit = vi.fn();
    const setEditingBody = vi.fn();

    render(
      <MessageEditor
        message={makeMessage()}
        isCurrentUser={true}
        showTimestamp={true}
        previousMessage={null}
        editingBody="Editing content"
        setEditingBody={setEditingBody}
        cancelEdit={cancelEdit}
        submitEdit={submitEdit}
        submitting={false}
      />,
    );

    await user.click(screen.getByRole('button', { name: /cancel/i }));
    expect(cancelEdit).toHaveBeenCalledTimes(1);
    expect(submitEdit).not.toHaveBeenCalled();
  });

  it('calls cancelEdit on Escape key', async () => {
    const user = userEvent.setup();
    const cancelEdit = vi.fn();
    const submitEdit = vi.fn();
    const setEditingBody = vi.fn();

    render(
      <MessageEditor
        message={makeMessage()}
        isCurrentUser={true}
        showTimestamp={true}
        previousMessage={null}
        editingBody="Editing content"
        setEditingBody={setEditingBody}
        cancelEdit={cancelEdit}
        submitEdit={submitEdit}
        submitting={false}
      />,
    );

    const textarea = screen.getByRole('textbox', { name: /edit message/i });
    await user.type(textarea, '{Escape}');
    expect(cancelEdit).toHaveBeenCalledTimes(1);
  });

  it('calls submitEdit with trimmed text when Save button is clicked', async () => {
    const user = userEvent.setup();
    const cancelEdit = vi.fn();
    const submitEdit = vi.fn().mockResolvedValue(undefined);
    const setEditingBody = vi.fn();

    render(
      <MessageEditor
        message={makeMessage()}
        isCurrentUser={true}
        showTimestamp={true}
        previousMessage={null}
        editingBody="Updated text "
        setEditingBody={setEditingBody}
        cancelEdit={cancelEdit}
        submitEdit={submitEdit}
        submitting={false}
      />,
    );

    await user.click(screen.getByRole('button', { name: /save/i }));
    expect(submitEdit).toHaveBeenCalledWith('Updated text');
  });

  it('submits on Enter key without Shift, but allows Shift+Enter for newline', async () => {
    const user = userEvent.setup();
    const cancelEdit = vi.fn();
    const submitEdit = vi.fn().mockResolvedValue(undefined);
    const setEditingBody = vi.fn();

    render(
      <MessageEditor
        message={makeMessage()}
        isCurrentUser={true}
        showTimestamp={true}
        previousMessage={null}
        editingBody="Ready to save"
        setEditingBody={setEditingBody}
        cancelEdit={cancelEdit}
        submitEdit={submitEdit}
        submitting={false}
      />,
    );

    const textarea = screen.getByRole('textbox', { name: /edit message/i });

    // Shift+Enter should NOT submit
    await user.type(textarea, '{Shift>}{Enter}{/Shift}');
    expect(submitEdit).not.toHaveBeenCalled();

    // Plain Enter should submit
    await user.type(textarea, '{Enter}');
    expect(submitEdit).toHaveBeenCalledWith('Ready to save');
  });
});
