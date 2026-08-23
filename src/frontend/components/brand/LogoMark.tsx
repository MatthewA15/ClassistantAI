import { useId } from "react";
import { cn } from "@/lib/cn";

type Tone = "brand" | "white" | "ink";

const TONES: Record<Tone, { hand: [string, string]; board: string; crown: string; tassel: string }> = {
  // Default: the hand carries the dark-to-working blue gradient, the cap is light.
  brand: { hand: ["#0f3a63", "#0b63e5"], board: "#8ecaff", crown: "#1b7bf5", tassel: "#5fb0ff" },
  // On navy sections the hand flips to white so the mark keeps its weight.
  white: { hand: ["#ffffff", "#d3e9ff"], board: "#8ecaff", crown: "#0b63e5", tassel: "#8ecaff" },
  // One hue, three values. For print, embroidery, and anywhere a gradient dies.
  ink: { hand: ["#06203a", "#06203a"], board: "#17527f", crown: "#0a2c4d", tassel: "#17527f" },
};

/**
 * The Classistant mark: an OK hand holding up half a graduation cap.
 *
 * The hand is the promise (handled, sorted, you are good) and the cap is the
 * subject. The cap is drawn whole but its left point sits behind the fingers,
 * so what reads is the right half of a mortarboard emerging from a fist. Cutting
 * the cap with a real vertical edge was tried first and read as a pennant on a
 * pole: a right-pointing triangle needs the crown and the button under and over
 * it before anyone sees a graduation cap.
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
  const hand = `url(#${gradientId})`;

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
        <linearGradient id={gradientId} x1="4" y1="18" x2="26" y2="46" gradientUnits="userSpaceOnUse">
          <stop stopColor={palette.hand[0]} />
          <stop offset="1" stopColor={palette.hand[1]} />
        </linearGradient>
      </defs>

      {/* Crown, drawn first so the board sits on top of it. Without the crown
          the board is just a diamond and the mark stops saying "cap". */}
      <path
        d="M16.2 22.4 L34 22.4 L32.6 31.5 Q32.4 33.3 30.4 33.3 L17.8 33.3 Q15.8 33.3 15.6 31.5 Z"
        fill={palette.crown}
      />

      {/* Button, then the board. */}
      <circle cx="25" cy="10.2" r="2.3" fill={palette.board} />
      <path d="M25 12.4 L44 18.3 L25 24.2 L13.2 18.3 Z" fill={palette.board} />

      {/* Tassel. Anchored at the board's right corner so the swing pivots there. */}
      <g
        style={{ transformOrigin: "44px 18.3px" }}
        className={cn(animated && "motion-safe:animate-swing")}
      >
        <path
          d="M44 18.3 C45.8 20.7 45.9 23.3 45.4 26.9"
          stroke={palette.tassel}
          strokeWidth="2"
          strokeLinecap="round"
        />
        <circle cx="45.2" cy="29.5" r="2.4" fill={palette.tassel} />
      </g>

      {/* Hand, in front of the cap. The ring is the thumb and index; the palm
          and three fingers are separate strokes that merge into one silhouette,
          which keeps the counter inside the ring open at small sizes. */}
      <circle cx="8.4" cy="34.6" r="5.9" stroke={hand} strokeWidth="4.3" fill="none" />
      <rect x="8.8" y="35.6" width="12.8" height="9.4" rx="4.7" fill={hand} />
      <path d="M12.6 37.6 L12.4 17.2" stroke={hand} strokeWidth="4.7" strokeLinecap="round" />
      <path d="M17 37.2 L17.8 15.2" stroke={hand} strokeWidth="4.7" strokeLinecap="round" />
      <path d="M20.8 38 L22.6 18.4" stroke={hand} strokeWidth="4.7" strokeLinecap="round" />
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
