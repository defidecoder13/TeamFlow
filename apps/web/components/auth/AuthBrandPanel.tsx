/**
 * Brand side of the authentication split (Phase 2C, Stitch-aligned).
 *
 * Light lavender panel with the TeamFlow infinity mark, uppercase eyebrow,
 * display headline, supporting copy, and a flat monochrome geometric
 * composition. Decorative SVG is hidden from assistive technology.
 */

function InfinityMark() {
  return (
    <span
      aria-hidden="true"
      className="flex h-8 w-8 items-center justify-center rounded-lg bg-zinc-900"
    >
      <svg
        focusable="false"
        viewBox="0 0 24 24"
        fill="none"
        stroke="#ffffff"
        strokeWidth="2.2"
        strokeLinecap="round"
        className="h-5 w-5"
      >
        <path d="M12 12c0-3.2-2.6-5-5.2-5-2.2 0-4.3 2-4.3 5s2.1 5 4.3 5c2.6 0 5.2-1.8 5.2-5zm0 0c0-3.2 2.6-5 5.2-5 2.2 0 4.3 2 4.3 5s-2.1 5-4.3 5c-2.6 0-5.2-1.8-5.2-5z" />
      </svg>
    </span>
  );
}

function MountainMark() {
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      viewBox="0 0 320 130"
      className="h-auto w-full max-w-[300px]"
    >
      <polygon points="0,130 80,45 160,130" fill="#e3e1ec" />
      <polygon points="110,130 200,30 290,130" fill="#d6d3d1" />
      <polygon points="235,130 280,75 325,130" fill="#e7e5e4" />
      <circle cx="62" cy="38" r="15" fill="none" stroke="#c8c5cb" strokeWidth="1.5" />
    </svg>
  );
}

interface AuthBrandPanelProps {
  eyebrow: string;
  headline: string;
  supporting: string;
  footnote?: string;
}

export function AuthBrandPanel({ eyebrow, headline, supporting, footnote }: AuthBrandPanelProps) {
  return (
    <aside className="hidden bg-[#f4f2fd] text-zinc-900 lg:flex lg:flex-col lg:px-12 lg:py-10">
      <div className="flex items-center gap-2.5">
        <InfinityMark />
        <span className="text-[15px] font-semibold tracking-tight">TeamFlow</span>
      </div>

      <div className="flex flex-1 flex-col justify-center">
        <div className="max-w-sm">
          <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-zinc-500">
            {eyebrow}
          </p>
          <h2 className="mt-4 text-[32px] font-semibold leading-[1.2] tracking-tight">
            {headline}
          </h2>
          <p className="mt-3 max-w-xs text-sm leading-relaxed text-zinc-500">{supporting}</p>
          <div className="mt-10">
            <MountainMark />
          </div>
        </div>
      </div>

      {footnote ? <p className="text-xs text-zinc-500">{footnote}</p> : null}
    </aside>
  );
}
