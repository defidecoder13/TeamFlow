'use client';

import Link from 'next/link';
import { useScrollReveal } from './motion';

const FONT_STACK = "font-['Inter',ui-sans-serif,system-ui,sans-serif]";

const STEPS = [
  {
    n: '01',
    title: 'Create your workspace',
    description:
      'Sign up in seconds, name your workspace, and your team has a home. No credit card, no setup calls.',
  },
  {
    n: '02',
    title: 'Invite your team',
    description:
      'Add members from workspace settings. They join with an invite link and land ready to talk.',
  },
  {
    n: '03',
    title: 'Talk in channels',
    description:
      'Open a channel, reply in threads when it matters, and find anything later with permission-aware search.',
  },
] as const;

export function NewLandingSteps() {
  const { ref: sectionRef, visible, reduced } = useScrollReveal<HTMLElement>(0.2);

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
      aria-labelledby="steps-heading"
      data-testid="steps"
      className={`w-full scroll-mt-20 border-y border-[#E2E1E1] bg-white px-6 py-16 md:py-24 lg:px-12 ${FONT_STACK}`}
    >
      <div className="mx-auto w-full max-w-7xl">
        <div className="max-w-2xl" style={fadeUp(8, 0)}>
          <h2
            id="steps-heading"
            className="text-balance text-[30px] font-semibold leading-[1.15] tracking-[-0.03em] text-[#171A21] md:text-[38px] md:leading-[1.12]"
          >
            Get started in minutes.
          </h2>
          <p className="mt-3 max-w-xl text-[15px] leading-[1.55] text-[#4F5360] md:text-[16px]">
            Three steps, in this order. Most teams send their first message the same day they sign
            up.
          </p>
        </div>

        <ol className="mt-10 grid grid-cols-1 gap-8 md:mt-12 md:grid-cols-3 md:gap-8">
          {STEPS.map((step, i) => (
            <li key={step.n} style={fadeUp(14, 120 + i * 110)}>
              <p
                aria-hidden="true"
                className="text-[13px] font-semibold tabular-nums tracking-[0.06em] text-[#3157D5]"
              >
                {step.n}
              </p>
              <h3 className="mt-2 text-[18px] font-semibold leading-[1.3] tracking-[-0.015em] text-[#171A21]">
                {step.title}
              </h3>
              <p className="mt-2 text-[14px] leading-[1.55] text-[#4F5360]">{step.description}</p>
            </li>
          ))}
        </ol>

        <p className="mt-10" style={fadeUp(8, 460)}>
          <Link
            href="/sign-up"
            className="group inline-flex h-10 items-center gap-2 rounded-lg bg-black bg-[#2E3440] px-5 text-[13px] font-medium text-white shadow-xs transition-[background-color,scale] duration-150 ease-out-expo hover:bg-[#1F242C] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#3157D5] active:scale-[0.98] motion-reduce:transition-none motion-reduce:active:scale-100"
          >
            Start for free
            <span
              aria-hidden="true"
              className="inline-block transition-transform group-hover:translate-x-1 motion-reduce:transition-none motion-reduce:group-hover:translate-x-0"
            >
              →
            </span>
          </Link>
        </p>
      </div>
    </section>
  );
}
