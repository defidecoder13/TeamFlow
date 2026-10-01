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
      className="rounded-xl border border-[#E2E1E1] bg-[#FAF9F8] px-6 py-8 text-center"
    >
      <span
        aria-hidden="true"
        className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-[#2E3440] text-white"
      >
        <svg
          viewBox="0 0 16 16"
          className="h-5 w-5"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        >
          <path d="M3 8.5 6.5 12 13 4.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </span>
      <h2 className="mt-4 text-lg font-semibold tracking-tight text-[#171A21]">{title}</h2>
      <div className="mt-2 text-sm leading-relaxed text-[#4F5360]">{children}</div>
      {actionHref && actionLabel ? (
        <Link
          href={actionHref}
          className="mt-6 inline-flex h-[42px] items-center justify-center rounded-lg bg-[#2E3440] px-5 text-sm font-medium text-white transition-all hover:bg-[#1F242C] active:scale-[0.98]"
        >
          {actionLabel}
        </Link>
      ) : null}
    </div>
  );
}
