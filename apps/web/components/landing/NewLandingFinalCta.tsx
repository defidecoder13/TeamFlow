'use client';

import Link from 'next/link';
import { useScrollReveal } from './motion';

const FONT_STACK = "font-['Inter',ui-sans-serif,system-ui,sans-serif]";

export function NewLandingFinalCta() {
  const { ref: sectionRef, visible, reduced } = useScrollReveal<HTMLElement>(0.25);

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
      aria-labelledby="final-cta-heading"
      data-testid="final-cta"
      className={`w-full bg-[#F8F7F6] px-6 py-16 md:py-24 lg:px-12 ${FONT_STACK}`}
    >
      <div
        data-testid="final-cta-panel"
        className="mx-auto w-full max-w-7xl rounded-[24px] border border-[#2E3440] bg-[#151515] px-6 py-14 text-center shadow-[0_24px_60px_-16px_rgba(20,25,35,0.25)] md:py-20"
        style={fadeUp(20, 0)}
      >
        <p
          className="text-[11px] font-semibold uppercase tracking-[0.06em] text-[#9296A0]"
          style={fadeUp(10, 90)}
        >
          Ready when you are
        </p>
        <h2
          id="final-cta-heading"
          className="mx-auto mt-4 max-w-2xl text-[32px] font-semibold leading-[1.12] tracking-[-0.03em] text-white md:text-[44px] md:leading-[1.08]"
          style={fadeUp(14, 180)}
        >
          Bring clarity to your workspace today.
        </h2>
        <p
          className="mx-auto mt-4 max-w-xl text-[15px] leading-[1.55] text-[#A7A9AF] md:text-[16px]"
          style={fadeUp(10, 270)}
        >
          Bring conversations, people, and everyday work together in one calm workspace.
        </p>
        <div
          className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row"
          style={fadeUp(8, 360)}
        >
          <Link
            href="/sign-up"
            className="group inline-flex h-10 w-full items-center justify-center gap-2 rounded-lg bg-white px-5 text-[13px] font-medium text-[#171A21] shadow-xs transition-[background-color,scale] duration-150 ease-out-expo hover:bg-[#F5F4F3] active:scale-[0.98] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#3157D5] sm:w-auto motion-reduce:transition-none motion-reduce:active:scale-100"
          >
            Get started free
            <span
              aria-hidden="true"
              className="inline-block transition-transform group-hover:translate-x-1 motion-reduce:transition-none motion-reduce:group-hover:translate-x-0"
            >
              →
            </span>
          </Link>
          <Link
            href="/sign-in"
            className="inline-flex h-10 items-center justify-center rounded-lg px-5 text-[13px] font-medium text-[#DDDCDF] transition-colors hover:bg-white/10 hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#3157D5] motion-reduce:transition-none"
          >
            Sign in
          </Link>
        </div>
      </div>
    </section>
  );
}
