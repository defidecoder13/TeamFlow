import { TeamFlowLogo } from '../brand/TeamFlowLogo';

function AuthIllustration() {
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      viewBox="0 0 440 160"
      width={420}
      height={152}
      className="h-auto w-full max-w-[420px]"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      {/* Soft warm horizon line */}
      <line
        x1="12"
        y1="150"
        x2="428"
        y2="150"
        stroke="#ECEAEA"
        strokeWidth="1.5"
        strokeLinecap="round"
      />

      {/* Atmospheric background lavender disc */}
      <circle cx="270" cy="66" r="44" fill="#D7D2EC" fillOpacity="0.45" />

      {/* Layered landscape & workspace geometry */}
      {/* Left gentle dune / hill (sage) */}
      <path d="M24 150 C60 102 120 86 175 150 Z" fill="#C5D7CF" fillOpacity="0.6" />

      {/* Center peak / structural mountain (sand) */}
      <polygon points="125,150 215,46 305,150" fill="#DCC8BA" fillOpacity="0.75" />

      {/* Right quiet slope (blue gray) */}
      <path d="M225 150 C280 78 355 96 416 150 Z" fill="#B9C7DE" fillOpacity="0.65" />

      {/* Editorial architectural portal (dusty rose with warm canvas fill) */}
      <path
        d="M295 150 V106 C295 92 308 80 324 80 C340 80 353 92 353 106 V150"
        stroke="#D7B6AE"
        strokeWidth="2.2"
        fill="#FAF9F8"
      />

      {/* Collaboration nodes & flow line */}
      <circle cx="215" cy="46" r="5" fill="#3157D5" />
      <circle cx="324" cy="80" r="3.8" fill="#3157D5" fillOpacity="0.85" />
      <path
        d="M215 46 Q 272 58 324 80"
        stroke="#3157D5"
        strokeWidth="1.4"
        strokeDasharray="4 4"
        strokeOpacity="0.65"
      />
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
    <aside className="hidden min-w-0 border-r border-[#E2E1E1] bg-[#FAF9F8] text-[#171A21] lg:flex lg:flex-col lg:justify-between lg:p-12">
      <div>
        <TeamFlowLogo
          size={24}
          wordmarkClassName="text-[17px] font-semibold tracking-[-0.02em] text-[#171A21]"
        />
      </div>

      <div className="my-auto py-6">
        <div className="max-w-[360px]">
          <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[#737782]">
            {eyebrow}
          </p>
          <h2 className="mt-4 text-[32px] font-medium leading-[1.08] tracking-[-0.035em] text-[#171A21] lg:text-[36px]">
            {headline}
          </h2>
          <p className="mt-3.5 text-[14px] leading-[1.6] text-[#4F5360]">{supporting}</p>
        </div>
      </div>

      <div>
        <div className="flex w-full items-center justify-center">
          <AuthIllustration />
        </div>
        {footnote ? (
          <p className="mt-4 text-xs text-[#737782]">{footnote}</p>
        ) : (
          <p className="mt-4 text-xs text-[#737782]">TeamFlow &bull; Calm collaboration</p>
        )}
      </div>
    </aside>
  );
}
