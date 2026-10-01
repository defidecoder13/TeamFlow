import React, { forwardRef, useId } from 'react';

interface AuthFieldProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label: string;
  error?: string;
  hint?: string;
  prefixText?: string;
  suffixText?: string;
  containerClassName?: string;
}

export const AuthField = forwardRef<HTMLInputElement, AuthFieldProps>(
  (
    {
      label,
      error,
      hint,
      prefixText,
      suffixText,
      required,
      id: customId,
      className = '',
      containerClassName = '',
      ...rest
    },
    ref
  ) => {
    const generatedId = useId();
    const id = customId || generatedId;
    const hintId = `${id}-hint`;
    const errorId = `${id}-error`;

    const describedBy = [error ? errorId : null, hint ? hintId : null]
      .filter(Boolean)
      .join(' ') || undefined;

    return (
      <div className={`flex flex-col gap-1.5 ${containerClassName}`}>
        <div className="flex items-center justify-between">
          <label htmlFor={id} className="text-[13px] font-semibold text-[#171A21]">
            {label} {required && <span className="text-[#C94A45]" aria-hidden="true">*</span>}
          </label>
        </div>

        <div
          className={`flex items-center rounded-[8px] border transition-colors bg-white overflow-hidden ${
            error
              ? 'border-[#C94A45] focus-within:ring-2 focus-within:ring-[#C94A45]/20'
              : 'border-[#E4E2DF] hover:border-[#D2D0CC] focus-within:border-[#3157D5] focus-within:ring-2 focus-within:ring-[#EEF2FF]'
          }`}
        >
          {prefixText && (
            <span className="pl-3 pr-1 text-[13px] text-[#737782] select-none font-normal">
              {prefixText}
            </span>
          )}
          <input
            ref={ref}
            id={id}
            required={required}
            aria-invalid={Boolean(error)}
            aria-describedby={describedBy}
            className={`w-full px-3 py-2 text-[14px] text-[#171A21] placeholder:text-[#737782] bg-transparent outline-none disabled:opacity-50 disabled:bg-[#F6F5F3] ${
              prefixText ? 'pl-1' : ''
            } ${suffixText ? 'pr-1' : ''} ${className}`}
            {...rest}
          />
          {suffixText && (
            <span className="pr-3 pl-1 text-[13px] text-[#737782] select-none font-normal">
              {suffixText}
            </span>
          )}
        </div>

        {error && (
          <p id={errorId} role="alert" className="text-[12px] font-medium text-[#C94A45]">
            {error}
          </p>
        )}

        {!error && hint && (
          <p id={hintId} className="text-[12px] text-[#737782]">
            {hint}
          </p>
        )}
      </div>
    );
  }
);

AuthField.displayName = 'AuthField';
