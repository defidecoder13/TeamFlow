import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { NotificationPreferences } from '../../lib/notification-preferences';
import { SettingsNotificationsView } from './SettingsNotificationsView';

const showToast = vi.fn();
const clearSaveError = vi.fn();
const savePreferences = vi.fn();
const retry = vi.fn();

const hookState = {
  value: {
    state: {
      status: 'loading',
    } as import('../../lib/use-notification-preferences').NotificationPreferencesState,
    isSaving: false,
    saveError: null as string | null,
    clearSaveError,
    updatePreference: vi.fn(),
    savePreferences,
    retry,
  },
};

vi.mock('../../lib/mock-context', () => ({
  useApp: () => ({ showToast }),
}));

vi.mock('../../lib/use-notification-preferences', () => ({
  useNotificationPreferences: () => hookState.value,
}));

function setReady(preferences: NotificationPreferences) {
  hookState.value = {
    ...hookState.value,
    state: { status: 'ready', preferences },
    isSaving: false,
    saveError: null,
  };
}

const allOn: NotificationPreferences = {
  mentionDelivery: 'ALL',
  dmDelivery: 'ALL',
  threadReplyDelivery: 'ALL',
};

beforeEach(() => {
  vi.clearAllMocks();
  hookState.value = {
    state: { status: 'loading' },
    isSaving: false,
    saveError: null,
    clearSaveError,
    updatePreference: vi.fn(),
    savePreferences,
    retry,
  };
  savePreferences.mockResolvedValue(true);
});

describe('SettingsNotificationsView', () => {
  it('renders a loading state while preferences fetch', () => {
    render(<SettingsNotificationsView />);

    expect(
      screen.getByRole('status', { name: /loading notification preferences/i }),
    ).toBeInTheDocument();
    expect(screen.queryByRole('group', { name: /mentions/i })).not.toBeInTheDocument();
  });

  it('reflects loaded preference values in the form', async () => {
    setReady({
      mentionDelivery: 'ALL',
      dmDelivery: 'NONE',
      threadReplyDelivery: 'ALL',
    });

    render(<SettingsNotificationsView />);

    await waitFor(() => {
      expect(screen.getByRole('group', { name: /mentions/i })).toBeInTheDocument();
    });

    const dmGroup = screen.getByRole('group', { name: /direct messages/i });
    const threadGroup = screen.getByRole('group', { name: /thread replies/i });

    expect(screen.getByRole('radio', { name: /all mentions/i })).toBeChecked();
    expect(within(dmGroup).getByRole('radio', { name: /do not notify/i })).toBeChecked();
    expect(within(threadGroup).getByRole('radio', { name: /notify on thread/i })).toBeChecked();
  });

  it('hides unsupported mock-only controls (direct-only mentions, email digests)', async () => {
    setReady(allOn);
    render(<SettingsNotificationsView />);

    await waitFor(() => {
      expect(screen.getByRole('group', { name: /mentions/i })).toBeInTheDocument();
    });

    expect(screen.queryByText(/direct mentions only/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/email digest/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/email digests/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/participating/i)).not.toBeInTheDocument();
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
  });

  it('shows load error with retry', async () => {
    hookState.value = {
      ...hookState.value,
      state: { status: 'error', message: 'Failed to load notification preferences.' },
    };

    render(<SettingsNotificationsView />);

    expect(screen.getByRole('alert')).toHaveTextContent(/unable to load preferences/i);
    expect(screen.getByText('Failed to load notification preferences.')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: /try again/i }));
    expect(retry).toHaveBeenCalled();
  });

  it('saves dirty preferences on form submit', async () => {
    setReady(allOn);

    render(<SettingsNotificationsView />);
    await waitFor(() => {
      expect(screen.getByRole('group', { name: /mentions/i })).toBeInTheDocument();
    });

    const submit = screen.getByRole('button', { name: /save preferences/i });
    expect(submit).toBeDisabled();

    const mentionGroup = screen.getByRole('group', { name: /mentions/i });
    await userEvent.click(within(mentionGroup).getByRole('radio', { name: /none \(mute all\)/i }));

    expect(submit).toBeEnabled();
    await userEvent.click(submit);

    await waitFor(() => {
      expect(savePreferences).toHaveBeenCalledWith({
        mentionDelivery: 'NONE',
        dmDelivery: 'ALL',
        threadReplyDelivery: 'ALL',
      });
    });

    expect(showToast).toHaveBeenCalledWith('Notification preferences updated', 'success');
    expect(await screen.findByText(/preferences saved/i)).toBeInTheDocument();
  });

  it('rolls draft back and shows save error banner on failure', async () => {
    setReady(allOn);

    render(<SettingsNotificationsView />);
    await waitFor(() => {
      expect(screen.getByRole('group', { name: /mentions/i })).toBeInTheDocument();
    });

    savePreferences.mockImplementation(async () => {
      hookState.value = {
        ...hookState.value,
        isSaving: false,
        saveError: 'Failed to save changes. Reverting to previous settings.',
      };
      return false;
    });

    const mentionGroup = screen.getByRole('group', { name: /mentions/i });
    await userEvent.click(within(mentionGroup).getByRole('radio', { name: /none \(mute all\)/i }));
    await userEvent.click(screen.getByRole('button', { name: /save preferences/i }));

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(/unable to save preferences/i);
    });

    expect(screen.getByRole('radio', { name: /all mentions/i })).toBeChecked();
    expect(showToast).not.toHaveBeenCalled();

    await userEvent.click(screen.getByRole('button', { name: /dismiss/i }));
    expect(clearSaveError).toHaveBeenCalled();
  });

  it('shows a pre-rendered save error banner and dismisses it', async () => {
    setReady(allOn);
    hookState.value = {
      ...hookState.value,
      state: { status: 'ready', preferences: allOn },
      saveError: 'Network error',
    };

    render(<SettingsNotificationsView />);
    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(/unable to save preferences/i);
    });
    expect(screen.getByText('Network error')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: /dismiss/i }));
    expect(clearSaveError).toHaveBeenCalled();
  });

  it('dismisses a load error into an honest unavailable panel with retry', async () => {
    hookState.value = {
      ...hookState.value,
      state: { status: 'error', message: 'boom' },
    };

    render(<SettingsNotificationsView />);
    await userEvent.click(screen.getByRole('button', { name: /dismiss/i }));

    expect(screen.queryByText('boom')).not.toBeInTheDocument();
    expect(screen.getByText(/preferences unavailable/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /try again/i })).toBeInTheDocument();
  });
});
