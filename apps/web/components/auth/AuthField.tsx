/**
 * Labeled form field with accessible error wiring.
 */

import type { InputHTMLAttributes, ReactNode, Ref } from 'react';

interface AuthFieldProps extends InputHTMLAttributes<HTMLInputElement> {
  id: string;
  label: string;
  error?: string | null;
  /** Optional decorative leading icon (inputs keep real labels). */
  icon?: ReactNode;
  /** Focus target for validate-on-submit flows (React 19 ref-as-prop). */
  ref?: Ref<HTMLInputElement>;
}

export function AuthField({ id, label, error, icon, ref, ...inputProps }: AuthFieldProps) {
  const errorId = `${id}-error`;
  const describedBy = error ? errorId : undefined;
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-[13px] font-medium text-[#171A21]">
        {label}
      </label>
      <div className="relative">
        {icon ? (
          <span
            aria-hidden="true"
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[#737782]"
          >
            {icon}
          </span>
        ) : null}
        <input
          id={id}
          ref={ref}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          {...inputProps}
          className={[
            'h-[42px] w-full rounded-lg border bg-white text-sm text-[#171A21]',
            'shadow-[0_1px_2px_rgba(0,0,0,0.04)] outline-none transition-all duration-150',
            'placeholder:text-[#9296A0]',
            icon ? 'pl-9 pr-3' : 'px-3',
            error
              ? 'border-[#BA1A1A] focus:border-[#BA1A1A] focus:ring-2 focus:ring-[#BA1A1A]/10'
              : 'border-[#DDDCDF] hover:border-[#C8C5CB] focus:border-[#3157D5] focus:ring-2 focus:ring-[#3157D5]/10',
            'disabled:cursor-not-allowed disabled:opacity-60',
            inputProps.className ?? '',
          ].join(' ')}
        />
      </div>
      {error ? (
        <p id={errorId} role="alert" className="mt-1.5 text-[13px] leading-snug text-[#BA1A1A]">
          {error}
        </p>
      ) : null}
    </div>
  );
}
