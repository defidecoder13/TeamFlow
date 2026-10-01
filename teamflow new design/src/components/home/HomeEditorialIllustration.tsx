import React from 'react';

export const HomeEditorialIllustration: React.FC<{ className?: string }> = ({ className = '' }) => {
  return (
    <div className={`relative flex items-center justify-center select-none ${className}`}>
      <svg
        viewBox="0 0 520 260"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="w-full max-w-[460px] h-auto drop-shadow-2xs"
        aria-hidden="true"
      >
        <defs>
          {/* Gentle gradients for sun and hills */}
          <linearGradient id="sunGrad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#FFF2DC" />
            <stop offset="100%" stopColor="#F9DFB8" />
          </linearGradient>

          <linearGradient id="mountainLeft" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#E9EEF7" />
            <stop offset="100%" stopColor="#D5DEEE" />
          </linearGradient>

          <linearGradient id="mountainRight" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#EDE5DC" />
            <stop offset="100%" stopColor="#DFD1C4" />
          </linearGradient>

          <linearGradient id="foliageGrad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#9FB3C0" />
            <stop offset="100%" stopColor="#6C8596" />
          </linearGradient>

          <filter id="cardShadow" x="-10%" y="-10%" width="120%" height="130%" filterUnits="userSpaceOnUse">
            <feDropShadow dx="0" dy="8" stdDeviation="12" floodColor="#171A21" floodOpacity="0.07" />
          </filter>
        </defs>

        {/* Soft glowing pastel sun */}
        <circle cx="270" cy="85" r="42" fill="url(#sunGrad)" opacity="0.9" />

        {/* Distant soft geometric mountain peak left */}
        <path
          d="M170 240 L235 95 L310 240 Z"
          fill="url(#mountainLeft)"
          opacity="0.85"
        />

        {/* Distant soft geometric mountain peak right */}
        <path
          d="M290 240 L370 120 L445 240 Z"
          fill="url(#mountainLeft)"
          opacity="0.75"
        />

        {/* Gentle warm hill slope on right */}
        <path
          d="M340 240 Q400 170 490 240 Z"
          fill="url(#mountainRight)"
          opacity="0.9"
        />

        {/* Slender minimalist cypress / tree silhouette */}
        <path
          d="M372 240 C370 200 374 175 378 175 C382 175 386 200 384 240 Z"
          fill="#7C99A4"
          opacity="0.85"
        />

        {/* Minimalist bird silhouettes floating gracefully */}
        <path
          d="M336 58 Q342 52 348 56 Q354 52 360 58 Q354 55 348 60 Q342 55 336 58 Z"
          fill="#A4B8CA"
          opacity="0.8"
        />
        <path
          d="M358 72 Q363 67 368 70 Q373 67 378 72 Q373 69 368 74 Q363 69 358 72 Z"
          fill="#A4B8CA"
          opacity="0.7"
        />

        {/* Floating macOS application window card */}
        <g filter="url(#cardShadow)">
          {/* Card body */}
          <rect
            x="220"
            y="75"
            width="175"
            height="145"
            rx="12"
            fill="#FFFFFF"
            stroke="#E4E2DF"
            strokeWidth="1.2"
          />

          {/* Card header */}
          <rect x="220" y="75" width="175" height="26" rx="12" fill="#F8F7F6" />
          <line x1="220" y1="101" x2="395" y2="101" stroke="#ECEAE7" strokeWidth="1" />

          {/* Clean header badge/accent */}
          <rect x="234" y="86" width="28" height="4" rx="2" fill="#D2D0CC" />

          {/* Row 1 with avatar and text line */}
          <circle cx="242" cy="122" r="7" fill="#E2E7ED" />
          <rect x="256" y="117" width="55" height="4.5" rx="2.25" fill="#4F5360" opacity="0.7" />
          <rect x="256" y="125" width="85" height="3.5" rx="1.75" fill="#C5CAD3" />

          {/* Row 2 with avatar and text line */}
          <circle cx="242" cy="148" r="7" fill="#EADFDF" />
          <rect x="256" y="143" width="65" height="4.5" rx="2.25" fill="#4F5360" opacity="0.7" />
          <rect x="256" y="151" width="70" height="3.5" rx="1.75" fill="#C5CAD3" />

          {/* Row 3 with avatar and text line */}
          <circle cx="242" cy="174" r="7" fill="#DFEAE2" />
          <rect x="256" y="169" width="45" height="4.5" rx="2.25" fill="#4F5360" opacity="0.7" />
          <rect x="256" y="177" width="95" height="3.5" rx="1.75" fill="#C5CAD3" />
        </g>

        {/* Botanical leaf branch in foreground on left */}
        <g opacity="0.95">
          {/* Main stem */}
          <path
            d="M175 240 Q185 180 180 120"
            stroke="#6C8596"
            strokeWidth="2.5"
            strokeLinecap="round"
          />

          {/* Leaf 1 left bottom */}
          <path
            d="M178 215 C150 210 145 190 160 185 C175 180 178 205 178 215 Z"
            fill="url(#foliageGrad)"
          />

          {/* Leaf 2 right mid */}
          <path
            d="M181 190 C205 180 210 160 195 155 C180 150 180 175 181 190 Z"
            fill="url(#foliageGrad)"
          />

          {/* Leaf 3 left top */}
          <path
            d="M180 160 C155 145 155 125 170 125 C185 125 182 145 180 160 Z"
            fill="url(#foliageGrad)"
          />

          {/* Leaf 4 top tip */}
          <path
            d="M180 122 C175 105 185 98 190 105 C195 112 188 120 180 122 Z"
            fill="url(#foliageGrad)"
          />
        </g>

        {/* Ground baseline soft line */}
        <line x1="80" y1="240" x2="480" y2="240" stroke="#ECEAE7" strokeWidth="1" strokeLinecap="round" />
      </svg>
    </div>
  );
};
