/**
 * Split authentication layout (Phase 2C, Stitch-aligned).
 *
 * Desktop: a macOS-style window card (traffic lights + caption) holding the
 * brand panel and the centered form. Smaller screens: the card goes
 * full-bleed, the brand panel collapses to a compact top mark, and the form
 * takes the full width.
 */

import type { ReactNode } from 'react';
import { TeamFlowLogo } from '../brand/TeamFlowLogo';

interface AuthLayoutProps {
  /** Optional window caption for reference. */
  windowTitle?: string;
  brand: ReactNode;
  children: ReactNode;
}

function TrafficLights() {
  return (
    <span aria-hidden="true" className="flex items-center gap-1.5">
      <span className="h-2.5 w-2.5 rounded-full bg-[#EE6A62]" />
      <span className="h-2.5 w-2.5 rounded-full bg-[#E9B949]" />
      <span className="h-2.5 w-2.5 rounded-full bg-[#46B96B]" />
    </span>
  );
}

export function AuthLayout({ brand, children }: AuthLayoutProps) {
  return (
    <main className="relative flex min-h-screen w-full items-center justify-center overflow-hidden bg-[#F8F7F6] p-0 text-[#171A21] sm:p-6 lg:p-12">
      {/* Subtle atmospheric ambient glow from DESIGN.md palette */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 overflow-hidden"
      >
        <div className="absolute -top-[15%] left-1/2 h-[520px] w-[860px] -translate-x-1/2 rounded-full bg-gradient-to-b from-[#EEF2FF]/60 via-[#D7D2EC]/15 to-transparent blur-3xl" />
        <div className="absolute -bottom-[20%] right-[12%] h-[420px] w-[520px] rounded-full bg-gradient-to-t from-[#DCC8BA]/20 to-transparent blur-3xl" />
      </div>

      <div className="relative w-full max-w-5xl min-w-0 overflow-hidden bg-white sm:rounded-2xl sm:border sm:border-[#E2E1E1] sm:shadow-[0_20px_60px_rgba(20,25,35,0.08)]">
        {/* Minimal macOS titlebar chrome with traffic lights */}
        <div className="hidden items-center border-b border-[#E2E1E1] bg-[#F5F4F3] px-5 py-3 sm:flex">
          <TrafficLights />
        </div>
        <div className="grid w-full grid-cols-1 lg:grid-cols-[48%_52%]">
          {brand}
          <section
            aria-label="Authentication"
            className="flex w-full min-w-0 items-center justify-center bg-white px-6 py-10 sm:px-12 lg:px-14 lg:py-16"
          >
            <div className="w-full max-w-sm min-w-0">
              <div className="mb-8 flex items-center gap-2.5 lg:hidden">
                <TeamFlowLogo
                  size={24}
                  wordmarkClassName="text-[17px] font-semibold tracking-[-0.02em] text-[#171A21]"
                />
              </div>
              {children}
            </div>
          </section>
        </div>
      </div>
    </main>
  );
}
