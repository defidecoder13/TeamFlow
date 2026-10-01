'use client';

/**
 * Skeleton rows shaped like message rows, for list loading states.
 *
 * A stable `role="status"` with sr-only text announces once; the pulse
 * blocks are decorative and match the message row geometry (avatar +
 * two text lines) so content does not jump when messages arrive.
 */

export function MessageListSkeleton({
  rows = 4,
  label = 'Loading messages',
  className = '',
}: {
  rows?: number;
  label?: string;
  className?: string;
}) {
  // Single announcement: the label names the region; pulse blocks are
  // decorative and hidden so nothing is exposed twice.
  return (
    <div role="status" aria-label={label} className={`flex flex-col gap-1 py-2 ${className}`}>
      {Array.from({ length: rows }, (_, index) => (
        <div
          key={index}
          aria-hidden="true"
          className="flex items-start gap-3 rounded-lg px-2 py-1.5 sm:mx-2"
        >
          <div className="h-9 w-9 shrink-0 animate-pulse rounded-lg bg-[#e8e7f1]" />
          <div className="min-w-0 flex-1 space-y-2 pt-1">
            <div className="h-2.5 w-1/4 animate-pulse rounded bg-[#e8e7f1]" />
            <div className="h-2.5 w-11/12 animate-pulse rounded bg-[#e8e7f1]" />
            <div className="h-2.5 w-2/3 animate-pulse rounded bg-[#e8e7f1]" />
          </div>
        </div>
      ))}
    </div>
  );
}
