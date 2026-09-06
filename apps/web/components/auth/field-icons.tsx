/**
 * Minimal line icons for authentication inputs (Phase 2C).
 *
 * Hand-drawn strokes matching the app icon language — no icon fonts.
 * Decorative only (aria-hidden); inputs keep real <label>s.
 */

import type { ReactNode } from 'react';

function FieldIcon({ children }: { children: ReactNode }) {
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
      className="h-4 w-4"
    >
      {children}
    </svg>
  );
}

export function MailIcon() {
  return (
    <FieldIcon>
      <rect x="2" y="3.5" width="12" height="9" rx="2" />
      <path d="m3.5 6 4.5 3 4.5-3" />
    </FieldIcon>
  );
}

export function LockIcon() {
  return (
    <FieldIcon>
      <rect x="3.5" y="7" width="9" height="6.5" rx="2" />
      <path d="M5.5 7V5.5a2.5 2.5 0 0 1 5 0V7" />
    </FieldIcon>
  );
}

export function PersonIcon() {
  return (
    <FieldIcon>
      <circle cx="8" cy="5.5" r="2.5" />
      <path d="M3.3 13.5a4.7 4.7 0 0 1 9.4 0" />
    </FieldIcon>
  );
}
