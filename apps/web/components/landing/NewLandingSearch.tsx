'use client';

import Link from 'next/link';
import { useScrollReveal } from './motion';

const FONT_STACK = "font-['Inter',ui-sans-serif,system-ui,sans-serif]";

function CheckIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      aria-hidden="true"
      focusable="false"
      className={className ?? 'h-4 w-4'}
    >
      <path d="m5 12.5 4.5 4.5L19 7.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function HashIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      aria-hidden="true"
      focusable="false"
      className={className ?? 'h-4 w-4'}
    >
      <path d="M7.5 3.5 5.5 16.5M14.5 3.5l-2 13M3.5 7.5h13M3.5 12.5h13" strokeLinecap="round" />
    </svg>
  );
}

function ThreadIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      aria-hidden="true"
      focusable="false"
      className={className ?? 'h-4 w-4'}
    >
      <path d="M3.5 5.5h9a3 3 0 0 1 0 6H7" strokeLinecap="round" />
      <path d="M3.5 5.5v11" strokeLinecap="round" />
      <circle cx="3.5" cy="5.5" r="1.4" fill="currentColor" stroke="none" />
    </svg>
  );
}

function FileIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      aria-hidden="true"
      focusable="false"
      className={className ?? 'h-4 w-4'}
    >
      <path d="M5 2.5h6L15.5 7v10.5h-10.5v-15Z" strokeLinejoin="round" />
      <path d="M11 2.5V7h4.5" strokeLinejoin="round" />
    </svg>
  );
}

const SEARCH_TRUTHS = [
  {
    title: 'Answers with sources',
    description: 'Every result links back to the message or file behind it.',
  },
  {
    title: 'Narrow by channel, person, or date',
    description: 'Filter results the same way you talk about work.',
  },
  {
    title: 'Private by default',
    description: 'Results respect channel membership — nothing leaks across workspaces.',
  },
] as const;

export function NewLandingSearch() {
  const { ref: sectionRef, visible, reduced } = useScrollReveal<HTMLElement>(0.15);

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
      id="solutions"
      aria-labelledby="search-spotlight-heading"
      data-testid="search-spotlight"
      className={`w-full scroll-mt-20 bg-[#F8F7F6] px-6 py-16 md:py-24 lg:px-12 ${FONT_STACK}`}
    >
      <div className="mx-auto grid w-full max-w-7xl grid-cols-1 items-center gap-10 lg:grid-cols-12 lg:gap-12">
        {/* LEFT: pitch + checklist */}
        <div className="lg:col-span-5">
          <h2
            id="search-spotlight-heading"
            className="text-balance text-[30px] font-semibold leading-[1.15] tracking-[-0.03em] text-[#171A21] md:text-[38px] md:leading-[1.12]"
            style={fadeUp(12, 90)}
          >
            Find anything your team already knows.
          </h2>
          <p
            className="mt-3 max-w-lg text-[15px] leading-[1.55] text-[#4F5360] md:text-[16px]"
            style={fadeUp(10, 180)}
          >
            Search channels, threads, and files from one place — with the same workspace and channel
            permissions as everywhere else.
          </p>
          <ul className="mt-6 space-y-4" style={fadeUp(10, 270)}>
            {SEARCH_TRUTHS.map((truth) => (
              <li key={truth.title} className="flex items-start gap-3">
                <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#EEF2FF] text-[#3157D5]">
                  <CheckIcon />
                </span>
                <span>
                  <span className="block text-[14px] font-semibold text-[#171A21]">
                    {truth.title}
                  </span>
                  <span className="mt-0.5 block text-[13px] leading-[1.5] text-[#4F5360]">
                    {truth.description}
                  </span>
                </span>
              </li>
            ))}
          </ul>
          <p className="mt-6" style={fadeUp(8, 340)}>
            <Link
              href="/sign-in"
              className="rounded text-[13px] font-medium text-[#3157D5] transition-colors hover:text-[#2547BE] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#3157D5] motion-reduce:transition-none"
            >
              Sign in to search your workspace →
            </Link>
          </p>
        </div>

        {/* RIGHT: search results panel (static preview, content stays accessible) */}
        <div className="lg:col-span-7" style={fadeUp(20, 200)}>
          <div
            data-testid="search-panel"
            className="rounded-2xl border border-[#E2E1E1] bg-white p-5 shadow-[0_20px_50px_-16px_rgba(20,25,35,0.08),0_2px_6px_rgba(20,25,35,0.03)] md:p-7"
          >
            <div
              className="rounded-xl border border-[#DDDCDF] bg-[#F5F4F3] p-4"
              style={fadeUp(12, 400)}
              data-testid="search-query"
            >
              <p className="text-[11px] font-medium text-[#737782]">Your search</p>
              <p className="mt-1 text-[14px] font-semibold leading-[1.5] text-[#171A21]">
                calm direction
              </p>
            </div>

            <div className="mt-4 space-y-2.5" style={fadeUp(12, 520)} data-testid="search-results">
              <div className="flex items-center gap-3 rounded-xl border border-[#E2E1E1] bg-white p-3 transition-colors hover:bg-[#F5F4F3]">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[#EEF2FF] text-[#3157D5]">
                  <HashIcon />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13px] font-semibold text-[#171A21]">
                    #brand-redesign-v2
                  </p>
                  <p className="truncate text-[12px] text-[#4F5360]">
                    Elena — 10:42 AM · “Let&apos;s move forward with the calmer direction.”
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-3 rounded-xl border border-[#E2E1E1] bg-white p-3 transition-colors hover:bg-[#F5F4F3]">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[#EAF5EF] text-[#48B88A]">
                  <ThreadIcon />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13px] font-semibold text-[#171A21]">Thread</p>
                  <p className="truncate text-[12px] text-[#4F5360]">2 replies · review thread</p>
                </div>
              </div>
              <div className="flex items-center gap-3 rounded-xl border border-[#E2E1E1] bg-white p-3 transition-colors hover:bg-[#F5F4F3]">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[#FDF6E9] text-[#E8A33A]">
                  <FileIcon />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13px] font-semibold text-[#171A21]">
                    calm-direction-spec.fig
                  </p>
                  <p className="truncate text-[12px] text-[#4F5360]">Figma · 8.2 MB</p>
                </div>
              </div>
            </div>

            <p className="mt-4 flex items-center gap-1.5 border-t border-[#ECEAEA] pt-3.5 text-[12px] text-[#4F5360]">
              <CheckIcon className="h-3.5 w-3.5 text-[#48B88A]" />
              Results respect workspace and channel permissions.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
