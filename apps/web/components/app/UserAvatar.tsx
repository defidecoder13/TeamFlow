/**
 * User avatar with generated initial fallback (Phase 1D).
 *
 * Shows the account image when present; otherwise monochrome initials derived
 * from the real display name. No external avatar service is used.
 */

import type { PresenceStatus } from '../../lib/presence';
import { PresenceIndicator } from './PresenceIndicator';

interface UserAvatarProps {
  name: string;
  image?: string | null;
  size?: 'sm' | 'md' | 'lg';
  presenceStatus?: PresenceStatus;
}

export function avatarInitials(name: string): string {
  const tokens = name.trim().split(/\s+/).filter(Boolean);
  if (tokens.length === 0) {
    return '?';
  }
  if (tokens.length === 1) {
    return (tokens[0]?.slice(0, 2) ?? '?').toUpperCase();
  }
  return `${tokens[0]?.[0] ?? ''}${tokens[tokens.length - 1]?.[0] ?? ''}`.toUpperCase();
}

export function UserAvatar({ name, image, size = 'md', presenceStatus }: UserAvatarProps) {
  const dimensions =
    size === 'sm' ? 'h-6 w-6 text-[10px]' : size === 'lg' ? 'h-10 w-10 text-sm' : 'h-8 w-8 text-xs';

  const avatarElement = image ? (
    // Plain img (not next/image): account avatars are tiny remote images that
    // must not require image-optimization configuration.
    <img src={image} alt="" className={`${dimensions} rounded-full object-cover`} />
  ) : (
    <span
      aria-hidden="true"
      className={`flex ${dimensions} shrink-0 items-center justify-center rounded-full bg-stone-200 font-semibold text-stone-700`}
    >
      {avatarInitials(name)}
    </span>
  );

  if (!presenceStatus) {
    return avatarElement;
  }

  const indicatorSize = size === 'lg' ? 'md' : 'sm';

  return (
    <div className="relative inline-flex shrink-0">
      {avatarElement}
      <span className="absolute bottom-0 right-0 translate-x-[15%] translate-y-[15%]">
        <PresenceIndicator status={presenceStatus} size={indicatorSize} />
      </span>
    </div>
  );
}
