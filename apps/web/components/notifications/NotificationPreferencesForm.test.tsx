/**
 * NotificationPreferencesForm tests (Phase 4H.8).
 */
import { fireEvent, render, screen } from '@testing-library/react';
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

    const mentionGroup = screen.getByRole('radiogroup', { name: 'Mentions' });
    const dmGroup = screen.getByRole('radiogroup', { name: 'Direct & group messages' });

    expect(mentionGroup.querySelector('button[aria-checked="true"]')).toHaveTextContent('All');
    expect(dmGroup.querySelector('button[aria-checked="true"]')).toHaveTextContent('None');
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

    const mentionGroup = screen.getByRole('radiogroup', { name: 'Mentions' });
    const noneBtn = mentionGroup.querySelectorAll('button')[1];
    fireEvent.click(noneBtn);

    expect(onUpdate).toHaveBeenCalledWith('mentionDelivery', 'NONE');
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
