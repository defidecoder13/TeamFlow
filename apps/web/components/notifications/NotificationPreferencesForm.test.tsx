/**
 * NotificationPreferencesForm tests (Phase 4H.8).
 */
import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { NotificationPreferencesForm } from './NotificationPreferencesForm';

describe('NotificationPreferencesForm', () => {
  const defaultPrefs = {
    mentionDelivery: 'ALL' as const,
    dmDelivery: 'ALL' as const,
    threadReplyDelivery: 'ALL' as const,
  };

  it('renders all three preference rows with descriptions', () => {
    render(
      <NotificationPreferencesForm
        preferences={defaultPrefs}
        isSaving={false}
        saveError={null}
        onUpdate={vi.fn()}
      />,
    );

    expect(screen.getByText('Mentions')).toBeInTheDocument();
    expect(screen.getByText('Direct & group messages')).toBeInTheDocument();
    expect(screen.getByText('Thread replies')).toBeInTheDocument();
  });

  it('reflects checked states according to preferences prop', () => {
    render(
      <NotificationPreferencesForm
        preferences={{
          mentionDelivery: 'ALL',
          dmDelivery: 'NONE',
          threadReplyDelivery: 'ALL',
        }}
        isSaving={false}
        saveError={null}
        onUpdate={vi.fn()}
      />,
    );

    const mentionGroup = screen.getByRole('group', { name: 'Mentions' });
    const dmGroup = screen.getByRole('group', { name: 'Direct & group messages' });

    expect(within(mentionGroup).getByRole('radio', { name: 'All' })).toBeChecked();
    expect(within(dmGroup).getByRole('radio', { name: 'None' })).toBeChecked();
  });

  it('calls onUpdate when toggling an option', () => {
    const onUpdate = vi.fn();
    render(
      <NotificationPreferencesForm
        preferences={defaultPrefs}
        isSaving={false}
        saveError={null}
        onUpdate={onUpdate}
      />,
    );

    const mentionGroup = screen.getByRole('group', { name: 'Mentions' });
    fireEvent.click(within(mentionGroup).getByRole('radio', { name: 'None' }));

    expect(onUpdate).toHaveBeenCalledWith('mentionDelivery', 'NONE');
  });

  it('moves between options with arrow keys (native radio behavior)', async () => {
    const user = userEvent.setup();
    render(
      <NotificationPreferencesForm
        preferences={defaultPrefs}
        isSaving={false}
        saveError={null}
        onUpdate={vi.fn()}
      />,
    );

    const mentionGroup = screen.getByRole('group', { name: 'Mentions' });
    const all = within(mentionGroup).getByRole('radio', { name: 'All' });
    const none = within(mentionGroup).getByRole('radio', { name: 'None' });

    all.focus();
    await user.keyboard('{ArrowRight}');
    expect(none).toHaveFocus();
    await user.keyboard('{ArrowLeft}');
    expect(all).toHaveFocus();
  });

  it('shows saving indicator when isSaving is true', () => {
    render(
      <NotificationPreferencesForm
        preferences={defaultPrefs}
        isSaving={true}
        saveError={null}
        onUpdate={vi.fn()}
      />,
    );

    expect(screen.getByRole('status', { name: 'Saving changes' })).toBeInTheDocument();
  });

  it('shows error banner when saveError is provided', () => {
    render(
      <NotificationPreferencesForm
        preferences={defaultPrefs}
        isSaving={false}
        saveError="Network failed"
        onUpdate={vi.fn()}
      />,
    );

    expect(screen.getByRole('alert')).toHaveTextContent('Network failed');
  });
});
