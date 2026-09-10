/**
 * Profile settings content (Phase 4K.5).
 *
 * Display name + avatar URL editing via PATCH /api/me.
 */

'use client';

import { useEffect, useState } from 'react';
import { getApiBaseUrl } from '../../lib/config';
import {
  updateProfile,
  validateProfileImage,
  validateProfileName,
  type SessionUser,
} from '../../lib/profile';
import { UserAvatar } from './UserAvatar';

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

  useEffect(() => {
    setName(user.name);
    setImage(user.image ?? '');
    setTouched(false);
    setSaveError(null);
    setSaveSuccess(null);
  }, [user.id, user.name, user.image]);

  const nameError = touched ? validateProfileName(name) : null;
  const imageError = touched ? validateProfileImage(image) : null;
  const hasValidationError = !!nameError || !!imageError;

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
    if (nErr || iErr) return;
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
      setSaveError('Could not connect to API server.');
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
      return;
    }
    if (result.kind === 'notFound') {
      setSaveError('User not found.');
      return;
    }
    setSaveError(result.message ?? 'Could not update profile. Please try again.');
  }

  const previewName = trimmedName.length > 0 ? trimmedName : user.name;
  const previewImage = trimmedImage.length > 0 ? trimmedImage : user.image;

  return (
    <div className="space-y-8">
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-stone-400">
          Account settings
        </p>
        <h1 className="mt-2 text-[26px] font-semibold tracking-tight text-stone-900">Profile</h1>
        <p className="mt-1.5 max-w-xl text-sm leading-relaxed text-stone-500">
          Update your display name and avatar. Changes are visible to teammates immediately.
        </p>
      </div>

      <section
        aria-labelledby="profile-heading"
        className="rounded-xl border border-stone-200 bg-white p-6 shadow-[0_1px_2px_rgba(0,0,0,0.04)]"
      >
        <h2 id="profile-heading" className="text-[13px] font-semibold text-stone-900">
          Profile
        </h2>

        <div className="mt-4 flex items-center gap-4">
          <UserAvatar name={previewName} image={previewImage} size="md" />
          <div>
            <p className="text-sm font-medium text-stone-900">{previewName}</p>
            <p className="text-xs text-stone-500">{user.email}</p>
          </div>
        </div>

        <form onSubmit={handleSubmit} noValidate className="mt-6 space-y-4">
          <div>
            <label htmlFor="profile-name" className="text-[13px] font-medium text-stone-700">
              Display name
            </label>
            <input
              id="profile-name"
              type="text"
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                if (saveSuccess) setSaveSuccess(null);
              }}
              onBlur={() => setTouched(true)}
              maxLength={100}
              disabled={saving}
              aria-invalid={nameError ? 'true' : undefined}
              className="mt-1.5 h-9 w-full rounded-md border border-stone-200 bg-white px-3 text-sm text-stone-900 shadow-[0_1px_2px_rgba(0,0,0,0.04)] outline-none placeholder:text-stone-400 hover:border-stone-300 focus:border-zinc-900 focus:ring-2 focus:ring-zinc-900/10 disabled:opacity-60"
              placeholder="Your display name"
            />
            {nameError ? (
              <p role="alert" className="mt-1.5 text-xs text-red-600">
                {nameError}
              </p>
            ) : null}
          </div>

          <div>
            <label htmlFor="profile-image" className="text-[13px] font-medium text-stone-700">
              Avatar image URL (optional)
            </label>
            <input
              id="profile-image"
              type="url"
              value={image}
              onChange={(e) => {
                setImage(e.target.value);
                if (saveSuccess) setSaveSuccess(null);
              }}
              onBlur={() => setTouched(true)}
              placeholder="https://example.com/avatar.jpg"
              disabled={saving}
              aria-invalid={imageError ? 'true' : undefined}
              className="mt-1.5 h-9 w-full rounded-md border border-stone-200 bg-white px-3 text-sm text-stone-900 shadow-[0_1px_2px_rgba(0,0,0,0.04)] outline-none placeholder:text-stone-400 hover:border-stone-300 focus:border-zinc-900 focus:ring-2 focus:ring-zinc-900/10 disabled:opacity-60"
            />
            {imageError ? (
              <p role="alert" className="mt-1.5 text-xs text-red-600">
                {imageError}
              </p>
            ) : (
              <p className="mt-1.5 text-xs text-stone-500">
                Leave empty to remove avatar. Must be http(s) URL.
              </p>
            )}
          </div>

          {saveError ? (
            <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
              {saveError}
            </p>
          ) : null}
          {saveSuccess ? (
            <p role="status" className="rounded-md bg-green-50 px-3 py-2 text-sm text-green-700">
              {saveSuccess}
            </p>
          ) : null}

          <div className="flex items-center gap-3">
            <button
              type="submit"
              disabled={saving || hasValidationError}
              className="inline-flex h-9 items-center justify-center rounded-lg bg-zinc-900 px-4 text-sm font-medium text-white transition-colors hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {saving ? 'Saving…' : 'Save changes'}
            </button>
            {!hasChanged && touched ? (
              <span className="text-xs text-stone-500">No changes.</span>
            ) : null}
          </div>
        </form>
      </section>

      <section className="rounded-xl border border-stone-200 bg-stone-50 p-4">
        <h3 className="text-[13px] font-semibold text-stone-700">About your profile</h3>
        <p className="mt-1 text-[13px] leading-relaxed text-stone-500">
          Your name and avatar are shown in messages, member lists, and mentions. Email cannot be
          changed here.
        </p>
        <p className="mt-2 text-xs font-mono text-stone-500">{user.email}</p>
      </section>
    </div>
  );
}
