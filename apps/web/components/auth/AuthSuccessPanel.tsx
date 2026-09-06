/**
 * Post-action success state shared by the auth forms.
 */

import Link from 'next/link';
import type { ReactNode } from 'react';

interface AuthSuccessPanelProps {
  title: string;
  children: ReactNode;
  actionHref?: string;
  actionLabel?: string;
}

export function AuthSuccessPanel({
  title,
  children,
  actionHref,
  actionLabel,
}: AuthSuccessPanelProps) {
  return (
    <div
      role="status"
      className="rounded-xl border border-stone-200 bg-stone-50 px-5 py-6 text-center"
    >
      <span
        aria-hidden="true"
        className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-stone-900"
      >
        <svg viewBox="0 0 16 16" className="h-5 w-5" fill="none" stroke="#fff" strokeWidth="2">
          <path d="M3 8.5 6.5 12 13 4.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </span>
      <h2 className="mt-4 text-lg font-semibold tracking-tight text-stone-900">{title}</h2>
      <div className="mt-1.5 text-sm leading-relaxed text-stone-600">{children}</div>
      {actionHref && actionLabel ? (
        <Link
          href={actionHref}
          className="mt-5 inline-flex h-[42px] items-center justify-center rounded-lg bg-stone-900 px-4 text-sm font-medium text-white transition-colors hover:bg-stone-800 active:bg-stone-950"
        >
          {actionLabel}
        </Link>
      ) : null}
    </div>
  );
}
