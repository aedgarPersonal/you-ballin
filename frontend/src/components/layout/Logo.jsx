/**
 * Logo Component
 * ==============
 * Inline SVG brand mark with basketball icon and "YOU BALLIN" wordmark.
 * Supports size variants for navbar vs. auth pages.
 */

export default function Logo({ size = "sm", className = "" }) {
  const sizes = {
    sm: { height: 36, iconSize: 36, textClass: "text-lg" },
    md: { height: 48, iconSize: 48, textClass: "text-2xl" },
    lg: { height: 64, iconSize: 64, textClass: "text-4xl" },
  };

  const { iconSize, textClass } = sizes[size] || sizes.sm;

  return (
    <div className={`flex items-center gap-2.5 ${className}`}>
      {/* Basketball icon mark */}
      <div className="relative" style={{ width: iconSize, height: iconSize }}>
        <svg
          viewBox="0 0 64 64"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          className="w-full h-full drop-shadow-md"
        >
          {/* Outer ring with gradient */}
          <defs>
            <linearGradient id="ballGrad" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#fb923c" />
              <stop offset="50%" stopColor="#f97316" />
              <stop offset="100%" stopColor="#ea580c" />
            </linearGradient>
            <linearGradient id="lineGrad" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#c2410c" />
              <stop offset="100%" stopColor="#9a3412" />
            </linearGradient>
          </defs>

          {/* Ball body */}
          <circle cx="32" cy="32" r="29" fill="url(#ballGrad)" />

          {/* Highlight */}
          <ellipse cx="22" cy="20" rx="12" ry="10" fill="white" opacity="0.15" />

          {/* Seam lines */}
          <path
            d="M32 3 C32 32 32 32 32 61"
            stroke="url(#lineGrad)"
            strokeWidth="1.8"
            strokeLinecap="round"
          />
          <path
            d="M3 32 C32 32 32 32 61 32"
            stroke="url(#lineGrad)"
            strokeWidth="1.8"
            strokeLinecap="round"
          />
          <path
            d="M10 10 Q32 24 54 10"
            stroke="url(#lineGrad)"
            strokeWidth="1.8"
            strokeLinecap="round"
            fill="none"
          />
          <path
            d="M10 54 Q32 40 54 54"
            stroke="url(#lineGrad)"
            strokeWidth="1.8"
            strokeLinecap="round"
            fill="none"
          />

          {/* Outer ring */}
          <circle
            cx="32"
            cy="32"
            r="29"
            fill="none"
            stroke="#9a3412"
            strokeWidth="2.5"
            opacity="0.3"
          />
        </svg>
      </div>

      {/* Wordmark */}
      <div className="flex flex-col leading-none">
        <span
          className={`${textClass} font-extrabold tracking-tight bg-gradient-to-r from-court-500 via-court-600 to-court-700 bg-clip-text text-transparent`}
        >
          YOU BALLIN
        </span>
        {size !== "sm" && (
          <span className="text-xs font-medium tracking-[0.2em] text-gray-400 dark:text-gray-500 mt-0.5 uppercase">
            Pickup Basketball
          </span>
        )}
      </div>
    </div>
  );
}
