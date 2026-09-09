import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { DeleteMessageDialog } from './DeleteMessageDialog';

describe('DeleteMessageDialog', () => {
  it('does not render when isOpen is false', () => {
    render(<DeleteMessageDialog isOpen={false} onClose={vi.fn()} onConfirm={vi.fn()} />);
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
  });

  it('renders accessible alertdialog with title and description when isOpen is true', () => {
    render(<DeleteMessageDialog isOpen={true} onClose={vi.fn()} onConfirm={vi.fn()} />);
    expect(screen.getByRole('alertdialog', { name: /delete message\?/i })).toBeInTheDocument();
    expect(screen.getByText(/this action cannot be undone/i)).toBeInTheDocument();
  });

  it('calls onClose when Cancel is clicked without calling onConfirm', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    const onConfirm = vi.fn();

    render(<DeleteMessageDialog isOpen={true} onClose={onClose} onConfirm={onConfirm} />);

    await user.click(screen.getByRole('button', { name: /cancel/i }));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('calls onConfirm when Delete button is clicked', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    const onConfirm = vi.fn();

    render(<DeleteMessageDialog isOpen={true} onClose={onClose} onConfirm={onConfirm} />);

    await user.click(screen.getByRole('button', { name: /^delete$/i }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it('calls onClose on Escape key', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    const onConfirm = vi.fn();

    render(<DeleteMessageDialog isOpen={true} onClose={onClose} onConfirm={onConfirm} />);

    await user.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('renders error message when error prop is provided', () => {
    render(
      <DeleteMessageDialog
        isOpen={true}
        onClose={vi.fn()}
        onConfirm={vi.fn()}
        error="Failed to delete message. Please try again."
      />,
    );

    const alert = screen.getByRole('alert');
    expect(alert).toBeInTheDocument();
    expect(alert).toHaveTextContent('Failed to delete message. Please try again.');
  });
});
