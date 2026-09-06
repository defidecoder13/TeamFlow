/**
 * User avatar with generated initial fallback (Phase 1D).
 *
 * Shows the account image when present; otherwise monochrome initials derived
 * from the real display name. No external avatar service is used.
 */

interface UserAvatarProps {
  name: string;
  image?: string | null;
  size?: 'sm' | 'md';
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

export function UserAvatar({ name, image, size = 'md' }: UserAvatarProps) {
  const dimensions = size === 'sm' ? 'h-6 w-6 text-[10px]' : 'h-8 w-8 text-xs';
  if (image) {
    // Plain img (not next/image): account avatars are tiny remote images that
    // must not require image-optimization configuration.
    return <img src={image} alt="" className={`${dimensions} rounded-full object-cover`} />;
  }
  return (
    <span
      aria-hidden="true"
      className={`flex ${dimensions} shrink-0 items-center justify-center rounded-full bg-stone-200 font-semibold text-stone-700`}
    >
      {avatarInitials(name)}
    </span>
  );
}
