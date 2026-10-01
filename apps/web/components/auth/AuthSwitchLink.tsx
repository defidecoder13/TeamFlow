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
    <p className="mb-8 text-right text-[13px] text-[#737782] lg:mb-10">
      <span>{prompt}</span>{' '}
      <Link
        href={href}
        className="font-medium whitespace-nowrap text-[#171A21] underline decoration-[#DDDCDF] underline-offset-4 transition-colors hover:text-[#3157D5] hover:decoration-[#3157D5]"
      >
        {actionLabel}
      </Link>
    </p>
  );
}
