'use client';

import React, { useState } from 'react';
import { getAvatarInitials } from '@/lib/avatar-catalog';

export type AvatarSize = 'xs' | 'sm' | 'md' | 'lg' | 'xl' | number;

export type AvatarPresenceStatus = 'online' | 'away' | 'offline' | 'ONLINE' | 'OFFLINE';

export interface AvatarProps {
  name: string;
  src?: string | null;
  size?: AvatarSize;
  presence?: AvatarPresenceStatus;
  showPresence?: boolean;
  className?: string;
  alt?: string;
  onClick?: () => void;
}

const SIZE_CONFIGS: Record<'xs' | 'sm' | 'md' | 'lg' | 'xl', { box: string; text: string; dot: string }> = {
  xs: { box: 'w-5 h-5 min-w-5 min-h-5', text: 'text-[10px]', dot: 'w-1.5 h-1.5 -bottom-0.5 -right-0.5 border' },
  sm: { box: 'w-7 h-7 min-w-7 min-h-7', text: 'text-[11px]', dot: 'w-2 h-2 -bottom-0.5 -right-0.5 border' },
  md: { box: 'w-9 h-9 min-w-9 min-h-9', text: 'text-[13px]', dot: 'w-2.5 h-2.5 -bottom-0.5 -right-0.5 border-2' },
  lg: { box: 'w-10 h-10 min-w-10 min-h-10', text: 'text-[14px]', dot: 'w-2.5 h-2.5 -bottom-0.5 -right-0.5 border-2' },
  xl: { box: 'w-20 h-20 min-w-20 min-h-20', text: 'text-[22px]', dot: 'w-4 h-4 -bottom-1 -right-1 border-2' },
};

export const Avatar: React.FC<AvatarProps> = ({
  name,
  src,
  size = 'md',
  presence,
  showPresence = false,
  className = '',
  alt,
  onClick,
}) => {
  const [hasError, setHasError] = useState(false);

  // Dimension classes or custom inline style
  const isNamedSize = typeof size === 'string' && size in SIZE_CONFIGS;
  const sizeConfig = isNamedSize ? SIZE_CONFIGS[size as keyof typeof SIZE_CONFIGS] : null;

  const customStyle: React.CSSProperties = !isNamedSize
    ? {
        width: typeof size === 'number' ? `${size}px` : size,
        height: typeof size === 'number' ? `${size}px` : size,
        minWidth: typeof size === 'number' ? `${size}px` : size,
        minHeight: typeof size === 'number' ? `${size}px` : size,
      }
    : {};

  const initials = getAvatarInitials(name);

  // Status dot classes
  const isOnline = presence === 'online' || presence === 'ONLINE';
  const isAway = presence === 'away';
  const statusColor = isOnline
    ? 'bg-[#48B88A]'
    : isAway
    ? 'bg-[#E8A33A]'
    : 'bg-[#A5A8AE]';

  const dotSizeClass = sizeConfig ? sizeConfig.dot : 'w-2.5 h-2.5 -bottom-0.5 -right-0.5 border-2';

  const shouldRenderImage = Boolean(src) && !hasError;

  return (
    <div
      onClick={onClick}
      style={customStyle}
      className={`relative inline-flex shrink-0 aspect-square select-none ${
        sizeConfig ? sizeConfig.box : ''
      } ${className}`}
    >
      {/* Outer circular wrapper with overflow-hidden to guarantee 100% circular crop without distortion */}
      <div className="w-full h-full rounded-full overflow-hidden flex items-center justify-center shrink-0 border border-black/5 bg-[#ECEAE7] text-[#171A21] shadow-2xs">
        {shouldRenderImage ? (
          <img
            src={src!}
            alt={alt || name}
            onError={() => setHasError(true)}
            loading="lazy"
            decoding="async"
            className="w-full h-full object-cover rounded-full aspect-square block shrink-0"
          />
        ) : (
          <span
            aria-hidden="true"
            className={`font-semibold tracking-tight uppercase select-none text-[#171A21] ${
              sizeConfig ? sizeConfig.text : 'text-xs'
            }`}
          >
            {initials}
          </span>
        )}
      </div>

      {/* Non-distorting presence indicator positioned at bottom-right outside the circular crop */}
      {showPresence && presence && (
        <span
          role="img"
          aria-label={`Presence: ${presence}`}
          className={`absolute rounded-full border-white shadow-2xs z-10 shrink-0 pointer-events-none ${statusColor} ${dotSizeClass}`}
        />
      )}
    </div>
  );
};

export default Avatar;
