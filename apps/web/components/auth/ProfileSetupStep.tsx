'use client';

import React, { useState } from 'react';
import { AvatarSelector } from '../ui/AvatarSelector';
import type { AvatarType } from '../../lib/mock-types';
import { getApiBaseUrl } from '../../lib/config';
import { updateProfile, validateProfileImage } from '../../lib/profile';
import { PROFESSIONAL_AVATARS } from '../../lib/avatar-catalog';
import { ArrowRight, CheckCircle2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { AuthError } from './AuthError';

export interface ProfileSetupStepProps {
  name: string;
  email: string;
}

const DEFAULT_AVATAR_URL = PROFESSIONAL_AVATARS[0]!.url;

function imageForSelection(avatarType: AvatarType, avatarUrl: string): string | null {
  if (avatarType === 'initials') return null;
  const trimmed = avatarUrl.trim();
  return trimmed.length === 0 ? null : trimmed;
}

function saveErrorMessage(
  result: Extract<Awaited<ReturnType<typeof updateProfile>>, { ok: false }>,
): string {
  if (result.kind === 'validation') return result.message;
  if (result.kind === 'notFound') return 'User not found.';
  if (result.kind === 'unauthenticated') return 'Your session expired. Please sign in again.';
  return result.message ?? "We couldn't save your profile. Please try again.";
}

export const ProfileSetupStep: React.FC<ProfileSetupStepProps> = ({ name }) => {
  const router = useRouter();
  const [avatarUrl, setAvatarUrl] = useState<string>(DEFAULT_AVATAR_URL);
  const [avatarType, setAvatarType] = useState<AvatarType>('professional');
  const [submitting, setSubmitting] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const handleSkip = () => {
    if (submitting) return;
    router.push('/app');
  };

  const handleContinue = async () => {
    if (submitting) return;
    setSaveError(null);

    const image = imageForSelection(avatarType, avatarUrl);
    if (image !== null) {
      const imageError = validateProfileImage(image);
      if (imageError) {
        setSaveError(imageError);
        return;
      }
    }

    setSubmitting(true);
    try {
      let apiBase: string;
      try {
        apiBase = getApiBaseUrl();
      } catch {
        setSaveError('Could not connect to API server. Check your connection and try again.');
        return;
      }

      const result = await updateProfile(apiBase, { image });
      if (!result.ok) {
        if (result.kind === 'unauthenticated') {
          router.replace('/sign-in');
          return;
        }
        setSaveError(saveErrorMessage(result));
        return;
      }
      router.push('/app');
    } catch {
      setSaveError("We couldn't save your profile. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="w-full min-w-0 space-y-6">
      {/* Step Header */}
      <div>
        <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-[#3157D5] mb-1">
          <CheckCircle2 className="w-3.5 h-3.5" />
          <span>Step 2 of 2 · Set up your profile</span>
        </div>
        <h1 className="text-2xl font-semibold tracking-[-0.02em] text-[#171A21]">
          Choose your profile photo
        </h1>
        <p className="mt-1 text-sm leading-relaxed text-[#4F5360]">
          Add a photo or choose a professional avatar to represent you across TeamFlow.
        </p>
      </div>

      <AuthError message={saveError} />

      {/* Avatar Customizer */}
      <AvatarSelector
        name={name}
        avatarUrl={avatarUrl}
        avatarType={avatarType}
        title="Team Member"
        onChange={({ avatarUrl: newUrl, avatarType: newType }) => {
          setAvatarUrl(newUrl);
          setAvatarType(newType);
          if (saveError) setSaveError(null);
        }}
      />

      {/* CTA Button */}
      <div className="pt-2 border-t border-[#ECEAE7] flex items-center justify-between gap-3">
        <button
          type="button"
          onClick={handleSkip}
          disabled={submitting}
          className="text-[13px] font-medium text-[#737782] hover:text-[#171A21] transition-colors disabled:opacity-50 cursor-pointer disabled:cursor-not-allowed"
        >
          Skip for now
        </button>

        <button
          type="button"
          onClick={handleContinue}
          disabled={submitting}
          aria-busy={submitting}
          className="px-5 py-2.5 bg-[#2E3440] hover:bg-[#1E222A] text-white text-[13px] font-medium rounded-[8px] transition-colors shadow-2xs active:scale-[0.98] flex items-center gap-2 cursor-pointer disabled:opacity-50"
        >
          <span>{submitting ? 'Setting up…' : 'Continue to TeamFlow'}</span>
          <ArrowRight className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
};

export default ProfileSetupStep;
