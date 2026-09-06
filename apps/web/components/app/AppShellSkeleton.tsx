/**
 * Subtle loading treatment for the authenticated app (Phase 1D).
 *
 * Mirrors the shell geometry with pulsing blocks — no layout jump when the
 * real content arrives, and no oversized spinner.
 */

export function AppShellSkeleton() {
  return (
    <div
      role="status"
      aria-busy="true"
      aria-label="Loading TeamFlow"
      className="flex h-screen overflow-hidden bg-[#f4f3f6]"
    >
      <span className="sr-only">Loading TeamFlow…</span>
      <div
        aria-hidden="true"
        className="hidden w-14 shrink-0 flex-col items-center gap-2 border-r border-stone-200 bg-white py-3 md:flex"
      >
        <div className="h-9 w-9 animate-pulse rounded-[10px] bg-stone-200" />
        <div className="h-9 w-9 animate-pulse rounded-[10px] bg-stone-100" />
      </div>
      <div
        aria-hidden="true"
        className="hidden w-60 shrink-0 flex-col gap-2 border-r border-stone-200 bg-[#faf9f7] px-3 py-4 lg:flex"
      >
        {[0, 1, 2, 3].map((row) => (
          <div key={row} className="h-8 animate-pulse rounded-md bg-stone-900/[0.05]" />
        ))}
      </div>
      <div aria-hidden="true" className="flex min-w-0 flex-1 flex-col">
        <div className="h-13 shrink-0 border-b border-stone-200 bg-white" />
        <div className="mx-auto w-full max-w-3xl space-y-3 px-4 py-8 sm:px-6 lg:px-8">
          <div className="h-4 w-24 animate-pulse rounded bg-stone-900/[0.06]" />
          <div className="h-7 w-64 animate-pulse rounded bg-stone-900/[0.08]" />
          <div className="h-4 w-96 max-w-full animate-pulse rounded bg-stone-900/[0.06]" />
          <div className="grid gap-4 pt-4 md:grid-cols-3">
            {[0, 1, 2].map((card) => (
              <div key={card} className="h-36 animate-pulse rounded-xl bg-white" />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
