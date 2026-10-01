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

import { AlertCircle } from 'lucide-react';
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
    <div className="rounded-[12px] border border-[#E4E2DF] bg-white p-6 shadow-2xs space-y-6">
      <div className="flex items-center justify-between pb-4 border-b border-[#E4E2DF]">
        <div>
          <h2 className="text-base font-semibold text-[#171A21]">Notification triggers</h2>
          <p className="mt-0.5 text-xs text-[#737782]">
            Choose what events trigger realtime notifications. All notifications still appear in
            your history.
          </p>
        </div>
        {isSaving ? (
          <div
            role="status"
            aria-label="Saving changes"
            className="flex items-center gap-1.5 text-xs text-[#737782]"
          >
            <svg
              aria-hidden="true"
              focusable="false"
              viewBox="0 0 16 16"
              className="h-3.5 w-3.5 animate-spin text-[#3157D5]"
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
          className="flex items-center gap-2.5 rounded-[8px] border border-rose-200 bg-rose-50 p-3 text-[13px] text-[#C94A45]"
        >
          <AlertCircle className="w-4 h-4 shrink-0 text-[#C94A45]" />
          <span>{saveError}</span>
        </div>
      ) : null}

      <div className="space-y-4">
        {PREFERENCE_OPTIONS.map((opt) => {
          const currentValue = preferences[opt.key];
          return (
            <fieldset
              key={opt.key}
              className="rounded-[10px] border border-[#E4E2DF] bg-[#FAF9F8] p-4 transition-colors hover:border-[#DDDCDF]"
            >
              <legend className="px-1 text-[13px] font-semibold text-[#171A21]">
                {opt.title}
              </legend>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <p className="max-w-md text-[13px] leading-relaxed text-[#4F5360]">
                  {opt.description}
                </p>
                <div className="inline-flex w-fit shrink-0 items-center rounded-[8px] border border-[#E4E2DF] bg-white p-0.5 text-xs shadow-2xs">
                  {(['ALL', 'NONE'] as const).map((value) => {
                    const selected = currentValue === value;
                    return (
                      <label key={value} className="cursor-pointer">
                        <input
                          type="radio"
                          name={opt.key}
                          value={value}
                          checked={selected}
                          onChange={() => onUpdate(opt.key, value)}
                          className="peer sr-only"
                        />
                        <span
                          className={[
                            'inline-block rounded-[6px] px-3 py-1.5 font-medium transition-all peer-focus-visible:ring-2 peer-focus-visible:ring-[#3157D5]',
                            selected
                              ? 'bg-[#2E3440] text-white shadow-2xs'
                              : 'text-[#737782] hover:text-[#171A21]',
                          ].join(' ')}
                        >
                          {value === 'ALL' ? 'All' : 'None'}
                        </span>
                      </label>
                    );
                  })}
                </div>
              </div>
            </fieldset>
          );
        })}
      </div>
    </div>
  );
}
