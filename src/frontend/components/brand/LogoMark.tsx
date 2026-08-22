import { useId } from "react";
import { cn } from "@/lib/cn";

type Tone = "brand" | "white" | "ink";

const TONES: Record<Tone, { board: [string, string]; lines: string; tassel: string; cord: string }> = {
  // Default: the board carries the dark-to-working blue gradient.
  brand: { board: ["#0f3a63", "#0b63e5"], lines: "#ffffff", tassel: "#8ecaff", cord: "#5fb0ff" },
  // On navy sections the board flips to white so the mark keeps its weight.
  white: { board: ["#ffffff", "#e8f3ff"], lines: "#0a2c4d", tassel: "#8ecaff", cord: "#5fb0ff" },
  // Single-colour fallback for favicons, stamps, and anywhere print-safe matters.
  ink: { board: ["#06203a", "#06203a"], lines: "#ffffff", tassel: "#06203a", cord: "#06203a" },
};

/**
 * The Classistant mark: a mortarboard board (the diamond) that doubles as a
 * message bubble (sharp bottom point, two lines of text inside), with a tassel
 * hanging off the right corner. School plus texting, in one shape.
 *
 * Rationale lives in docs/design/01-brand-and-logo.md.
 */
export function LogoMark({
  size = 40,
  tone = "brand",
  animated = false,
  className,
}: {
  size?: number;
  tone?: Tone;
  animated?: boolean;
  className?: string;
}) {
  const gradientId = useId();
  const palette = TONES[tone];

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 48 48"
      fill="none"
      role="img"
      aria-hidden="true"
      className={cn("shrink-0", className)}
    >
      <defs>
        <linearGradient id={gradientId} x1="8" y1="4" x2="38" y2="38" gradientUnits="userSpaceOnUse">
          <stop stopColor={palette.board[0]} />
          <stop offset="1" stopColor={palette.board[1]} />
        </linearGradient>
      </defs>

      {/* Tassel. Anchored at the board's right corner so the swing pivots there. */}
      <g
        style={{ transformOrigin: "36px 20px" }}
        className={cn(animated && "motion-safe:animate-swing")}
      >
        <path
          d="M36.5 19.5C41.5 20.5 43.5 24 43.5 30"
          stroke={palette.cord}
          strokeWidth="2.6"
          strokeLinecap="round"
        />
        <circle cx="43.5" cy="33.2" r="2.9" fill={palette.tassel} />
      </g>

      {/* Board / bubble. Three soft corners, one sharp point at the bottom. */}
      <path
        d="M17.4 8.6 Q22 4 26.6 8.6 L34.4 16.4 Q39 21 34.4 25.6 L23.6 36.4 Q22 38 20.4 36.4 L9.6 25.6 Q5 21 9.6 16.4 Z"
        fill={`url(#${gradientId})`}
      />

      {/* Two lines of a message, sitting inside the board. */}
      <path
        d="M14.5 18.6H29.5"
        stroke={palette.lines}
        strokeWidth="3"
        strokeLinecap="round"
        opacity="0.96"
      />
      <path
        d="M14.5 25.4H24.5"
        stroke={palette.lines}
        strokeWidth="3"
        strokeLinecap="round"
        opacity="0.96"
      />
    </svg>
  );
}

export function Logo({
  size = 36,
  tone = "brand",
  animated = false,
  className,
}: {
  size?: number;
  tone?: Tone;
  animated?: boolean;
  className?: string;
}) {
  return (
    <span className={cn("inline-flex items-center gap-2.5", className)}>
      <LogoMark size={size} tone={tone} animated={animated} />
      <span
        className={cn(
          "font-display text-[1.32rem] font-extrabold tracking-[-0.03em]",
          tone === "white" ? "text-white" : "text-ink-900",
        )}
      >
        Classistant
      </span>
    </span>
  );
}
