import React, { useState } from 'react';
import { useApp } from '../context/AppContext';
import { Bell, Check, AlertCircle, RefreshCw } from 'lucide-react';

export const SettingsNotificationsView: React.FC = () => {
  const { showToast } = useApp();

  const [mentionsPref, setMentionsPref] = useState<'all' | 'direct_only' | 'none'>('all');
  const [dmsPref, setDmsPref] = useState<'all' | 'none'>('all');
  const [threadsPref, setThreadsPref] = useState<'all' | 'participating' | 'none'>('participating');
  const [emailDigestPref, setEmailDigestPref] = useState<'daily' | 'weekly' | 'never'>('daily');

  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [simulatedError, setSimulatedError] = useState<string | null>(null);

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    setSimulatedError(null);
    setSaveSuccess(false);

    setTimeout(() => {
      setIsSaving(false);
      setSaveSuccess(true);
      showToast('Notification preferences updated', 'success');
      setTimeout(() => setSaveSuccess(false), 2500);
    }, 400);
  };

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

        {simulatedError && (
          <div
            role="alert"
            className="p-4 bg-rose-50 border border-rose-200 rounded-[10px] flex items-start gap-3"
          >
            <AlertCircle className="w-5 h-5 text-[#C94A45] shrink-0 mt-0.5" />
            <div className="flex-1 text-[13px] text-[#C94A45]">
              <p className="font-semibold">Unable to save preferences</p>
              <p className="text-[12px] mt-0.5">{simulatedError}</p>
              <button
                type="button"
                onClick={() => setSimulatedError(null)}
                className="mt-2 font-medium underline flex items-center gap-1"
              >
                <RefreshCw className="w-3 h-3" />
                <span>Dismiss</span>
              </button>
            </div>
          </div>
        )}

        <form onSubmit={handleSave} className="bg-white border border-[#E4E2DF] rounded-[12px] p-6 shadow-2xs space-y-6">
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
                  value="all"
                  checked={mentionsPref === 'all'}
                  onChange={() => setMentionsPref('all')}
                  className="w-4 h-4 text-[#171A21] focus:ring-[#3157D5]"
                />
                <div>
                  <span className="text-[13px] font-medium text-[#171A21] block">
                    All mentions & channel keywords
                  </span>
                  <span className="text-[12px] text-[#737782] block">
                    Notify when anyone uses @alex, @everyone, or configured terms
                  </span>
                </div>
              </label>

              <label className="flex items-center gap-3 p-2.5 rounded-[8px] hover:bg-[#FAF9F8] transition-colors cursor-pointer border border-transparent hover:border-[#E4E2DF]">
                <input
                  type="radio"
                  name="mentionsPref"
                  value="direct_only"
                  checked={mentionsPref === 'direct_only'}
                  onChange={() => setMentionsPref('direct_only')}
                  className="w-4 h-4 text-[#171A21] focus:ring-[#3157D5]"
                />
                <div>
                  <span className="text-[13px] font-medium text-[#171A21] block">
                    Direct mentions only
                  </span>
                  <span className="text-[12px] text-[#737782] block">
                    Only notify when you are personally tagged
                  </span>
                </div>
              </label>

              <label className="flex items-center gap-3 p-2.5 rounded-[8px] hover:bg-[#FAF9F8] transition-colors cursor-pointer border border-transparent hover:border-[#E4E2DF]">
                <input
                  type="radio"
                  name="mentionsPref"
                  value="none"
                  checked={mentionsPref === 'none'}
                  onChange={() => setMentionsPref('none')}
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
                  value="all"
                  checked={dmsPref === 'all'}
                  onChange={() => setDmsPref('all')}
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
                  value="none"
                  checked={dmsPref === 'none'}
                  onChange={() => setDmsPref('none')}
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
                  value="participating"
                  checked={threadsPref === 'participating'}
                  onChange={() => setThreadsPref('participating')}
                  className="w-4 h-4 text-[#171A21] focus:ring-[#3157D5]"
                />
                <span className="text-[13px] font-medium text-[#171A21]">
                  Threads I am following or replied in
                </span>
              </label>

              <label className="flex items-center gap-3 p-2.5 rounded-[8px] hover:bg-[#FAF9F8] transition-colors cursor-pointer">
                <input
                  type="radio"
                  name="threadsPref"
                  value="all"
                  checked={threadsPref === 'all'}
                  onChange={() => setThreadsPref('all')}
                  className="w-4 h-4 text-[#171A21] focus:ring-[#3157D5]"
                />
                <span className="text-[13px] font-medium text-[#171A21]">
                  All thread activity in joined channels
                </span>
              </label>

              <label className="flex items-center gap-3 p-2.5 rounded-[8px] hover:bg-[#FAF9F8] transition-colors cursor-pointer">
                <input
                  type="radio"
                  name="threadsPref"
                  value="none"
                  checked={threadsPref === 'none'}
                  onChange={() => setThreadsPref('none')}
                  className="w-4 h-4 text-[#171A21] focus:ring-[#3157D5]"
                />
                <span className="text-[13px] font-medium text-[#171A21]">
                  Never notify for thread replies
                </span>
              </label>
            </div>
          </fieldset>

          {/* Email Digest Summary */}
          <fieldset className="space-y-3 pb-4">
            <legend className="text-[15px] font-semibold text-[#171A21]">
              Email digests
            </legend>
            <div className="flex items-center gap-3 pt-1">
              <select
                aria-label="Email digest frequency"
                value={emailDigestPref}
                onChange={(e) => setEmailDigestPref(e.target.value as any)}
                className="px-3 py-1.5 bg-[#F6F5F3] border border-[#E4E2DF] rounded-[8px] text-[13px] text-[#171A21] outline-none"
              >
                <option value="daily">Send daily digest at 9:00 AM</option>
                <option value="weekly">Send weekly digest on Monday</option>
                <option value="never">Never send email digests</option>
              </select>
            </div>
          </fieldset>

          {/* Action Row with saving indicator */}
          <div className="flex items-center justify-between pt-2 border-t border-[#E4E2DF]">
            <div className="text-[12px] text-[#737782]">
              {isSaving && <span>Saving preferences...</span>}
              {saveSuccess && (
                <span className="text-emerald-600 flex items-center gap-1 font-medium">
                  <Check className="w-3.5 h-3.5" />
                  <span>Preferences saved</span>
                </span>
              )}
            </div>

            <button
              type="submit"
              disabled={isSaving}
              className="px-4 py-2 bg-[#2E3440] text-white text-[13px] font-medium rounded-[8px] hover:bg-[#1E222A] disabled:opacity-50 transition-colors shadow-2xs active:scale-[0.98] focus-visible:ring-2 focus-visible:ring-[#3157D5]"
            >
              {isSaving ? 'Saving...' : 'Save preferences'}
            </button>
          </div>
        </form>
      </div>
    </main>
  );
};
