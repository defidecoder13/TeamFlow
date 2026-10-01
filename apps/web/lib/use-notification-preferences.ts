/**
 * User Notification Preferences hook (Phase 4H.8).
 *
 * Manages loading, updating, optimistic updates with rollback, and error states
 * for user notification preferences.
 */

'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { getApiBaseUrl } from './config';
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
  clearSaveError: () => void;
  updatePreference: (
    key: keyof UpdateNotificationPreferencesInput,
    value: NotificationDelivery,
  ) => Promise<boolean>;
  savePreferences: (patch: UpdateNotificationPreferencesInput) => Promise<boolean>;
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

    let apiBase: string;
    try {
      apiBase = getApiBaseUrl();
    } catch {
      setState({ status: 'error', message: LOAD_ERROR_MESSAGE });
      return;
    }

    void fetchNotificationPreferences(apiBase).then((res) => {
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

  const clearSaveError = useCallback(() => {
    setSaveError(null);
  }, []);

  const savePreferences = useCallback(
    async (patch: UpdateNotificationPreferencesInput): Promise<boolean> => {
      const current = stateRef.current;
      if (current.status !== 'ready') {
        return false;
      }

      const previousPreferences = current.preferences;
      const changes: UpdateNotificationPreferencesInput = {};
      if (
        patch.mentionDelivery !== undefined &&
        patch.mentionDelivery !== previousPreferences.mentionDelivery
      ) {
        changes.mentionDelivery = patch.mentionDelivery;
      }
      if (patch.dmDelivery !== undefined && patch.dmDelivery !== previousPreferences.dmDelivery) {
        changes.dmDelivery = patch.dmDelivery;
      }
      if (
        patch.threadReplyDelivery !== undefined &&
        patch.threadReplyDelivery !== previousPreferences.threadReplyDelivery
      ) {
        changes.threadReplyDelivery = patch.threadReplyDelivery;
      }

      if (
        changes.mentionDelivery === undefined &&
        changes.dmDelivery === undefined &&
        changes.threadReplyDelivery === undefined
      ) {
        setSaveError(null);
        return true;
      }

      const optimisticPreferences: NotificationPreferences = {
        ...previousPreferences,
        ...changes,
      };

      setState({
        status: 'ready',
        preferences: optimisticPreferences,
      });
      setIsSaving(true);
      setSaveError(null);

      let apiBase: string;
      try {
        apiBase = getApiBaseUrl();
      } catch {
        setIsSaving(false);
        setState({ status: 'ready', preferences: previousPreferences });
        setSaveError(UPDATE_ERROR_MESSAGE);
        return false;
      }

      const res = await apiUpdatePreferences(apiBase, changes);

      setIsSaving(false);

      if (res.ok) {
        setState({
          status: 'ready',
          preferences: res.data,
        });
        return true;
      }

      setState({
        status: 'ready',
        preferences: previousPreferences,
      });
      setSaveError(res.message || UPDATE_ERROR_MESSAGE);
      return false;
    },
    [],
  );

  const updatePreference = useCallback(
    (
      key: keyof UpdateNotificationPreferencesInput,
      value: NotificationDelivery,
    ): Promise<boolean> => savePreferences({ [key]: value }),
    [savePreferences],
  );

  return {
    state,
    isSaving,
    saveError,
    clearSaveError,
    updatePreference,
    savePreferences,
    retry,
  };
}
