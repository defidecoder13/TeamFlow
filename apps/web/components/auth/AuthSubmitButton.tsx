/**
 * Primary authentication submit button with a loading state.
 */

import type { ReactNode } from 'react';

interface AuthSubmitButtonProps {
  pending: boolean;
  pendingLabel: string;
  children: ReactNode;
}

export function AuthSubmitButton({ pending, pendingLabel, children }: AuthSubmitButtonProps) {
  return (
    <button
      type="submit"
      disabled={pending}
      aria-busy={pending}
      className="group flex h-[42px] w-full items-center justify-center gap-2 rounded-lg bg-[#2E3440] text-sm font-medium text-white transition-all duration-150 hover:bg-[#1F242C] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#3157D5] active:scale-[0.98] motion-reduce:active:scale-100 disabled:cursor-not-allowed disabled:opacity-60"
    >
      {pending ? (
        <>
          <svg
            aria-hidden="true"
            focusable="false"
            viewBox="0 0 16 16"
            className="h-4 w-4 animate-spin"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <path d="M8 1.5a6.5 6.5 0 1 0 6.5 6.5" strokeLinecap="round" />
          </svg>
          <span>{pendingLabel}</span>
        </>
      ) : (
        <>
          <span>{children}</span>
          <span aria-hidden="true" className="transition-transform group-hover:translate-x-0.5">
            &rarr;
          </span>
        </>
      )}
    </button>
  );
}
