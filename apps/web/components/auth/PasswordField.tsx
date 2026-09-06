/**
 * Password field with a show/hide toggle.
 */

'use client';

import { useState, type ReactNode } from 'react';
import { AuthField } from './AuthField';

interface PasswordFieldProps {
  id: string;
  label: string;
  autoComplete: 'current-password' | 'new-password';
  value: string;
  error?: string | null;
  disabled?: boolean;
  icon?: ReactNode;
  placeholder?: string;
  onChange: (value: string) => void;
  onBlur: () => void;
}

export function PasswordField({
  id,
  label,
  autoComplete,
  value,
  error,
  disabled,
  icon,
  placeholder,
  onChange,
  onBlur,
}: PasswordFieldProps) {
  const [visible, setVisible] = useState(false);
  return (
    <div className="relative">
      <AuthField
        id={id}
        label={label}
        type={visible ? 'text' : 'password'}
        autoComplete={autoComplete}
        required
        value={value}
        error={error}
        disabled={disabled}
        icon={icon}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
        onBlur={onBlur}
        className="pr-16"
      />
      <button
        type="button"
        aria-pressed={visible}
        aria-label={visible ? 'Hide password' : 'Show password'}
        disabled={disabled}
        onClick={() => setVisible((current) => !current)}
        className="absolute right-2 top-8 rounded-md px-2 py-1 text-[13px] font-medium text-zinc-500 transition-colors hover:text-zinc-900 focus-visible:outline-2 focus-visible:outline-zinc-900 disabled:opacity-50"
      >
        {visible ? 'Hide' : 'Show'}
      </button>
    </div>
  );
}
