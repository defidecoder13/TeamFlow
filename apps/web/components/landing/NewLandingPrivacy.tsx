'use client';

import { useScrollReveal } from './motion';

const FONT_STACK = "font-['Inter',ui-sans-serif,system-ui,sans-serif]";

function LockIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      aria-hidden="true"
      focusable="false"
      className={className ?? 'h-6 w-6'}
    >
      <rect x="5" y="10" width="14" height="10" rx="2.5" />
      <path d="M8 10V7a4 4 0 0 1 8 0v3" />
    </svg>
  );
}

function EyeIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      aria-hidden="true"
      focusable="false"
      className={className ?? 'h-6 w-6'}
    >
      <path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

function ShieldIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      aria-hidden="true"
      focusable="false"
      className={className ?? 'h-6 w-6'}
    >
      <path d="M12 2.5 20 6v6c0 5-3.5 8-8 9.5C7.5 20 4 17 4 12V6l8-3.5Z" strokeLinejoin="round" />
      <path d="m9 12 2 2 4-4.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

const FACTS = [
  {
    title: 'Workspace-scoped',
    description:
      'Every channel, message, and file belongs to one workspace. Nothing crosses the boundary.',
    Icon: LockIcon,
    tile: 'bg-[#EEF2FF] text-[#3157D5]',
  },
  {
    title: 'Membership-gated search',
    description:
      'Results are limited to channels you can see. Private stays private, even in search.',
    Icon: EyeIcon,
    tile: 'bg-[#EAF5EF] text-[#48B88A]',
  },
  {
    title: 'Owner controls',
    description:
      'Owners manage members, roles, and invitations — and can rename or delete the workspace any time.',
    Icon: ShieldIcon,
    tile: 'bg-[#FDF6E9] text-[#E8A33A]',
  },
] as const;

export function NewLandingPrivacy() {
  const { ref: sectionRef, visible, reduced } = useScrollReveal<HTMLElement>(0.25);

  const fadeUp = (dy: number, delay: number) =>
    reduced
      ? undefined
      : {
          opacity: visible ? 1 : 0,
          transform: visible ? 'translateY(0)' : `translateY(${dy}px)`,
          transition: `opacity 600ms ease-out ${delay}ms, transform 600ms ease-out ${delay}ms`,
        };

  return (
    <section
      ref={sectionRef}
      aria-labelledby="privacy-heading"
      data-testid="privacy"
      className={`w-full scroll-mt-20 border-t border-[#E2E1E1] bg-white px-6 py-16 md:py-24 lg:px-12 ${FONT_STACK}`}
    >
      <div className="mx-auto w-full max-w-7xl">
        <div className="max-w-2xl" style={fadeUp(8, 0)}>
          <h2
            id="privacy-heading"
            className="text-balance text-[30px] font-semibold leading-[1.15] tracking-[-0.03em] text-[#171A21] md:text-[38px] md:leading-[1.12]"
          >
            Private by default.
          </h2>
          <p className="mt-3 max-w-xl text-[15px] leading-[1.55] text-[#4F5360] md:text-[16px]">
            Calm only works if it&apos;s safe. Permissions are structural here, not a setting you
            hope someone enabled.
          </p>
        </div>

        <ul className="mt-10 grid grid-cols-1 gap-6 md:mt-12 md:grid-cols-3 md:gap-8">
          {FACTS.map((fact, i) => (
            <li
              key={fact.title}
              className="rounded-xl border border-[#E2E1E1] bg-[#FAF9F8] p-6 transition-colors hover:bg-white"
              style={fadeUp(14, 120 + i * 110)}
            >
              <span
                className={`flex h-11 w-11 items-center justify-center rounded-[10px] ${fact.tile}`}
              >
                <fact.Icon />
              </span>
              <h3 className="mt-4 text-[17px] font-semibold leading-[1.35] tracking-[-0.01em] text-[#171A21]">
                {fact.title}
              </h3>
              <p className="mt-2 text-[14px] leading-[1.55] text-[#4F5360]">{fact.description}</p>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
