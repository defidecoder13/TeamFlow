import Link from 'next/link';
import { TeamFlowLogo } from '../brand/TeamFlowLogo';

const FONT_STACK = "font-['Inter',ui-sans-serif,system-ui,sans-serif]";

const NAV_ITEMS = [
  { label: 'Product', href: '#product' },
  { label: 'Features', href: '#features' },
  { label: 'Solutions', href: '#solutions' },
] as const;

const linkClassName =
  'rounded-md px-2.5 py-1 text-[13px] font-medium text-[#4F5360] transition-colors hover:bg-[#F0EFF2] hover:text-[#171A21] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#3157D5] motion-reduce:transition-none';

export function NewLandingFooter() {
  return (
    <footer
      data-testid="landing-footer"
      className={`w-full border-t border-[#E2E1E1] bg-[#F8F7F6] ${FONT_STACK}`}
    >
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-6 py-10 lg:px-12">
        <div className="flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
          <Link
            href="/"
            aria-label="TeamFlow home"
            className="inline-flex w-fit shrink-0 items-center rounded-md text-[#171A21] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#3157D5]"
          >
            <TeamFlowLogo size={22} wordmarkClassName="text-[16px] font-semibold tracking-tight text-[#171A21]" />
          </Link>
          <nav aria-label="Footer navigation">
            <ul className="flex flex-wrap items-center gap-x-3 gap-y-2 sm:gap-x-4">
              {NAV_ITEMS.map((item) => (
                <li key={item.label}>
                  <Link href={item.href} className={linkClassName}>
                    {item.label}
                  </Link>
                </li>
              ))}
              <li>
                <Link href="/sign-in" className={linkClassName}>
                  Sign In
                </Link>
              </li>
              <li>
                <Link href="/sign-up" className={linkClassName}>
                  Start Free
                </Link>
              </li>
            </ul>
          </nav>
        </div>
        <p className="text-[12px] text-[#737782]">© 2026 TeamFlow. All rights reserved.</p>
      </div>
    </footer>
  );
}
