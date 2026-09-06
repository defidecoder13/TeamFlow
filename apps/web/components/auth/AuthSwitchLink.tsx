/**
 * Top-right switch link between sign-in and sign-up (Phase 2C).
 */

import Link from 'next/link';

interface AuthSwitchLinkProps {
  prompt: string;
  actionLabel: string;
  href: string;
}

export function AuthSwitchLink({ prompt, actionLabel, href }: AuthSwitchLinkProps) {
  return (
    <p className="mb-7 text-right text-[13px] text-zinc-500">
      {prompt}{' '}
      <Link
        href={href}
        className="font-medium text-zinc-900 underline decoration-zinc-300 underline-offset-4 transition-colors hover:decoration-zinc-900"
      >
        {actionLabel}
      </Link>
    </p>
  );
}
