"use client";

import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

/**
 * Morphing dark-blue light, positioned behind whatever is slotted into it.
 *
 * It deliberately draws NO surface of its own. An earlier version painted a
 * white capsule here, which meant every header item ended up as a button inside
 * a second capsule: visually doubled and much too tall. The glow is the only
 * thing this owns; the child supplies its own background, ring, and height.
 *
 * Blur is what separates "light" from "smudge". Drop it and these read as navy
 * blobs parked behind a button.
 */
export function GlowSlot({
  children,
  scrolled,
  pulse = false,
  className,
}: {
  children: ReactNode;
  scrolled: boolean;
  /**
   * Brighten on a slow loop to draw the eye back. Only the CTA sets this: a
   * header where all three capsules breathe in time is a light show, and the
   * point is to single one of them out.
   */
  pulse?: boolean;
  className?: string;
}) {
  // Opacity moved out of a Tailwind class and into a variable so the keyframe
  // can read both levels. `opacity-80`/`opacity-50` in the class list would also
  // outrank the animation's own opacity depending on emission order, which is
  // the same trap as every other competing-utility bug in this codebase.
  const base = scrolled ? 0.8 : 0.5;
  const peak = Math.min(1, base * 1.4);
  return (
    // pointer-events-auto lives here, not only on the capsule surface. The
    // header wrapper is pointer-events-none, and anything slotted in that is
    // NOT the capsule itself (a dropdown panel, a tooltip) would otherwise
    // render fine and silently swallow nothing, letting every click fall
    // through to the page behind it. The root box is exactly the capsule's
    // size, so this adds no clickable area to the gutter.
    <div className={cn("pointer-events-auto relative", className)}>
      <div
        aria-hidden="true"
        // Dialled well back from the first version. At full strength the light
        // competed with the page content underneath instead of just lifting the
        // capsule off it.
        className={cn(
          "absolute -inset-x-3 -bottom-3 -top-2 -z-10",
          // Under reduced motion the animation class is never applied, so the
          // inline opacity below is what holds: a still, resting glow.
          pulse ? "motion-safe:animate-cta-attention" : "transition-opacity duration-700",
        )}
        style={
          {
            opacity: base,
            "--cta-glow": base,
            "--cta-glow-peak": peak,
          } as React.CSSProperties
        }
      >
        <div
          className="absolute inset-x-[8%] top-[25%] h-[95%] rounded-full bg-brand-600/22 blur-[26px] motion-safe:animate-glow-morph"
          style={{ animationDuration: "22s" }}
        />
        <div
          className="absolute left-0 top-0 h-full w-[60%] bg-ink-800/28 blur-[24px] motion-safe:animate-glow-morph"
          style={{ animationDuration: "18s", animationDelay: "-3s" }}
        />
        <div
          className="absolute right-0 top-[8%] h-full w-[55%] bg-ink-700/24 blur-[26px] motion-safe:animate-glow-morph"
          style={{ animationDuration: "29s", animationDelay: "-11s" }}
        />
      </div>

      {children}
    </div>
  );
}

/**
 * Shared surface for a header capsule. Every header item is exactly one pill of
 * the same height, so the three read as siblings rather than nested chrome.
 */
export function pillSurface(scrolled: boolean, tone: "light" | "ink" = "light") {
  // Tone is a parameter, not an appended class. Passing `bg-ink-900` in
  // alongside a `bg-white/90` already inside here lets Tailwind's emission
  // order pick the winner, and white silently won: the dark CTA rendered as a
  // pale pill with white text on it. Same trap as competing font weights.
  return cn(
    "pointer-events-auto relative flex h-11 items-center rounded-full backdrop-blur-xl transition-all duration-500 ease-[cubic-bezier(0.22,1,0.36,1)]",
    tone === "ink"
      ? "bg-ink-900 text-white ring-1 ring-ink-800 hover:bg-ink-800"
      : scrolled
        ? "bg-white/90 ring-1 ring-white/70"
        : "bg-white/72 ring-1 ring-white/55",
    scrolled
      ? "shadow-[0_10px_28px_-12px_rgb(6_32_58_/_0.42)]"
      : "shadow-[0_8px_22px_-14px_rgb(6_32_58_/_0.3)]",
  );
}
