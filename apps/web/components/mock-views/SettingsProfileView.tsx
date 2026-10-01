'use client';

import React, { useEffect, useRef, useState } from 'react';
import { useApp } from '../../lib/mock-context';
import { useRouter } from '../../lib/mock-hooks/useRouter';
import { useShell } from '../../lib/shell-context';
import { AuthField } from '../mock-ui/primitives/AuthField';
import { AvatarSelector } from '@/components/ui/AvatarSelector';
import type { AvatarType } from '@/lib/mock-types';
import { PROFESSIONAL_AVATARS } from '@/lib/avatar-catalog';
import { getApiBaseUrl } from '../../lib/config';
import {
  updateProfile,
  validateProfileImage,
  validateProfileName,
} from '../../lib/profile';
import type { SessionUser } from '../../lib/use-session-user';
import { Mail, Briefcase, Calendar, Check, AlertCircle } from 'lucide-react';

function avatarTypeForImage(image: string | null): AvatarType {
  if (!image) return 'initials';
  if (PROFESSIONAL_AVATARS.some((a) => a.url === image)) return 'professional';
  return 'uploaded';
}

function joinedLabel(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return `Joined ${d.toLocaleString('en-US', { month: 'long', year: 'numeric' })}`;
}

export const SettingsProfileView: React.FC = () => {
  const { showToast } = useApp();
  const { session, currentUser, currentWorkspace, members } = useShell();
  const { push } = useRouter();

  const [displayName, setDisplayName] = useState('');
  const [avatarUrl, setAvatarUrl] = useState('');
  const [avatarType, setAvatarType] = useState<AvatarType>('initials');
  const [nameError, setNameError] = useState('');
  const [imageError, setImageError] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [hydratedForId, setHydratedForId] = useState<string | null>(null);
  const nameInputRef = useRef<HTMLInputElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!currentUser || hydratedForId === currentUser.id) return;
    setDisplayName(currentUser.name);
    setAvatarUrl(currentUser.image ?? '');
    setAvatarType(avatarTypeForImage(currentUser.image));
    setNameError('');
    setImageError('');
    setFormError(null);
    setSaveSuccess(false);
    setHydratedForId(currentUser.id);
  }, [currentUser, hydratedForId]);

  const membership =
    currentUser && members.state.status === 'ready'
      ? members.state.members.find((m) => m.user.id === currentUser.id) ?? null
      : null;
  const joined = joinedLabel(membership?.createdAt);

  const trimmedName = displayName.trim();
  const trimmedImage = avatarType === 'initials' ? '' : avatarUrl.trim();
  const imageValue: string | null = trimmedImage.length === 0 ? null : trimmedImage;

  const hasChanged =
    currentUser !== null &&
    (trimmedName !== currentUser.name || imageValue !== (currentUser.image ?? null));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUser || isSaving) return;

    const nErr = validateProfileName(displayName);
    const iErr = avatarType === 'initials' ? null : validateProfileImage(avatarUrl);
    setNameError(nErr ?? '');
    setImageError(iErr ?? '');
    setFormError(null);
    setSaveSuccess(false);
    if (nErr) {
      nameInputRef.current?.focus();
      return;
    }
    if (iErr) {
      imageInputRef.current?.focus();
      return;
    }
    if (!hasChanged) {
      setSaveSuccess(true);
      return;
    }

    setIsSaving(true);
    let apiBase: string;
    try {
      apiBase = getApiBaseUrl();
    } catch {
      setIsSaving(false);
      setFormError('Could not connect to API server. Check your connection and try again.');
      return;
    }

    const result = await updateProfile(apiBase, {
      name: trimmedName,
      image: imageValue,
    });
    setIsSaving(false);

    if (result.ok) {
      if (session.status === 'authenticated') {
        session.setUser(result.user as SessionUser);
      }
      setSaveSuccess(true);
      showToast('Profile updated successfully.', 'success');
      return;
    }

    if (result.kind === 'unauthenticated') {
      setFormError('You must be signed in to update your profile.');
      return;
    }
    if (result.kind === 'notFound') {
      setFormError('User not found.');
      return;
    }
    if (result.kind === 'validation') {
      setFormError(result.message);
      return;
    }
    setFormError(result.message ?? "We couldn't update your profile. Please try again.");
  };

  if (session.status === 'loading' || currentUser === null) {
    return (
      <main id="main-content" className="flex-1 overflow-y-auto bg-[#FAF9F8] p-4 sm:p-8">
        <div className="max-w-4xl mx-auto space-y-6">
          <div>
            <h1 className="text-[26px] font-semibold text-[#171A21] tracking-tight">
              Profile &amp; account
            </h1>
          </div>
          <div
            role="status"
            aria-label="Loading profile"
            className="bg-white border border-[#E4E2DF] rounded-[12px] p-6 shadow-2xs text-[13px] text-[#737782]"
          >
            {session.status === 'unauthenticated'
              ? 'Please sign in to manage your profile.'
              : session.status === 'error'
                ? session.message
                : 'Loading your profile…'}
            {session.status === 'unauthenticated' ? (
              <button
                type="button"
                onClick={() => push('/sign-in')}
                className="mt-3 rounded-[8px] bg-[#2E3440] px-4 py-2 text-[13px] font-medium text-white transition-colors hover:bg-[#1E222A] focus-visible:outline-2 focus-visible:outline-[#3157D5]"
              >
                Go to sign in
              </button>
            ) : null}
          </div>
        </div>
      </main>
    );
  }

  return (
    <main id="main-content" className="flex-1 overflow-y-auto bg-[#FAF9F8] p-4 sm:p-8">
      <div className="max-w-4xl mx-auto space-y-6">
        <div>
          <h1 className="text-[26px] font-semibold text-[#171A21] tracking-tight">
            Profile &amp; account
          </h1>
          <p className="text-[14px] text-[#4F5360] mt-1">
            Manage your personal profile, circular avatar, and workplace details.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6" noValidate>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Left 2 cols: Profile Form & Avatar Customizer */}
            <div className="lg:col-span-2 space-y-6">
              {/* Avatar Selector Panel */}
              <div className="bg-white border border-[#E4E2DF] rounded-[12px] p-6 shadow-2xs">
                <AvatarSelector
                  name={displayName || currentUser.name}
                  avatarUrl={avatarUrl}
                  avatarType={avatarType}
                  onChange={({ avatarUrl: newUrl, avatarType: newType }) => {
                    setAvatarUrl(newUrl);
                    setAvatarType(newType);
                    if (imageError) setImageError('');
                    if (saveSuccess) setSaveSuccess(false);
                  }}
                />
              </div>

              {/* Personal Details Panel */}
              <div className="bg-white border border-[#E4E2DF] rounded-[12px] p-6 shadow-2xs space-y-4">
                <h3 className="text-[14px] font-semibold text-[#171A21] border-b border-[#E4E2DF] pb-2">
                  Personal Details
                </h3>

                <AuthField
                  ref={nameInputRef}
                  label="Full name"
                  autoComplete="name"
                  value={displayName}
                  maxLength={100}
                  disabled={isSaving}
                  onChange={(e) => {
                    setDisplayName(e.target.value);
                    if (nameError) setNameError('');
                    if (formError) setFormError(null);
                    if (saveSuccess) setSaveSuccess(false);
                  }}
                  error={nameError}
                  required
                />

                <AuthField
                  ref={imageInputRef}
                  label="Custom photo URL (Optional)"
                  type="url"
                  placeholder="https://..."
                  value={avatarUrl}
                  disabled={isSaving}
                  onChange={(e) => {
                    setAvatarUrl(e.target.value);
                    setAvatarType('uploaded');
                    if (imageError) setImageError('');
                    if (formError) setFormError(null);
                    if (saveSuccess) setSaveSuccess(false);
                  }}
                  onBlur={() => {
                    setImageError(validateProfileImage(avatarUrl) ?? '');
                  }}
                  error={imageError}
                  hint={
                    avatarType === 'initials'
                      ? 'Leave empty to use your initials, or paste a photo URL.'
                      : 'You can also paste a direct image URL.'
                  }
                />

                {formError && (
                  <div
                    role="alert"
                    className="p-3 bg-rose-50 border border-rose-200 rounded-[8px] flex items-start gap-2 text-[13px] text-[#C94A45]"
                  >
                    <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                    <span>{formError}</span>
                  </div>
                )}
              </div>

              <div className="flex items-center justify-end gap-3 pt-2">
                <div className="text-[12px] text-[#737782] mr-auto">
                  {isSaving && <span>Saving profile...</span>}
                  {saveSuccess && !isSaving && (
                    <span className="text-emerald-600 flex items-center gap-1 font-medium">
                      <Check className="w-3.5 h-3.5" />
                      <span>Profile updated.</span>
                    </span>
                  )}
                </div>
                <button
                  type="submit"
                  disabled={isSaving}
                  className="px-5 py-2.5 bg-[#2E3440] text-white text-[13px] font-medium rounded-[8px] hover:bg-[#1E222A] disabled:opacity-50 transition-colors shadow-2xs active:scale-[0.98] focus-visible:ring-2 focus-visible:ring-[#3157D5] cursor-pointer"
                >
                  {isSaving ? 'Saving...' : 'Save changes'}
                </button>
              </div>
            </div>

            {/* Right col: Account Information Card */}
            <div className="space-y-4">
              <div className="bg-white border border-[#E4E2DF] rounded-[12px] p-5 shadow-2xs space-y-3 text-[13px]">
                <h2 className="text-[12px] font-semibold uppercase tracking-wider text-[#737782] border-b border-[#E4E2DF] pb-2">
                  Account information
                </h2>

                <div className="space-y-2.5">
                  <div className="flex items-center gap-2 text-[#4F5360]">
                    <Mail className="w-4 h-4 text-[#737782] shrink-0" />
                    <span className="truncate font-sans">{currentUser.email}</span>
                  </div>

                  {currentWorkspace && (
                    <div className="flex items-center gap-2 text-[#4F5360]">
                      <Briefcase className="w-4 h-4 text-[#737782] shrink-0" />
                      <span>{currentWorkspace.name}</span>
                    </div>
                  )}

                  {joined && (
                    <div className="flex items-center gap-2 text-[#4F5360]">
                      <Calendar className="w-4 h-4 text-[#737782] shrink-0" />
                      <span>{joined}</span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </form>
      </div>
    </main>
  );
};

export default SettingsProfileView;
