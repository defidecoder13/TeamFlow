/**
 * Labeled form field with accessible error wiring.
 */

import type { InputHTMLAttributes, ReactNode } from 'react';

interface AuthFieldProps extends InputHTMLAttributes<HTMLInputElement> {
  id: string;
  label: string;
  error?: string | null;
  /** Optional decorative leading icon (inputs keep real labels). */
  icon?: ReactNode;
}

export function AuthField({ id, label, error, icon, ...inputProps }: AuthFieldProps) {
  const errorId = `${id}-error`;
  const describedBy = error ? errorId : undefined;
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-[13px] font-medium text-zinc-700">
        {label}
      </label>
      <div className="relative">
        {icon ? (
          <span
            aria-hidden="true"
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400"
          >
            {icon}
          </span>
        ) : null}
        <input
          id={id}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          {...inputProps}
          className={[
            'h-[42px] w-full rounded-lg border bg-white text-sm text-zinc-900',
            'shadow-[0_1px_2px_rgba(0,0,0,0.04)] outline-none transition-colors',
            'placeholder:text-zinc-400',
            'focus:ring-2',
            icon ? 'pl-9 pr-3' : 'px-3',
            error
              ? 'border-red-600 focus:border-red-600 focus:ring-red-600/10'
              : 'border-stone-200 hover:border-stone-300 focus:border-zinc-900 focus:ring-zinc-900/10',
            inputProps.className ?? '',
          ].join(' ')}
        />
      </div>
      {error ? (
        <p id={errorId} role="alert" className="mt-1.5 text-[13px] leading-snug text-red-700">
          {error}
        </p>
      ) : null}
    </div>
  );
}
