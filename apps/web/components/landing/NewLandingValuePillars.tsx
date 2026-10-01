'use client';

import { useScrollReveal } from './motion';

const FONT_STACK = "font-['Inter',ui-sans-serif,system-ui,sans-serif]";

function LayersIcon({ className }: { className?: string }) {
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
      <path d="m12 3 9 5-9 5-9-5 9-5Z" strokeLinejoin="round" />
      <path d="m4.5 12.5 7.5 4.2 7.5-4.2" strokeLinecap="round" strokeLinejoin="round" />
      <path d="m4.5 16.5 7.5 4.2 7.5-4.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function SearchIcon({ className }: { className?: string }) {
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
      <circle cx="11" cy="11" r="7" />
      <path d="m16.5 16.5 4 4" strokeLinecap="round" />
    </svg>
  );
}

function SyncIcon({ className }: { className?: string }) {
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
      <path d="M20 12a8 8 0 0 1-14.2 5" strokeLinecap="round" />
      <path d="M4 12a8 8 0 0 1 14.2-5" strokeLinecap="round" />
      <path d="M18.5 3.5v4h-4" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M5.5 20.5v-4h4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

const PILLARS = [
  {
    title: 'Channels that stay on topic',
    description:
      'Keep conversations organized around the work that matters, with threads for the side discussions.',
    Icon: LayersIcon,
    tile: 'bg-[#EEF2FF] text-[#3157D5]',
  },
  {
    title: 'Search with permission built in',
    description:
      'Find answers in the conversations and files your team already has — limited to what you can see.',
    Icon: SearchIcon,
    tile: 'bg-[#EAF5EF] text-[#48B88A]',
  },
  {
    title: 'Real-time and async in harmony',
    description:
      "Stay connected when you're online and keep moving when you're not. Catch up from where you left off.",
    Icon: SyncIcon,
    tile: 'bg-[#FDF6E9] text-[#E8A33A]',
  },
] as const;

export function NewLandingValuePillars() {
  const { ref: sectionRef, visible, reduced } = useScrollReveal<HTMLElement>(0.2);

  const fadeUp = (dy: number, delay: number) =>
    reduced
      ? undefined
      : {
          opacity: visible ? 1 : 0,
          transform: visible ? 'translateY(0)' : `translateY(${dy}px)`,
          transition: `opacity 600ms cubic-bezier(0.23, 1, 0.32, 1) ${delay}ms, transform 600ms cubic-bezier(0.23, 1, 0.32, 1) ${delay}ms`,
        };

  return (
    <section
      ref={sectionRef}
      id="features"
      aria-labelledby="value-pillars-heading"
      data-testid="value-pillars"
      className={`w-full scroll-mt-20 bg-white px-6 py-16 md:py-24 lg:px-12 ${FONT_STACK}`}
    >
      <div className="mx-auto w-full max-w-7xl">
        <div className="max-w-2xl" style={fadeUp(8, 0)}>
          <h2
            id="value-pillars-heading"
            className="text-balance text-[30px] font-semibold leading-[1.15] tracking-[-0.03em] text-[#171A21] md:text-[38px] md:leading-[1.12]"
          >
            Crafted to protect your team&apos;s most precious asset: attention.
          </h2>
          <p className="mt-3 max-w-xl text-[15px] leading-[1.55] text-[#4F5360] md:text-[16px]">
            TeamFlow brings conversations, context, and collaboration together without turning your
            workspace into another source of noise.
          </p>
        </div>

        <ul className="mt-10 border-t border-[#E2E1E1] md:mt-12">
          {PILLARS.map((pillar, i) => (
            <li
              key={pillar.title}
              data-testid={`pillar-card-${i + 1}`}
              className="grid grid-cols-1 gap-4 border-b border-[#E2E1E1] py-7 md:grid-cols-12 md:items-baseline md:gap-6 md:py-8"
            >
              <div className="flex items-center gap-4 md:col-span-5">
                <span
                  className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-[10px] ${pillar.tile}`}
                >
                  <pillar.Icon />
                </span>
                <h3 className="text-[18px] font-semibold leading-[1.3] tracking-[-0.015em] text-[#171A21]">
                  {pillar.title}
                </h3>
              </div>
              <p className="text-[14px] leading-[1.55] text-[#4F5360] md:col-span-6 md:col-start-7">
                {pillar.description}
              </p>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
