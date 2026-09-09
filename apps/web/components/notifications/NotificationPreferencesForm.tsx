/**
 * User Notification Preferences Form (Phase 4H.8).
 *
 * Provides granular controls for:
 * 1. Mentions (@username, @channel)
 * 2. Direct & group messages
 * 3. Thread replies
 *
 * Each preference can be toggled between ALL and NONE.
 * Changes are saved immediately with optimistic feedback, saving indicator,
 * and clear error reporting with rollback on failure.
 */

'use client';

import type {
  NotificationDelivery,
  NotificationPreferences,
} from '../../lib/notification-preferences';

interface NotificationPreferencesFormProps {
  preferences: NotificationPreferences;
  isSaving: boolean;
  saveError: string | null;
  onUpdate: (
    key: 'mentionDelivery' | 'dmDelivery' | 'threadReplyDelivery',
    value: NotificationDelivery,
  ) => void;
}

interface PreferenceOption {
  key: 'mentionDelivery' | 'dmDelivery' | 'threadReplyDelivery';
  title: string;
  description: string;
}

const PREFERENCE_OPTIONS: PreferenceOption[] = [
  {
    key: 'mentionDelivery',
    title: 'Mentions',
    description:
      'Notifications when someone mentions you or uses @channel in a channel you belong to.',
  },
  {
    key: 'dmDelivery',
    title: 'Direct & group messages',
    description: 'Notifications for direct messages and group conversations.',
  },
  {
    key: 'threadReplyDelivery',
    title: 'Thread replies',
    description: 'Notifications for replies to threads you started or participated in.',
  },
];

export function NotificationPreferencesForm({
  preferences,
  isSaving,
  saveError,
  onUpdate,
}: NotificationPreferencesFormProps) {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold text-stone-900">Notification Triggers</h2>
          <p className="text-xs text-stone-500 mt-0.5">
            Choose what events trigger realtime notifications. All notifications still appear in
            your history.
          </p>
        </div>
        {isSaving ? (
          <div
            role="status"
            aria-label="Saving changes"
            className="flex items-center gap-1.5 text-xs text-stone-500"
          >
            <svg
              aria-hidden="true"
              focusable="false"
              viewBox="0 0 16 16"
              className="h-3.5 w-3.5 animate-spin text-stone-400"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path d="M8 1.5a6.5 6.5 0 1 0 6.5 6.5" strokeLinecap="round" />
            </svg>
            <span>Saving…</span>
          </div>
        ) : null}
      </div>

      {saveError ? (
        <div
          role="alert"
          className="rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-700"
        >
          {saveError}
        </div>
      ) : null}

      <div className="divide-y divide-stone-100 rounded-xl border border-stone-200 bg-white">
        {PREFERENCE_OPTIONS.map((opt) => {
          const currentValue = preferences[opt.key];
          return (
            <div
              key={opt.key}
              className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="max-w-md">
                <p className="text-[13px] font-medium text-stone-900">{opt.title}</p>
                <p className="mt-0.5 text-xs text-stone-500 leading-relaxed">{opt.description}</p>
              </div>

              <div
                role="radiogroup"
                aria-label={opt.title}
                className="inline-flex shrink-0 items-center rounded-lg border border-stone-200 bg-stone-50 p-0.5 text-xs"
              >
                <button
                  type="button"
                  role="radio"
                  aria-checked={currentValue === 'ALL'}
                  onClick={() => onUpdate(opt.key, 'ALL')}
                  className={[
                    'rounded-md px-3 py-1.5 font-medium transition-colors',
                    currentValue === 'ALL'
                      ? 'bg-white text-stone-900 shadow-sm'
                      : 'text-stone-500 hover:text-stone-900',
                  ].join(' ')}
                >
                  All
                </button>
                <button
                  type="button"
                  role="radio"
                  aria-checked={currentValue === 'NONE'}
                  onClick={() => onUpdate(opt.key, 'NONE')}
                  className={[
                    'rounded-md px-3 py-1.5 font-medium transition-colors',
                    currentValue === 'NONE'
                      ? 'bg-white text-stone-900 shadow-sm'
                      : 'text-stone-500 hover:text-stone-900',
                  ].join(' ')}
                >
                  None
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
