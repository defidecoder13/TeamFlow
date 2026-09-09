/**
 * User Notification Preferences hook (Phase 4H.8).
 *
 * Manages loading, updating, optimistic updates with rollback, and error states
 * for user notification preferences.
 */

'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  fetchNotificationPreferences,
  updateNotificationPreferences as apiUpdatePreferences,
  type NotificationDelivery,
  type NotificationPreferences,
  type UpdateNotificationPreferencesInput,
} from './notification-preferences';

export type NotificationPreferencesState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'ready'; preferences: NotificationPreferences }
  | { status: 'error'; message: string };

const LOAD_ERROR_MESSAGE = 'Failed to load notification preferences.';
const UPDATE_ERROR_MESSAGE = 'Failed to save changes. Reverting to previous settings.';

export function useNotificationPreferences(): {
  state: NotificationPreferencesState;
  isSaving: boolean;
  saveError: string | null;
  updatePreference: (
    key: keyof UpdateNotificationPreferencesInput,
    value: NotificationDelivery,
  ) => Promise<boolean>;
  retry: () => void;
} {
  const [state, setState] = useState<NotificationPreferencesState>({ status: 'loading' });
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  const stateRef = useRef(state);
  stateRef.current = state;

  const retry = useCallback(() => {
    setAttempt((c) => c + 1);
  }, []);

  useEffect(() => {
    let cancelled = false;
    setState({ status: 'loading' });
    setSaveError(null);

    void fetchNotificationPreferences().then((res) => {
      if (cancelled) return;
      if (res.ok) {
        setState({ status: 'ready', preferences: res.data });
      } else {
        setState({ status: 'error', message: res.message || LOAD_ERROR_MESSAGE });
      }
    });

    return () => {
      cancelled = true;
    };
  }, [attempt]);

  const updatePreference = useCallback(
    async (
      key: keyof UpdateNotificationPreferencesInput,
      value: NotificationDelivery,
    ): Promise<boolean> => {
      const current = stateRef.current;
      if (current.status !== 'ready') {
        return false;
      }

      const previousPreferences = current.preferences;
      if (previousPreferences[key] === value) {
        return true;
      }

      // Optimistic update
      const optimisticPreferences: NotificationPreferences = {
        ...previousPreferences,
        [key]: value,
      };

      setState({
        status: 'ready',
        preferences: optimisticPreferences,
      });
      setIsSaving(true);
      setSaveError(null);

      const res = await apiUpdatePreferences({ [key]: value });

      setIsSaving(false);

      if (res.ok) {
        setState({
          status: 'ready',
          preferences: res.data,
        });
        return true;
      } else {
        // Rollback on failure
        setState({
          status: 'ready',
          preferences: previousPreferences,
        });
        setSaveError(res.message || UPDATE_ERROR_MESSAGE);
        return false;
      }
    },
    [],
  );

  return {
    state,
    isSaving,
    saveError,
    updatePreference,
    retry,
  };
}
