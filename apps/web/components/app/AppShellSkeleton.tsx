/**
 * Subtle loading treatment for the authenticated app (Phase 1D).
 *
 * Mirrors the shell geometry with pulsing blocks — no layout jump when the
 * real content arrives, and no oversized spinner.
 */

export function AppShellSkeleton() {
  // Single announcement: the label names the region; every visual block
  // below is aria-hidden so nothing is exposed twice.
  return (
    <div
      role="status"
      aria-busy="true"
      aria-label="Loading TeamFlow"
      className="flex h-screen overflow-hidden bg-[#fbf8ff]"
    >
      <div
        aria-hidden="true"
        className="hidden w-14 shrink-0 flex-col items-center gap-2 border-r border-[#e3e1ec] bg-white py-3 md:flex"
      >
        <div className="h-9 w-9 animate-pulse rounded-[10px] bg-[#e3e1ec]" />
        <div className="h-9 w-9 animate-pulse rounded-[10px] bg-[#f4f2fd]" />
      </div>
      <div
        aria-hidden="true"
        className="hidden w-60 shrink-0 flex-col gap-2 border-r border-[#e3e1ec] bg-[#f4f2fd]/60 px-3 py-4 lg:flex"
      >
        {[0, 1, 2, 3].map((row) => (
          <div key={row} className="h-8 animate-pulse rounded-md bg-[#000000]/[0.05]" />
        ))}
      </div>
      <div aria-hidden="true" className="flex min-w-0 flex-1 flex-col">
        <div className="h-14 shrink-0 border-b border-[#e3e1ec] bg-white" />
        <div className="mx-auto w-full max-w-4xl space-y-3 px-6 py-8 lg:px-8">
          <div className="h-4 w-24 animate-pulse rounded bg-[#000000]/[0.06]" />
          <div className="h-7 w-64 animate-pulse rounded bg-[#000000]/[0.08]" />
          <div className="h-4 w-96 max-w-full animate-pulse rounded bg-[#000000]/[0.06]" />
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
