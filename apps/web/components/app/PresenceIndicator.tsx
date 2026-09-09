/**
 * Minimal accessible presence indicator (Phase 4I.3).
 *
 * Renders an accessible status dot (Online, Offline, Away) without relying solely on color.
 * Uses role="status" and title / aria-label for accessibility.
 */

import type { PresenceStatus } from '../../lib/presence';

export interface PresenceIndicatorProps {
  status: PresenceStatus;
  size?: 'sm' | 'md';
  className?: string;
}

const STATUS_LABELS: Record<PresenceStatus, string> = {
  ONLINE: 'Online',
  OFFLINE: 'Offline',
  AWAY: 'Away',
};

const STATUS_STYLES: Record<PresenceStatus, string> = {
  ONLINE: 'bg-emerald-500 ring-white',
  AWAY: 'bg-amber-500 ring-white',
  OFFLINE: 'bg-stone-300 ring-white',
};

export function PresenceIndicator({ status, size = 'md', className = '' }: PresenceIndicatorProps) {
  const label = STATUS_LABELS[status] ?? 'Offline';
  const colorClass = STATUS_STYLES[status] ?? STATUS_STYLES.OFFLINE;
  const sizeClass = size === 'sm' ? 'h-2 w-2 ring-1' : 'h-2.5 w-2.5 ring-2';

  return (
    <span
      role="status"
      aria-label={label}
      title={label}
      data-testid={`presence-indicator-${status.toLowerCase()}`}
      className={`inline-block shrink-0 rounded-full ${colorClass} ${sizeClass} ${className}`}
    />
  );
}
