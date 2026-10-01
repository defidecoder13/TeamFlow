'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useClientReady, usePrefersReducedMotion } from './motion';

const FONT_STACK = "font-['Inter',ui-sans-serif,system-ui,sans-serif]";

function useMounted(delay = 0) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    const id = setTimeout(() => setMounted(true), delay);
    return () => clearTimeout(id);
  }, [delay]);
  return mounted;
}

function SearchIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      aria-hidden="true"
      focusable="false"
      className={className ?? 'h-[15px] w-[15px]'}
    >
      <circle cx="9" cy="9" r="5.5" />
      <path d="m13.5 13.5 3 3" strokeLinecap="round" />
    </svg>
  );
}

function BellIcon({ className }: { className?: string }) {
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
      <path
        d="M10 2.5a4.5 4.5 0 0 0-4.5 4.5c0 4-1.5 5-1.5 5h12s-1.5-1-1.5-5A4.5 4.5 0 0 0 10 2.5Z"
        strokeLinejoin="round"
      />
      <path d="M8.2 15a2 2 0 0 0 3.6 0" strokeLinecap="round" />
    </svg>
  );
}

function SendIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 20 20"
      fill="currentColor"
      aria-hidden="true"
      focusable="false"
      className={className ?? 'h-4 w-4'}
    >
      <path d="M2.5 10 17.5 2.5 10 17.5l-2.3-5.2L2.5 10Z" />
    </svg>
  );
}

function TagIcon({ className }: { className?: string }) {
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
      <path d="M3 3h5.5L17 11.5 11.5 17 3 8.5V3Z" strokeLinejoin="round" />
      <circle cx="7.5" cy="7.5" r="1.2" fill="currentColor" stroke="none" />
    </svg>
  );
}

const QUICK_ACCESS = ['Home', 'Threads', 'Direct Messages', 'Mentions'] as const;
const CHANNELS = ['brand-redesign-v2', 'engineering', 'product', 'marketing'] as const;

// Dub-style gateway pills: three product truths bridging the headline and
// the workspace visual. Each maps to a real section anchor.
const GATEWAY_PILLS = [
  {
    label: 'Channels',
    href: '#features',
    tile: 'bg-[#EEF2FF] text-[#3157D5]',
    glyph: 'M7.5 3.5 5.5 16.5M14.5 3.5l-2 13M3.5 7.5h13M3.5 12.5h13',
  },
  {
    label: 'Threads',
    href: '#features',
    tile: 'bg-[#EAF5EF] text-[#48B88A]',
    glyph: 'M3.5 5.5h9a3 3 0 0 1 0 6H7M3.5 5.5v11',
  },
  {
    label: 'Search',
    href: '#solutions',
    tile: 'bg-[#FDF6E9] text-[#E8A33A]',
    glyph: 'M11 11a7 7 0 1 0 0-14 7 7 0 0 0 0 14ZM16.5 16.5l4 4',
  },
] as const;

function EditorialHeroIllustration({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 400 90"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      className={className ?? 'h-16 w-auto'}
    >
      {/* Editorial geometric landscape: calm arches, horizon, discs */}
      <path
        d="M20 70C45 45 85 40 120 58C155 75 190 70 220 52C250 35 290 40 320 62C345 78 375 74 390 70V88H20V70Z"
        fill="#C5D7CF"
        fillOpacity="0.45"
      />
      {/* Soft lavender arch */}
      <path
        d="M70 88V42C70 30.9543 78.9543 22 90 22C101.046 22 110 30.9543 110 42V88H70Z"
        fill="#D7D2EC"
        fillOpacity="0.75"
      />
      {/* Dusty rose disk / sun */}
      <circle cx="165" cy="34" r="18" fill="#D7B6AE" fillOpacity="0.8" />
      {/* Blue-gray geometric block */}
      <rect x="205" y="38" width="48" height="50" rx="8" fill="#B9C7DE" fillOpacity="0.7" />
      {/* Sand arch / pillar */}
      <path
        d="M275 88V50C275 41.1634 282.163 34 291 34C299.837 34 307 41.1634 307 50V88H275Z"
        fill="#DCC8BA"
        fillOpacity="0.75"
      />
      {/* Connecting hairline thread in charcoal */}
      <path
        d="M40 68C80 50 140 55 200 35C260 15 320 40 360 30"
        stroke="#2E3440"
        strokeWidth="1.25"
        strokeDasharray="3 3"
        strokeOpacity="0.35"
      />
      {/* Focal dot */}
      <circle cx="200" cy="35" r="3" fill="#3157D5" />
    </svg>
  );
}

function WorkspaceMockup() {
  return (
    <div
      aria-hidden="true"
      data-testid="hero-mockup"
      className="w-full overflow-hidden rounded-2xl border border-[#E2E1E1] bg-white text-left shadow-[0_20px_50px_-12px_rgba(20,25,35,0.08),0_2px_8px_rgba(20,25,35,0.03)]"
      style={{ pointerEvents: 'none' }}
    >
      {/* Window title bar with macOS traffic lights (10px diameter, 6px spacing) */}
      <div className="flex h-11 items-center justify-between border-b border-[#E2E1E1] bg-[#F5F4F3] px-4">
        <div className="flex min-w-0 items-center gap-1.5">
          <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-[#EE6A62]" />
          <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-[#E9B949]" />
          <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-[#46B96B]" />
          <span className="ml-2.5 truncate text-[12px] font-medium text-[#4F5360]">
            TeamFlow Workspace — Studio Acme
          </span>
        </div>
        <div className="hidden w-64 shrink-0 items-center gap-2 rounded-lg border border-[#DDDCDF] bg-white px-3 py-1 text-[12px] text-[#737782] shadow-xs md:flex">
          <SearchIcon />
          <span className="flex-1 truncate">Jump to a conversation or channel...</span>
          <kbd className="rounded border border-[#E2E1E1] bg-[#EFEEED] px-1.5 py-0.5 font-mono text-[10px] text-[#4F5360]">
            ⌘K
          </kbd>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <span className="flex h-6 w-6 items-center justify-center rounded text-[#4F5360]">
            <BellIcon />
          </span>
          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-[#3157D5] text-[10px] font-semibold text-white">
            ER
          </span>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-12">
        {/* Sidebar */}
        <div className="hidden w-60 flex-col justify-between gap-4 border-r border-[#E2E1E1] bg-[#F7F6F7] p-3.5 md:col-span-4 md:flex lg:col-span-3">
          <div className="space-y-4">
            <div className="flex items-center gap-2.5 rounded-xl border border-[#E2E1E1] bg-white p-2 shadow-xs">
              <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#2E3440] text-[11px] font-semibold text-white">
                AS
              </span>
              <div className="leading-none">
                <p className="text-[13px] font-semibold text-[#171A21]">Acme Studio</p>
                <p className="mt-1 text-[11px] text-[#737782]">12 members</p>
              </div>
            </div>
            <div>
              <p className="px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wider text-[#737782]">
                Quick Access
              </p>
              {QUICK_ACCESS.map((item) => (
                <p key={item} className="rounded-md px-2.5 py-1.5 text-[13px] text-[#4F5360]">
                  {item}
                </p>
              ))}
            </div>
            <div>
              <p className="px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wider text-[#737782]">
                Channels
              </p>
              {CHANNELS.map((channel) => {
                const active = channel === 'brand-redesign-v2';
                return (
                  <p
                    key={channel}
                    className={[
                      'flex items-center gap-2 truncate rounded-md px-2.5 py-1.5 text-[13px]',
                      active ? 'bg-[#E9E8EE] font-medium text-[#171A21]' : 'text-[#4F5360]',
                    ].join(' ')}
                  >
                    <TagIcon className={`h-4 w-4 shrink-0 ${active ? 'text-[#3157D5]' : 'text-[#737782]'}`} />
                    <span className="truncate"># {channel}</span>
                  </p>
                );
              })}
            </div>
          </div>
          <div className="flex items-center gap-2 rounded-xl border border-[#E2E1E1] bg-white p-3 shadow-xs">
            <span className="h-2 w-2 rounded-full bg-[#35B879]" />
            <span className="text-[12px] font-medium text-[#171A21]">Quiet mode active</span>
          </div>
        </div>

        {/* Main workspace */}
        <div className="col-span-1 flex min-w-0 flex-col bg-white p-4 sm:p-6 md:col-span-8 lg:col-span-9">
          <div className="flex items-center justify-between gap-3 border-b border-[#ECEAEA] pb-3">
            <div className="min-w-0">
              <p className="truncate text-[18px] font-semibold text-[#171A21]">
                # brand-redesign-v2
              </p>
              <p className="mt-0.5 text-[12px] text-[#737782]">12 members · calm by default</p>
            </div>
            <div className="flex shrink-0 -space-x-2">
              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-[#EEF2FF] text-[11px] font-semibold text-[#3157D5] ring-2 ring-white">
                ER
              </span>
              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-[#EFEEED] text-[11px] font-semibold text-[#171A21] ring-2 ring-white">
                JS
              </span>
              <span className="flex h-7 w-7 items-center justify-center rounded-full border border-[#E2E1E1] bg-[#FAF9F8] text-[11px] font-semibold text-[#4F5360] ring-2 ring-white">
                +4
              </span>
            </div>
          </div>

          <div className="mt-4 space-y-4">
            <div className="flex items-start gap-3">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[#E9E8EE] text-xs font-semibold text-[#171A21]">
                ER
              </span>
              <div className="min-w-0 flex-1">
                <p className="flex items-baseline gap-2">
                  <span className="text-[13px] font-semibold text-[#171A21]">Elena</span>
                  <span className="text-[11px] text-[#737782]">10:42 AM</span>
                </p>
                <p className="mt-1 text-[14px] leading-[1.55] text-[#171A21]">
                  The new direction feels much clearer. I think we&apos;re ready for another review.
                </p>
                <div className="mt-2.5 flex max-w-md items-center gap-3 rounded-xl border border-[#E2E1E1] bg-[#F5F4F3] p-3">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-[#E2E1E1] bg-white text-[#3157D5] shadow-xs">
                    <TagIcon />
                  </span>
                  <div className="min-w-0">
                    <p className="truncate text-[13px] font-medium text-[#171A21]">
                      calm-direction-spec.fig
                    </p>
                    <p className="text-[12px] text-[#737782]">Figma · 8.2 MB</p>
                  </div>
                </div>
              </div>
            </div>

            <div className="ml-4 rounded-xl border border-[#E2E1E1] bg-white p-4 shadow-xs sm:ml-8">
              <p className="flex items-center gap-2 text-[12px] font-medium text-[#4F5360]">
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-[#EFEEED] text-[10px] font-semibold text-[#171A21]">
                  MR
                </span>
                Mara replied in thread · 2 replies
              </p>
              <p className="mt-1.5 text-[13px] leading-relaxed text-[#171A21]">
                Review is scheduled for Thursday. I will bring the updated spec.
              </p>
            </div>

            <div className="flex items-start gap-3">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[#2E3440] text-xs font-semibold text-white">
                JS
              </span>
              <div className="min-w-0 flex-1">
                <p className="flex items-baseline gap-2">
                  <span className="text-[13px] font-semibold text-[#171A21]">John Smith</span>
                  <span className="text-[11px] text-[#737782]">10:48 AM</span>
                </p>
                <p className="mt-1 text-[14px] leading-[1.55] text-[#171A21]">
                  I&apos;ve reviewed the latest changes. Looks good from my side.
                </p>
              </div>
            </div>
          </div>

          <div className="mt-4 flex items-center gap-2 rounded-xl border border-[#DDDCDF] bg-[#F5F4F3] p-2 pl-3.5">
            <span className="flex-1 truncate text-[14px] text-[#9296A0]">
              Reply to #brand-redesign-v2...
            </span>
            <span className="flex items-center gap-1 rounded-lg bg-[#2E3440] px-3.5 py-1.5 text-[13px] font-medium text-white shadow-xs">
              Send <SendIcon />
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

export function NewLandingHero() {
  const ready = useClientReady();
  const reduced = usePrefersReducedMotion();
  const mountedEyebrow = useMounted(0);
  const mountedHeadline = useMounted(90);
  const mountedSupport = useMounted(180);
  const mountedCta = useMounted(270);
  const mountedTrust = useMounted(360);
  const mountedMockup = useMounted(440);

  // SSR and pre-hydration render fully visible; the staggered entrance
  // only applies once the client is ready. Content is never gated on JS.
  const fadeUp = (mounted: boolean, dy: number, duration = 560) =>
    !ready || reduced
      ? undefined
      : {
          opacity: mounted ? 1 : 0,
          transform: mounted ? 'translateY(0)' : `translateY(${dy}px)`,
          transition: `opacity ${duration}ms cubic-bezier(0.23, 1, 0.32, 1), transform ${duration}ms cubic-bezier(0.23, 1, 0.32, 1)`,
        };

  const mockupStyle =
    !ready || reduced
      ? undefined
      : {
          opacity: mountedMockup ? 1 : 0,
          transform: mountedMockup ? 'translateY(0) scale(1)' : 'translateY(24px) scale(0.97)',
          transition:
            'opacity 700ms cubic-bezier(0.23, 1, 0.32, 1), transform 700ms cubic-bezier(0.23, 1, 0.32, 1)',
        };

  return (
    <section
      id="product"
      aria-labelledby="new-hero-heading"
      data-testid="new-hero"
      className={`relative w-full scroll-mt-20 overflow-clip px-6 pb-20 pt-28 md:pt-32 lg:px-12 lg:pb-28 ${FONT_STACK}`}
    >
      {/* Ambient soft glow */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute left-1/2 top-0 h-[360px] w-[720px] max-w-none -translate-x-1/2 rounded-full bg-gradient-to-b from-[#EEF2FF]/60 via-[#FAF9F8] to-transparent blur-3xl"
      />

      <div className="relative mx-auto flex w-full max-w-7xl flex-col items-center text-center">
        {/* Eyebrow */}
        <div
          className="mb-8 inline-flex cursor-default items-center gap-2 rounded-full border border-[#E2E1E1] bg-white px-3.5 py-1.5 shadow-xs"
          style={fadeUp(mountedEyebrow, 8, 500)}
        >
          <span
            aria-hidden="true"
            className={`inline-block h-2 w-2 rounded-full bg-[#3157D5] ${reduced ? '' : 'animate-pulse'}`}
          />
          <span className="text-[11px] font-semibold uppercase tracking-[0.06em] text-[#171A21]">
            Introducing TeamFlow 2.0
          </span>
          <span aria-hidden="true" className="text-[12px] text-[#737782]">
            ·
          </span>
          <span className="text-[13px] text-[#4F5360]">Built for deep team focus</span>
        </div>

        {/* Display Headline */}
        <h1
          id="new-hero-heading"
          className="max-w-4xl text-balance text-[40px] font-semibold leading-[1.08] tracking-[-0.035em] text-[#171A21] sm:text-[52px] lg:text-[60px]"
          style={fadeUp(mountedHeadline, 16, 620)}
        >
          A calmer way to work together.
        </h1>

        {/* Supporting Copy */}
        <p
          className="mx-auto mt-6 max-w-2xl text-[16px] leading-[1.55] tracking-normal text-[#4F5360] sm:text-[17px]"
          style={fadeUp(mountedSupport, 12, 540)}
        >
          TeamFlow unites channels, threads, and permission-aware search into one calm workspace —
          without the notification fatigue.
        </p>

        {/* CTAs */}
        <div
          className="mt-8 flex w-full flex-col items-center justify-center gap-3.5 sm:w-auto sm:flex-row"
          style={fadeUp(mountedCta, 10, 540)}
        >
          <Link
            href="/sign-up"
            className="group flex h-10 w-full items-center justify-center gap-2 rounded-lg bg-black bg-[#2E3440] px-5 text-[13px] font-medium text-white shadow-xs transition-[background-color,scale] duration-150 ease-out-expo hover:bg-[#1F242C] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#3157D5] sm:w-auto motion-reduce:transition-none motion-reduce:active:scale-100 active:scale-[0.98]"
          >
            Start for free
            <span
              aria-hidden="true"
              className="inline-block transition-transform group-hover:translate-x-1 motion-reduce:transition-none motion-reduce:group-hover:translate-x-0"
            >
              →
            </span>
          </Link>
          <Link
            href="#features"
            className="flex h-10 w-full items-center justify-center gap-2 rounded-lg border border-[#DEDDE0] bg-white px-5 text-[13px] font-medium text-[#242832] shadow-xs transition-[background-color] duration-150 hover:bg-[#F5F4F4] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#3157D5] sm:w-auto motion-reduce:transition-none"
          >
            See how it works
            <span aria-hidden="true" className="inline-block">
              ↓
            </span>
          </Link>
        </div>
        <p className="mt-5 text-[12px] text-[#737782]" style={fadeUp(mountedTrust, 8, 500)}>
          No credit card · Free forever · 30-second setup
        </p>

        {/* Gateway Pills */}
        <ul
          aria-label="What TeamFlow brings together"
          className="mt-8 flex flex-wrap items-center justify-center gap-2.5"
          style={fadeUp(mountedTrust, 8, 560)}
        >
          {GATEWAY_PILLS.map((pill) => (
            <li key={pill.label}>
              <Link
                href={pill.href}
                className="inline-flex items-center gap-2 rounded-full border border-[#E2E1E1] bg-white py-1.5 pl-1.5 pr-4 text-[13px] font-medium text-[#171A21] shadow-xs transition-colors hover:bg-[#F5F4F3] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#3157D5] motion-reduce:transition-none"
              >
                <span
                  aria-hidden="true"
                  className={`flex h-6 w-6 items-center justify-center rounded-full ${pill.tile}`}
                >
                  <svg
                    viewBox="0 0 20 20"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.7"
                    focusable="false"
                    className="h-3.5 w-3.5"
                  >
                    <path d={pill.glyph} strokeLinecap="round" />
                  </svg>
                </span>
                {pill.label}
              </Link>
            </li>
          ))}
        </ul>

        {/* Editorial Vector Illustration */}
        <div className="mt-8" aria-hidden="true">
          <EditorialHeroIllustration />
        </div>

        {/* Product Preview Window */}
        <div className="mt-6 w-full max-w-[1050px]" style={mockupStyle}>
          <WorkspaceMockup />
        </div>
      </div>
    </section>
  );
}
