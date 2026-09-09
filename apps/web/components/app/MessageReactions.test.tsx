import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { MessageReactions } from './MessageReactions';
import type { MessageReactionSummary } from '../../lib/messages';

describe('MessageReactions', () => {
  const sampleReactions: MessageReactionSummary[] = [
    { emoji: '👍', count: 3, reacted: false },
    { emoji: '❤️', count: 1, reacted: true },
  ];

  it('renders reaction badges with emojis and counts', () => {
    render(
      <MessageReactions
        messageId="m-1"
        reactions={sampleReactions}
        toggleReaction={vi.fn()}
        addReaction={vi.fn()}
      />,
    );

    expect(screen.getByText('👍')).toBeInTheDocument();
    expect(screen.getByText('3')).toBeInTheDocument();
    expect(screen.getByText('❤️')).toBeInTheDocument();
    expect(screen.getByText('1')).toBeInTheDocument();
  });

  it('distinguishes badges where user reacted with aria-pressed', () => {
    render(
      <MessageReactions
        messageId="m-1"
        reactions={sampleReactions}
        toggleReaction={vi.fn()}
        addReaction={vi.fn()}
      />,
    );

    const thumbBtn = screen.getByRole('button', { name: /👍, 3 reactions/i });
    const heartBtn = screen.getByRole('button', { name: /❤️, 1 reaction \(you reacted/i });

    expect(thumbBtn).toHaveAttribute('aria-pressed', 'false');
    expect(heartBtn).toHaveAttribute('aria-pressed', 'true');
  });

  it('calls toggleReaction when a badge is clicked', async () => {
    const user = userEvent.setup();
    const toggleReaction = vi.fn().mockResolvedValue(true);

    render(
      <MessageReactions
        messageId="m-1"
        reactions={sampleReactions}
        toggleReaction={toggleReaction}
        addReaction={vi.fn()}
      />,
    );

    const heartBtn = screen.getByRole('button', { name: /❤️/i });
    await user.click(heartBtn);

    expect(toggleReaction).toHaveBeenCalledWith('❤️');
  });

  it('renders disabled badges and hides add reaction button when isDeleted is true', () => {
    render(
      <MessageReactions
        messageId="m-1"
        isDeleted
        reactions={sampleReactions}
        toggleReaction={vi.fn()}
        addReaction={vi.fn()}
      />,
    );

    const thumbBtn = screen.getByRole('button', { name: /👍/i });
    expect(thumbBtn).toBeDisabled();
    expect(screen.queryByRole('button', { name: /add reaction/i })).not.toBeInTheDocument();
  });

  it('renders nothing when deleted and reactions are empty', () => {
    const { container } = render(
      <MessageReactions
        messageId="m-1"
        isDeleted
        reactions={[]}
        toggleReaction={vi.fn()}
        addReaction={vi.fn()}
      />,
    );

    expect(container.firstChild).toBeNull();
  });

  it('shows error message and allows dismissing it', async () => {
    const user = userEvent.setup();
    const clearError = vi.fn();

    render(
      <MessageReactions
        messageId="m-1"
        reactions={sampleReactions}
        error="Could not add reaction"
        clearError={clearError}
        toggleReaction={vi.fn()}
        addReaction={vi.fn()}
      />,
    );

    expect(screen.getByText('Could not add reaction')).toBeInTheDocument();

    const dismissBtn = screen.getByRole('button', { name: /dismiss error/i });
    await user.click(dismissBtn);
    expect(clearError).toHaveBeenCalledTimes(1);
  });

  it('opens emoji picker on "+" click and calls addReaction upon selecting an emoji', async () => {
    const user = userEvent.setup();
    const addReaction = vi.fn().mockResolvedValue(true);

    render(
      <MessageReactions
        messageId="m-1"
        reactions={sampleReactions}
        toggleReaction={vi.fn()}
        addReaction={addReaction}
      />,
    );

    const addBtn = screen.getByRole('button', { name: /add reaction/i });
    await user.click(addBtn);

    const rocketBtn = screen.getByRole('button', { name: 'Rocket' });
    await user.click(rocketBtn);

    expect(addReaction).toHaveBeenCalledWith('🚀');
  });
});
