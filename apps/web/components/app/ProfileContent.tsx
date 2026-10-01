/**
 * Profile settings content (Phase 4K.5).
 *
 * Display name + avatar URL editing via PATCH /api/me.
 */

'use client';

import { useEffect, useRef, useState } from 'react';
import { Mail, Check } from 'lucide-react';
import { AuthField } from '../auth/AuthField';
import { getApiBaseUrl } from '../../lib/config';
import {
  updateProfile,
  validateProfileImage,
  validateProfileName,
  type SessionUser,
} from '../../lib/profile';
import { Avatar } from '@/components/ui/Avatar';

interface ProfileContentProps {
  user: SessionUser;
  onUpdated: (user: SessionUser) => void;
  onUnauthenticated: () => void;
}

export function ProfileContent({ user, onUpdated, onUnauthenticated }: ProfileContentProps) {
  const [name, setName] = useState(user.name);
  const [image, setImage] = useState(user.image ?? '');
  const [touched, setTouched] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState<string | null>(null);
  const nameInputRef = useRef<HTMLInputElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const saveErrorRef = useRef<HTMLParagraphElement>(null);

  useEffect(() => {
    setName(user.name);
    setImage(user.image ?? '');
    setTouched(false);
    setSaveError(null);
    setSaveSuccess(null);
  }, [user.id, user.name, user.image]);

  const nameError = touched ? validateProfileName(name) : null;
  const imageError = touched ? validateProfileImage(image) : null;

  const trimmedName = name.trim();
  const trimmedImage = image.trim();
  const imageValue: string | null = trimmedImage.length === 0 ? null : trimmedImage;

  const hasChanged = trimmedName !== user.name || (imageValue ?? null) !== (user.image ?? null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (saving) return;
    setTouched(true);
    const nErr = validateProfileName(name);
    const iErr = validateProfileImage(image);
    if (nErr) {
      nameInputRef.current?.focus();
      return;
    }
    if (iErr) {
      imageInputRef.current?.focus();
      return;
    }
    if (!hasChanged) {
      setSaveSuccess('No changes to save.');
      return;
    }
    setSaving(true);
    setSaveError(null);
    setSaveSuccess(null);
    let apiBase: string;
    try {
      apiBase = getApiBaseUrl();
    } catch {
      setSaving(false);
      setSaveError('Could not connect to API server. Check your connection and try again.');
      saveErrorRef.current?.focus();
      return;
    }
    const result = await updateProfile(apiBase, {
      name: trimmedName,
      image: imageValue,
    });
    setSaving(false);
    if (result.ok) {
      setSaveSuccess('Profile updated.');
      onUpdated(result.user);
      return;
    }
    if (result.kind === 'unauthenticated') {
      onUnauthenticated();
      return;
    }
    if (result.kind === 'validation') {
      setSaveError(result.message);
      nameInputRef.current?.focus();
      return;
    }
    if (result.kind === 'notFound') {
      setSaveError('User not found.');
      saveErrorRef.current?.focus();
      return;
    }
    setSaveError(
      result.message ?? 'Could not update profile. Check your connection and try again.',
    );
    saveErrorRef.current?.focus();
  }

  const previewName = trimmedName.length > 0 ? trimmedName : user.name;
  const previewImage = trimmedImage.length > 0 ? trimmedImage : user.image;

  return (
    <div className="space-y-6">
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-[#737782]">
          Account settings
        </p>
        <h1 className="mt-1 text-[26px] font-semibold tracking-tight text-[#171A21]">
          Profile & account
        </h1>
        <p className="mt-1 text-[14px] leading-relaxed text-[#4F5360]">
          Update your display name and avatar. Changes are visible to teammates immediately.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Left 2 cols: Profile Form */}
        <section
          aria-labelledby="profile-heading"
          className="md:col-span-2 rounded-[12px] border border-[#E4E2DF] bg-white p-6 shadow-2xs"
        >
          <h2 id="profile-heading" className="text-[15px] font-semibold text-[#171A21] mb-5">
            Profile details
          </h2>

          <form onSubmit={handleSubmit} noValidate className="space-y-5">
            <AuthField
              ref={nameInputRef}
              id="profile-name"
              label="Display name"
              type="text"
              autoComplete="name"
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                if (saveSuccess) setSaveSuccess(null);
              }}
              onBlur={() => setTouched(true)}
              maxLength={100}
              disabled={saving}
              error={nameError}
              placeholder="Your display name"
            />

            <div>
              <AuthField
                ref={imageInputRef}
                id="profile-image"
                label="Avatar image URL (optional)"
                type="url"
                autoComplete="url"
                inputMode="url"
                value={image}
                onChange={(e) => {
                  setImage(e.target.value);
                  if (saveSuccess) setSaveSuccess(null);
                }}
                onBlur={() => setTouched(true)}
                disabled={saving}
                error={imageError}
                placeholder="https://example.com/avatar.jpg"
              />
              {!imageError ? (
                <p className="mt-1.5 text-[12px] text-[#737782]">
                  Leave empty to remove avatar. Must be http(s) URL.
                </p>
              ) : null}
            </div>

            {saveError ? (
              <p
                ref={saveErrorRef}
                tabIndex={-1}
                role="alert"
                className="rounded-[8px] bg-rose-50 border border-rose-200 px-3.5 py-2.5 text-[13px] text-[#C94A45] outline-none"
              >
                {saveError}
              </p>
            ) : null}
            {saveSuccess ? (
              <p
                role="status"
                className="flex items-center gap-1.5 rounded-[8px] bg-emerald-50 border border-emerald-200 px-3.5 py-2.5 text-[13px] text-emerald-700"
              >
                <Check className="w-4 h-4 shrink-0" />
                <span>{saveSuccess}</span>
              </p>
            ) : null}

            <div className="pt-4 flex items-center justify-between border-t border-[#E4E2DF]">
              <div>
                {!hasChanged && touched ? (
                  <span className="text-xs text-[#737782]">No changes.</span>
                ) : null}
              </div>
              <button
                type="submit"
                disabled={saving}
                aria-busy={saving}
                className="px-4 py-2 bg-[#2E3440] text-white text-[13px] font-medium rounded-[8px] hover:bg-[#1E222A] disabled:opacity-60 transition-colors shadow-2xs active:scale-[0.98] focus-visible:ring-2 focus-visible:ring-[#3157D5]"
              >
                {saving ? 'Saving…' : 'Save changes'}
              </button>
            </div>
          </form>
        </section>

        {/* Right col: Live Avatar Preview & About Card */}
        <div className="space-y-5">
          {/* Live avatar preview */}
          <div className="rounded-[12px] border border-[#E4E2DF] bg-white p-5 text-center shadow-2xs space-y-3">
            <h2 className="text-[12px] font-semibold uppercase tracking-wider text-[#737782]">
              Live Avatar Preview
            </h2>
            <div className="relative inline-block mx-auto">
              <Avatar
                name={previewName}
                src={previewImage}
                size={80}
                presence="online"
                showPresence
                className="shadow-sm"
              />
            </div>
            <div>
              <p className="text-[15px] font-semibold text-[#171A21] truncate">{previewName}</p>
              <p className="text-[12px] text-[#737782] truncate">{user.email}</p>
            </div>
          </div>

          {/* About Card */}
          <div className="rounded-[12px] border border-[#E4E2DF] bg-white p-5 shadow-2xs space-y-3 text-[13px]">
            <h2 className="text-[12px] font-semibold uppercase tracking-wider text-[#737782] border-b border-[#E4E2DF] pb-2">
              Account information
            </h2>

            <div className="space-y-3">
              <div className="flex items-center gap-2.5 text-[#4F5360]">
                <Mail className="w-4 h-4 text-[#737782] shrink-0" />
                <span className="truncate font-sans">{user.email}</span>
              </div>
              <p className="text-[12px] leading-relaxed text-[#737782]">
                Your name and avatar are shown in messages, member lists, and mentions. Email cannot
                be changed here.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
