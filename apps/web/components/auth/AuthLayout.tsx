/**
 * Split authentication layout (Phase 2C, Stitch-aligned).
 *
 * Desktop: a macOS-style window card (traffic lights + caption) holding the
 * brand panel and the centered form. Smaller screens: the card goes
 * full-bleed, the brand panel collapses to a compact top mark, and the form
 * takes the full width.
 */

import type { ReactNode } from 'react';

interface AuthLayoutProps {
  /** Window caption, e.g. "TeamFlow — Sign In". */
  windowTitle: string;
  brand: ReactNode;
  children: ReactNode;
}

function TrafficLights() {
  return (
    <span aria-hidden="true" className="flex items-center gap-2">
      <span className="h-3 w-3 rounded-full bg-[#ff5f57]" />
      <span className="h-3 w-3 rounded-full bg-[#febc2e]" />
      <span className="h-3 w-3 rounded-full bg-[#28c840]" />
    </span>
  );
}

export function AuthLayout({ windowTitle, brand, children }: AuthLayoutProps) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-[#fbf8ff] p-0 text-zinc-900 sm:p-6 lg:p-10">
      <div className="w-full max-w-5xl overflow-hidden bg-white sm:rounded-2xl sm:border sm:border-stone-200 sm:shadow-[0_20px_48px_-8px_rgba(24,24,27,0.12)]">
        <div className="flex items-center justify-between border-b border-stone-200/70 px-5 py-3">
          <TrafficLights />
          <p className="text-xs text-zinc-400">{windowTitle}</p>
        </div>
        <div className="grid lg:grid-cols-2">
          {brand}
          <section
            aria-label="Authentication"
            className="flex items-center justify-center px-6 py-10 sm:px-12 lg:px-16 lg:py-14"
          >
            <div className="w-full max-w-sm">
              <div className="mb-8 flex items-center gap-2.5 lg:hidden">
                <span
                  aria-hidden="true"
                  className="flex h-8 w-8 items-center justify-center rounded-lg bg-zinc-900 text-sm font-semibold text-white"
                >
                  T
                </span>
                <span className="text-[15px] font-semibold tracking-tight">TeamFlow</span>
              </div>
              {children}
            </div>
          </section>
        </div>
      </div>
    </main>
  );
}
