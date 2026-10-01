/**
 * TeamFlow brand mark + wordmark.
 *
 * Inline SVG, geometric minimal, monochrome via currentColor (~20px
 * default). Color is inherited from the parent — no hardcoded identity
 * color — so the logo works on any surface.
 * Mark communicates people / connection / flow via three nodes + flow lines.
 */

export function TeamFlowLogo({
  size = 20,
  showWordmark = true,
  className,
  wordmarkClassName,
}: {
  size?: number;
  showWordmark?: boolean;
  className?: string;
  wordmarkClassName?: string;
}) {
  return (
    <span
      className={['inline-flex items-center gap-2', className].filter(Boolean).join(' ')}
      aria-label={showWordmark ? undefined : 'TeamFlow'}
    >
      <svg
        width={size}
        height={size}
        viewBox="0 0 20 20"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden="true"
        className="shrink-0"
      >
        {/* Nodes */}
        <circle cx="10" cy="4.2" r="2" fill="currentColor" />
        <circle cx="4.2" cy="15.5" r="2" fill="currentColor" />
        <circle cx="15.8" cy="15.5" r="2" fill="currentColor" />
        {/* Flow lines - Y shape with slight curve */}
        <path d="M10 6.6 L10 10.2" stroke="currentColor" strokeWidth="1.35" strokeLinecap="round" />
        <path
          d="M10 10.2 L5.2 14.3"
          stroke="currentColor"
          strokeWidth="1.35"
          strokeLinecap="round"
        />
        <path
          d="M10 10.2 L14.8 14.3"
          stroke="currentColor"
          strokeWidth="1.35"
          strokeLinecap="round"
        />
        {/* Center flow dot */}
        <circle cx="10" cy="10.2" r="1.15" fill="currentColor" />
      </svg>
      {showWordmark ? (
        <span
          className={['text-[15px] font-medium tracking-[-0.02em] text-current', wordmarkClassName]
            .filter(Boolean)
            .join(' ')}
        >
          TeamFlow
        </span>
      ) : null}
    </span>
  );
}
