'use client';

import { useScrollReveal } from './motion';

const FONT_STACK = "font-['Inter',ui-sans-serif,system-ui,sans-serif]";

const PRINCIPLES = [
  {
    title: "Real-time when you're online",
    description: "Messages, threads, and replies land the moment they're sent.",
  },
  {
    title: "Calm when you're not",
    description: 'Catch up from where you left off. Nothing demands an instant reply.',
  },
  {
    title: 'Search that respects permissions',
    description: 'Find what your team knows, limited to what you can see.',
  },
] as const;

export function NewLandingPrinciples() {
  const { ref: sectionRef, visible, reduced } = useScrollReveal<HTMLElement>(0.4);

  const revealStyle = reduced
    ? undefined
    : {
        opacity: visible ? 1 : 0,
        transform: visible ? 'translateY(0)' : 'translateY(12px)',
        transition:
          'opacity 600ms cubic-bezier(0.23, 1, 0.32, 1), transform 600ms cubic-bezier(0.23, 1, 0.32, 1)',
      };

  return (
    <section
      ref={sectionRef}
      aria-label="How TeamFlow stays calm"
      data-testid="principles"
      className={`w-full border-y border-[#E2E1E1] bg-white px-6 py-12 lg:px-12 lg:py-14 ${FONT_STACK}`}
    >
      <ul
        className="mx-auto grid w-full max-w-7xl grid-cols-1 gap-8 md:grid-cols-3 md:gap-10"
        style={revealStyle}
      >
        {PRINCIPLES.map((principle) => (
          <li key={principle.title} className="flex flex-col">
            <p className="text-[14px] font-semibold leading-[1.4] text-[#171A21]">
              {principle.title}
            </p>
            <p className="mt-1.5 text-[14px] leading-[1.55] text-[#4F5360]">
              {principle.description}
            </p>
          </li>
        ))}
      </ul>
    </section>
  );
}
