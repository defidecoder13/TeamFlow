import React, { useState, useRef } from 'react';
import { useApp } from '../context/AppContext';
import { AuthField } from '../components/primitives/AuthField';
import { User, Mail, Clock, Briefcase, Calendar } from 'lucide-react';

export const SettingsProfileView: React.FC = () => {
  const { currentUser, updateCurrentUser, activeWorkspace } = useApp();

  const [displayName, setDisplayName] = useState(currentUser.name);
  const [avatarUrl, setAvatarUrl] = useState(currentUser.avatarUrl);
  const [title, setTitle] = useState(currentUser.title);
  const [statusText, setStatusText] = useState(currentUser.statusText || '');
  const [error, setError] = useState('');
  const nameInputRef = useRef<HTMLInputElement>(null);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!displayName.trim()) {
      setError('Display name cannot be empty');
      nameInputRef.current?.focus();
      return;
    }

    updateCurrentUser({
      name: displayName.trim(),
      avatarUrl: avatarUrl.trim() || currentUser.avatarUrl,
      title: title.trim(),
      statusText: statusText.trim() || undefined,
    });
    setError('');
  };

  return (
    <main id="main-content" className="flex-1 overflow-y-auto bg-[#FAF9F8] p-4 sm:p-8">
      <div className="max-w-3xl mx-auto space-y-6">
        <div>
          <h1 className="text-[26px] font-semibold text-[#171A21] tracking-tight">
            Profile & account
          </h1>
          <p className="text-[14px] text-[#4F5360] mt-1">
            Manage your personal presence, avatar, and workplace contact details.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Left 2 cols: Profile Form */}
          <div className="md:col-span-2 bg-white border border-[#E4E2DF] rounded-[12px] p-6 shadow-2xs">
            <form onSubmit={handleSubmit} className="space-y-4">
              <AuthField
                ref={nameInputRef}
                label="Full name"
                autoComplete="name"
                value={displayName}
                onChange={(e) => {
                  setDisplayName(e.target.value);
                  if (error) setError('');
                }}
                error={error}
                required
              />

              <AuthField
                label="Title or role"
                placeholder="e.g. Staff Software Engineer"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
              />

              <AuthField
                label="Status message"
                placeholder="What are you working on right now?"
                value={statusText}
                onChange={(e) => setStatusText(e.target.value)}
                hint="Displayed next to your name across direct messages and threads."
              />

              <AuthField
                label="Avatar image URL"
                type="url"
                placeholder="https://..."
                value={avatarUrl}
                onChange={(e) => setAvatarUrl(e.target.value)}
                hint="Provide a direct link to your photo."
              />

              <div className="pt-3 flex justify-end border-t border-[#E4E2DF]">
                <button
                  type="submit"
                  className="px-4 py-2 bg-[#2E3440] text-white text-[13px] font-medium rounded-[8px] hover:bg-[#1E222A] transition-colors shadow-2xs active:scale-[0.98] focus-visible:ring-2 focus-visible:ring-[#3157D5]"
                >
                  Save changes
                </button>
              </div>
            </form>
          </div>

          {/* Right col: Live Avatar Preview & About Card */}
          <div className="space-y-4">
            {/* Live avatar preview */}
            <div className="bg-white border border-[#E4E2DF] rounded-[12px] p-5 text-center shadow-2xs space-y-3">
              <h2 className="text-[12px] font-semibold uppercase tracking-wider text-[#737782]">
                Live Avatar Preview
              </h2>
              <div className="relative inline-block mx-auto">
                <img
                  src={avatarUrl || currentUser.avatarUrl}
                  alt={displayName}
                  referrerPolicy="no-referrer"
                  className="w-20 h-20 rounded-[12px] object-cover bg-[#ECEAE7] shadow-sm"
                />
                <span
                  role="img"
                  aria-label="Online"
                  className="absolute -bottom-1 -right-1 w-4 h-4 rounded-full bg-[#48B88A] border-2 border-white"
                />
              </div>
              <div>
                <p className="text-[15px] font-semibold text-[#171A21]">{displayName}</p>
                <p className="text-[12px] text-[#737782]">{title || 'Member'}</p>
              </div>
            </div>

            {/* About Card (Inter email only, no monospace font) */}
            <div className="bg-white border border-[#E4E2DF] rounded-[12px] p-5 shadow-2xs space-y-3 text-[13px]">
              <h2 className="text-[12px] font-semibold uppercase tracking-wider text-[#737782] border-b border-[#E4E2DF] pb-2">
                Account information
              </h2>

              <div className="space-y-2.5">
                <div className="flex items-center gap-2 text-[#4F5360]">
                  <Mail className="w-4 h-4 text-[#737782] shrink-0" />
                  <span className="truncate font-sans">{currentUser.email}</span>
                </div>

                <div className="flex items-center gap-2 text-[#4F5360]">
                  <Briefcase className="w-4 h-4 text-[#737782] shrink-0" />
                  <span>{activeWorkspace.name}</span>
                </div>

                <div className="flex items-center gap-2 text-[#47464b]">
                  <Clock className="w-4 h-4 text-[#5f5e61] shrink-0" />
                  <span className="tabular-nums">Pacific Time (UTC-7)</span>
                </div>

                <div className="flex items-center gap-2 text-[#47464b]">
                  <Calendar className="w-4 h-4 text-[#5f5e61] shrink-0" />
                  <span className="tabular-nums">Joined January 2026</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
};
