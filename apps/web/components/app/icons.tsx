/**
 * Minimal line-icon set for the app shell (Phase 1D).
 *
 * Hand-drawn geometric strokes — no icon library. All icons are decorative
 * (aria-hidden) and inherit text color via `currentColor`.
 */

import type { ReactNode } from 'react';

function Icon({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className ?? 'h-4 w-4'}
    >
      {children}
    </svg>
  );
}

export function HomeIcon({ className }: { className?: string }) {
  return (
    <Icon className={className}>
      <path d="M3 8.5 8 3.5l5 5" />
      <path d="M4.5 7.5V13h7V7.5" />
    </Icon>
  );
}

export function ThreadsIcon({ className }: { className?: string }) {
  return (
    <Icon className={className}>
      <path d="M3 4.5h10" />
      <path d="M5 8h8" />
      <path d="M3 11.5h10" />
    </Icon>
  );
}

export function MentionsIcon({ className }: { className?: string }) {
  return (
    <Icon className={className}>
      <circle cx="8" cy="8" r="5" />
      <circle cx="8" cy="8" r="1.8" />
      <path d="M9.8 8v1.6a1.4 1.4 0 0 0 2.8 0V8" />
    </Icon>
  );
}

export function SavedIcon({ className }: { className?: string }) {
  return (
    <Icon className={className}>
      <path d="M5 2.5h6V13l-3-2.2L5 13V2.5z" />
    </Icon>
  );
}

export function HashIcon({ className }: { className?: string }) {
  return (
    <Icon className={className}>
      <path d="M6 2.5 4.7 13.5" />
      <path d="M11.3 2.5 10 13.5" />
      <path d="M3.2 6h9.6" />
      <path d="M3.2 10h9.6" />
    </Icon>
  );
}

export function LockIcon({ className }: { className?: string }) {
  return (
    <Icon className={className}>
      <rect x="3.5" y="7" width="9" height="6.5" rx="2" />
      <path d="M5.5 7V5.5a2.5 2.5 0 0 1 5 0V7" />
    </Icon>
  );
}

export function PersonIcon({ className }: { className?: string }) {
  return (
    <Icon className={className}>
      <circle cx="8" cy="5.5" r="2.5" />
      <path d="M3.3 13.5a4.7 4.7 0 0 1 9.4 0" />
    </Icon>
  );
}

export function MembersIcon({ className }: { className?: string }) {
  return (
    <Icon className={className}>
      <circle cx="6" cy="6" r="2.5" />
      <path d="M1.8 13a4.2 4.2 0 0 1 8.4 0" />
      <circle cx="11.5" cy="6.5" r="2" />
      <path d="M10.8 11.2a3.4 3.4 0 0 1 3.4 3.3" />
    </Icon>
  );
}

export function SearchIcon({ className }: { className?: string }) {
  return (
    <Icon className={className}>
      <circle cx="7" cy="7" r="4.5" />
      <path d="M10.5 10.5 14 14" />
    </Icon>
  );
}

export function BellIcon({ className }: { className?: string }) {
  return (
    <Icon className={className}>
      <path d="M8 2.8a3.7 3.7 0 0 1 3.7 3.7c0 2.6.9 3.6.9 3.6H3.4s.9-1 .9-3.6A3.7 3.7 0 0 1 8 2.8z" />
      <path d="M6.9 12.4a1.2 1.2 0 0 0 2.2 0" />
    </Icon>
  );
}

export function PlusIcon({ className }: { className?: string }) {
  return (
    <Icon className={className}>
      <path d="M8 3.5v9" />
      <path d="M3.5 8h9" />
    </Icon>
  );
}

export function ChevronDownIcon({ className }: { className?: string }) {
  return (
    <Icon className={className}>
      <path d="M4.5 6.5 8 10l3.5-3.5" />
    </Icon>
  );
}

export function SettingsIcon({ className }: { className?: string }) {
  return (
    <Icon className={className}>
      <circle cx="8" cy="8" r="2.2" />
      <path d="M8 2v2M8 12v2M2 8h2M12 8h2M3.8 3.8l1.4 1.4M10.8 10.8l1.4 1.4M12.2 3.8l-1.4 1.4M5.2 10.8l-1.4 1.4" />
    </Icon>
  );
}

export function HelpIcon({ className }: { className?: string }) {
  return (
    <Icon className={className}>
      <circle cx="8" cy="8" r="6" />
      <path d="M6.3 6.1A1.8 1.8 0 0 1 8 4.7c1 0 1.8.7 1.8 1.6 0 1.2-1.2 1.4-1.8 2.1v.7" />
      <path d="M8 11.4v.2" />
    </Icon>
  );
}

export function SignOutIcon({ className }: { className?: string }) {
  return (
    <Icon className={className}>
      <path d="M9.5 3.5h-5v9h5" />
      <path d="M6.5 8H13" />
      <path d="M11 5.8 13.2 8 11 10.2" />
    </Icon>
  );
}
