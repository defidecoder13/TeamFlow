import React, { useEffect, useState } from 'react';
import { useApp } from '../../lib/mock-context';
import { useRouter } from '../../lib/mock-hooks/useRouter';
import { useNotificationPreferences } from '../../lib/use-notification-preferences';
import type {
  NotificationDelivery,
  NotificationPreferences,
} from '../../lib/notification-preferences';
import { Check, AlertCircle, RefreshCw } from 'lucide-react';

type MentionChoice = 'ALL' | 'NONE';

export const SettingsNotificationsView: React.FC = () => {
  const { showToast } = useApp();
  const { push } = useRouter();
  const { state, isSaving, saveError, clearSaveError, savePreferences, retry } =
    useNotificationPreferences();

  const [draft, setDraft] = useState<NotificationPreferences | null>(null);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [loadDismissed, setLoadDismissed] = useState(false);

  useEffect(() => {
    if (state.status === 'ready' && draft === null) {
      setDraft(state.preferences);
    }
  }, [state, draft]);

  useEffect(() => {
    if (!isSaving && saveSuccess) {
      const t = setTimeout(() => setSaveSuccess(false), 2500);
      return () => clearTimeout(t);
    }
    return undefined;
  }, [isSaving, saveSuccess]);

  const preferences = state.status === 'ready' ? state.preferences : null;
  const isDirty =
    draft !== null &&
    preferences !== null &&
    (draft.mentionDelivery !== preferences.mentionDelivery ||
      draft.dmDelivery !== preferences.dmDelivery ||
      draft.threadReplyDelivery !== preferences.threadReplyDelivery);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (draft === null || preferences === null || isSaving) return;

    const previous = preferences;
    setLoadDismissed(false);
    const ok = await savePreferences(draft);

    if (ok) {
      setSaveSuccess(true);
      showToast('Notification preferences updated', 'success');
    } else {
      setDraft(previous);
      setSaveSuccess(false);
    }
  };

  const updateDraft = (key: keyof NotificationPreferences, value: NotificationDelivery) => {
    if (draft === null) return;
    setDraft({ ...draft, [key]: value });
  };

  const loadError = state.status === 'error' && !loadDismissed ? state.message : null;

  return (
    <main id="main-content" className="flex-1 overflow-y-auto bg-[#FAF9F8] p-4 sm:p-8">
      <div className="max-w-2xl mx-auto space-y-6">
        <div>
          <h1 className="text-[26px] font-semibold text-[#171A21] tracking-tight">
            Notifications & alerts
          </h1>
          <p className="text-[14px] text-[#4F5360] mt-1">
            Choose how and when TeamFlow delivers alerts to you across desktop and mobile.
          </p>
        </div>

        {saveError && (
          <div
            role="alert"
            className="p-4 bg-rose-50 border border-rose-200 rounded-[10px] flex items-start gap-3"
          >
            <AlertCircle className="w-5 h-5 text-[#C94A45] shrink-0 mt-0.5" />
            <div className="flex-1 text-[13px] text-[#C94A45]">
              <p className="font-semibold">Unable to save preferences</p>
              <p className="text-[12px] mt-0.5">{saveError}</p>
              <button
                type="button"
                onClick={clearSaveError}
                className="mt-2 font-medium underline flex items-center gap-1"
              >
                <RefreshCw className="w-3 h-3" />
                <span>Dismiss</span>
              </button>
            </div>
          </div>
        )}

        {loadError && (
          <div
            role="alert"
            className="p-4 bg-rose-50 border border-rose-200 rounded-[10px] flex items-start gap-3"
          >
            <AlertCircle className="w-5 h-5 text-[#C94A45] shrink-0 mt-0.5" />
            <div className="flex-1 text-[13px] text-[#C94A45]">
              <p className="font-semibold">Unable to load preferences</p>
              <p className="text-[12px] mt-0.5">{loadError}</p>
              <div className="mt-2 flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => {
                    setLoadDismissed(false);
                    retry();
                  }}
                  className="font-medium underline flex items-center gap-1"
                >
                  <RefreshCw className="w-3 h-3" />
                  <span>Try again</span>
                </button>
                <button
                  type="button"
                  onClick={() => setLoadDismissed(true)}
                  className="font-medium underline"
                >
                  Dismiss
                </button>
              </div>
            </div>
          </div>
        )}

        {state.status === 'unauthenticated' && (
          <div
            role="status"
            className="bg-white border border-[#E4E2DF] rounded-[12px] p-6 shadow-2xs text-[13px] text-[#737782]"
          >
            <p className="font-medium text-[#171A21]">Please sign in</p>
            <p className="mt-1">Your session has expired. Sign in again to manage notifications.</p>
            <button
              type="button"
              onClick={() => push('/sign-in')}
              className="mt-3 rounded-[8px] bg-[#2E3440] px-4 py-2 text-[13px] font-medium text-white transition-colors hover:bg-[#1E222A] focus-visible:outline-2 focus-visible:outline-[#3157D5]"
            >
              Go to sign in
            </button>
          </div>
        )}

        {state.status === 'loading' && (
          <div
            role="status"
            aria-label="Loading notification preferences"
            className="bg-white border border-[#E4E2DF] rounded-[12px] p-6 shadow-2xs text-[13px] text-[#737782]"
          >
            Loading preferences…
          </div>
        )}

        {state.status === 'ready' && draft !== null && (
          <form
            onSubmit={handleSave}
            className="bg-white border border-[#E4E2DF] rounded-[12px] p-6 shadow-2xs space-y-6"
          >
            {/* Mentions Fieldset */}
            <fieldset className="space-y-3 pb-6 border-b border-[#E4E2DF]">
              <legend className="text-[15px] font-semibold text-[#171A21]">
                Mentions & keywords
              </legend>
              <p className="text-[13px] text-[#737782]">
                Select which messages trigger sound notifications and mobile push alerts.
              </p>

              <div className="space-y-2 pt-1">
                <label className="flex items-center gap-3 p-2.5 rounded-[8px] hover:bg-[#FAF9F8] transition-colors cursor-pointer border border-transparent hover:border-[#E4E2DF]">
                  <input
                    type="radio"
                    name="mentionsPref"
                    value="ALL"
                    checked={draft.mentionDelivery === 'ALL'}
                    onChange={() => updateDraft('mentionDelivery', 'ALL')}
                    className="w-4 h-4 text-[#171A21] focus:ring-[#3157D5]"
                  />
                  <div>
                    <span className="text-[13px] font-medium text-[#171A21] block">
                      All mentions & channel keywords
                    </span>
                    <span className="text-[12px] text-[#737782] block">
                      Notify when anyone uses @you, @everyone, or configured terms
                    </span>
                  </div>
                </label>

                <label className="flex items-center gap-3 p-2.5 rounded-[8px] hover:bg-[#FAF9F8] transition-colors cursor-pointer border border-transparent hover:border-[#E4E2DF]">
                  <input
                    type="radio"
                    name="mentionsPref"
                    value="NONE"
                    checked={draft.mentionDelivery === 'NONE'}
                    onChange={() => updateDraft('mentionDelivery', 'NONE')}
                    className="w-4 h-4 text-[#171A21] focus:ring-[#3157D5]"
                  />
                  <div>
                    <span className="text-[13px] font-medium text-[#171A21] block">
                      None (Mute all)
                    </span>
                    <span className="text-[12px] text-[#737782] block">
                      Suppress all sound and badge banners for mentions
                    </span>
                  </div>
                </label>
              </div>
            </fieldset>

            {/* Direct Messages Fieldset */}
            <fieldset className="space-y-3 pb-6 border-b border-[#E4E2DF]">
              <legend className="text-[15px] font-semibold text-[#171A21]">
                Direct messages
              </legend>
              <p className="text-[13px] text-[#737782]">
                How to alert you when coworkers send 1-on-1 direct messages.
              </p>

              <div className="space-y-2 pt-1">
                <label className="flex items-center gap-3 p-2.5 rounded-[8px] hover:bg-[#FAF9F8] transition-colors cursor-pointer">
                  <input
                    type="radio"
                    name="dmsPref"
                    value="ALL"
                    checked={draft.dmDelivery === 'ALL'}
                    onChange={() => updateDraft('dmDelivery', 'ALL')}
                    className="w-4 h-4 text-[#171A21] focus:ring-[#3157D5]"
                  />
                  <span className="text-[13px] font-medium text-[#171A21]">
                    Notify on all direct messages
                  </span>
                </label>

                <label className="flex items-center gap-3 p-2.5 rounded-[8px] hover:bg-[#FAF9F8] transition-colors cursor-pointer">
                  <input
                    type="radio"
                    name="dmsPref"
                    value="NONE"
                    checked={draft.dmDelivery === 'NONE'}
                    onChange={() => updateDraft('dmDelivery', 'NONE')}
                    className="w-4 h-4 text-[#171A21] focus:ring-[#3157D5]"
                  />
                  <span className="text-[13px] font-medium text-[#171A21]">
                    Do not notify (badge only)
                  </span>
                </label>
              </div>
            </fieldset>

            {/* Thread Replies Fieldset */}
            <fieldset className="space-y-3 pb-6 border-b border-[#E4E2DF]">
              <legend className="text-[15px] font-semibold text-[#171A21]">
                Thread replies
              </legend>
              <p className="text-[13px] text-[#737782]">
                Replies to discussions you started or contributed to.
              </p>

              <div className="space-y-2 pt-1">
                <label className="flex items-center gap-3 p-2.5 rounded-[8px] hover:bg-[#FAF9F8] transition-colors cursor-pointer">
                  <input
                    type="radio"
                    name="threadsPref"
                    value="ALL"
                    checked={draft.threadReplyDelivery === 'ALL'}
                    onChange={() => updateDraft('threadReplyDelivery', 'ALL')}
                    className="w-4 h-4 text-[#171A21] focus:ring-[#3157D5]"
                  />
                  <span className="text-[13px] font-medium text-[#171A21]">
                    Notify on thread replies
                  </span>
                </label>

                <label className="flex items-center gap-3 p-2.5 rounded-[8px] hover:bg-[#FAF9F8] transition-colors cursor-pointer">
                  <input
                    type="radio"
                    name="threadsPref"
                    value="NONE"
                    checked={draft.threadReplyDelivery === 'NONE'}
                    onChange={() => updateDraft('threadReplyDelivery', 'NONE')}
                    className="w-4 h-4 text-[#171A21] focus:ring-[#3157D5]"
                  />
                  <span className="text-[13px] font-medium text-[#171A21]">
                    Never notify for thread replies
                  </span>
                </label>
              </div>
            </fieldset>

            {/* Action Row with saving indicator */}
            <div className="flex items-center justify-between pt-2 border-t border-[#E4E2DF]">
              <div className="text-[12px] text-[#737782]">
                {isSaving && <span>Saving preferences...</span>}
                {saveSuccess && !isSaving && (
                  <span className="text-emerald-600 flex items-center gap-1 font-medium">
                    <Check className="w-3.5 h-3.5" />
                    <span>Preferences saved</span>
                  </span>
                )}
              </div>

              <button
                type="submit"
                disabled={isSaving || !isDirty}
                className="px-4 py-2 bg-[#2E3440] text-white text-[13px] font-medium rounded-[8px] hover:bg-[#1E222A] disabled:opacity-50 transition-colors shadow-2xs active:scale-[0.98] focus-visible:ring-2 focus-visible:ring-[#3157D5]"
              >
                {isSaving ? 'Saving...' : 'Save preferences'}
              </button>
            </div>
          </form>
        )}

        {state.status === 'error' && loadDismissed && (
          <div className="bg-white border border-[#E4E2DF] rounded-[12px] p-6 shadow-2xs text-[13px] text-[#737782] flex items-center justify-between">
            <span>Preferences unavailable.</span>
            <button
              type="button"
              onClick={() => {
                setLoadDismissed(false);
                retry();
              }}
              className="font-medium underline text-[#171A21]"
            >
              Try again
            </button>
          </div>
        )}
      </div>
    </main>
  );
};
