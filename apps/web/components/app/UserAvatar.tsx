'use client';

import React from 'react';
import type { PresenceStatus } from '../../lib/presence';
import { Avatar } from '@/components/ui/Avatar';

export interface UserAvatarProps {
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
  const avatarSize = size === 'sm' ? 28 : size === 'lg' ? 40 : 34;

  return (
    <Avatar
      name={name}
      src={image}
      size={avatarSize}
      presence={presenceStatus}
      showPresence={Boolean(presenceStatus)}
    />
  );
}

export default UserAvatar;
