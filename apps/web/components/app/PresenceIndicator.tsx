/**
 * Minimal accessible presence indicator (Phase 4I.3).
 *
 * Renders a labeled status dot (Online, Offline) without relying solely on
 * color. The dot is `role="img"` — never `role="status"`: a roster renders
 * dozens of these, and every live region would queue announcements on
 * presence churn. Dynamic changes are announced by list-level regions.
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
};

const STATUS_STYLES: Record<PresenceStatus, string> = {
  ONLINE: 'bg-emerald-500 ring-white',
  OFFLINE: 'bg-[#c8c5cb] ring-white',
};

export function PresenceIndicator({ status, size = 'md', className = '' }: PresenceIndicatorProps) {
  const label = STATUS_LABELS[status] ?? 'Offline';
  const colorClass = STATUS_STYLES[status] ?? STATUS_STYLES.OFFLINE;
  const sizeClass = size === 'sm' ? 'h-2 w-2 ring-1' : 'h-2.5 w-2.5 ring-2';

  return (
    <span
      role="img"
      aria-label={label}
      title={label}
      data-testid={`presence-indicator-${status.toLowerCase()}`}
      className={`inline-block shrink-0 rounded-full ${colorClass} ${sizeClass} ${className}`}
    />
  );
}
