/**
 * Logo Component
 * ==============
 * Stars-and-stripes "DOUBLE DRIBBLE" wordmark inspired by the classic
 * NES box art. Rendered as inline SVG for crisp scaling at any size.
 */

export default function Logo({ size = "sm", className = "" }) {
  const sizes = {
    sm: { width: 160, height: 36 },
    md: { width: 240, height: 54 },
    lg: { width: 320, height: 72 },
  };

  const { width, height } = sizes[size] || sizes.sm;

  return (
    <div className={`flex flex-col items-center ${className}`}>
      <svg
        viewBox="0 0 320 72"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        style={{ width, height }}
        className="drop-shadow-lg"
        role="img"
        aria-label="Double Dribble"
      >
        <defs>
          {/* Stars & stripes pattern for top half of letters */}
          <pattern id="starsPattern" x="0" y="0" width="12" height="12" patternUnits="userSpaceOnUse">
            <rect width="12" height="12" fill="#1e3a8a" />
            <polygon points="6,1 7,4 10,4 7.5,6 8.5,9 6,7 3.5,9 4.5,6 2,4 5,4" fill="white" opacity="0.9" />
          </pattern>

          {/* Red & white stripes for bottom half */}
          <pattern id="stripesPattern" x="0" y="0" width="4" height="8" patternUnits="userSpaceOnUse">
            <rect width="4" height="4" fill="#dc2626" />
            <rect y="4" width="4" height="4" fill="white" />
          </pattern>

          {/* Split fill: stars top, stripes bottom */}
          <clipPath id="topHalf">
            <rect x="0" y="0" width="320" height="36" />
          </clipPath>
          <clipPath id="bottomHalf">
            <rect x="0" y="36" width="320" height="36" />
          </clipPath>

          {/* Gold outline gradient */}
          <linearGradient id="goldOutline" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#fbbf24" />
            <stop offset="50%" stopColor="#f59e0b" />
            <stop offset="100%" stopColor="#d97706" />
          </linearGradient>

          {/* 3D shadow */}
          <filter id="shadow3d">
            <feDropShadow dx="2" dy="2" stdDeviation="0.5" floodColor="#1e1e1e" floodOpacity="0.6" />
          </filter>
        </defs>

        {/* 3D shadow layer */}
        <text
          x="160" y="30"
          textAnchor="middle"
          fontFamily="'Press Start 2P', monospace"
          fontSize="26"
          fontWeight="bold"
          fontStyle="italic"
          fill="#1a1a2e"
          opacity="0.5"
          transform="translate(2.5, 2.5)"
        >
          DOUBLE
        </text>
        <text
          x="160" y="62"
          textAnchor="middle"
          fontFamily="'Press Start 2P', monospace"
          fontSize="26"
          fontWeight="bold"
          fontStyle="italic"
          fill="#1a1a2e"
          opacity="0.5"
          transform="translate(2.5, 2.5)"
        >
          DRIBBLE
        </text>

        {/* Stars fill (top half of letters) */}
        <g clipPath="url(#topHalf)">
          <text
            x="160" y="30"
            textAnchor="middle"
            fontFamily="'Press Start 2P', monospace"
            fontSize="26"
            fontWeight="bold"
            fontStyle="italic"
            fill="url(#starsPattern)"
          >
            DOUBLE
          </text>
          <text
            x="160" y="62"
            textAnchor="middle"
            fontFamily="'Press Start 2P', monospace"
            fontSize="26"
            fontWeight="bold"
            fontStyle="italic"
            fill="url(#starsPattern)"
          >
            DRIBBLE
          </text>
        </g>

        {/* Stripes fill (bottom half of letters) */}
        <g clipPath="url(#bottomHalf)">
          <text
            x="160" y="30"
            textAnchor="middle"
            fontFamily="'Press Start 2P', monospace"
            fontSize="26"
            fontWeight="bold"
            fontStyle="italic"
            fill="url(#stripesPattern)"
          >
            DOUBLE
          </text>
          <text
            x="160" y="62"
            textAnchor="middle"
            fontFamily="'Press Start 2P', monospace"
            fontSize="26"
            fontWeight="bold"
            fontStyle="italic"
            fill="url(#stripesPattern)"
          >
            DRIBBLE
          </text>
        </g>

        {/* Gold outline */}
        <text
          x="160" y="30"
          textAnchor="middle"
          fontFamily="'Press Start 2P', monospace"
          fontSize="26"
          fontWeight="bold"
          fontStyle="italic"
          fill="none"
          stroke="url(#goldOutline)"
          strokeWidth="1"
        >
          DOUBLE
        </text>
        <text
          x="160" y="62"
          textAnchor="middle"
          fontFamily="'Press Start 2P', monospace"
          fontSize="26"
          fontWeight="bold"
          fontStyle="italic"
          fill="none"
          stroke="url(#goldOutline)"
          strokeWidth="1"
        >
          DRIBBLE
        </text>
      </svg>

      {size !== "sm" && (
        <span className="text-[8px] font-retro tracking-widest text-gray-400 dark:text-gray-500 mt-1 uppercase">
          Est. 1987
        </span>
      )}
    </div>
  );
}
