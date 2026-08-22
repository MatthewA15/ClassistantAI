"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/cn";

/**
 * Shared machinery for the narrative scenes in Showcase.
 *
 * Each scene is a short film on a loop: one clock, and views derived from the
 * current time. That beats a pile of CSS keyframes here because the beats keep
 * being re-cut during design, and re-timing a story is a one-line change to a
 * threshold rather than fifteen sets of percentages.
 */

export function usePrefersReducedMotion() {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(mq.matches);
    const onChange = () => setReduced(mq.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);
  return reduced;
}

/**
 * Looping scene clock in milliseconds.
 *
 * Under reduced motion it parks on `restAt` rather than stopping at zero, so a
 * still viewer sees the payoff frame instead of an empty stage.
 */
export function useSceneClock(cycle: number, restAt: number, tick = 200) {
  const reduced = usePrefersReducedMotion();
  const [t, setT] = useState(0);

  useEffect(() => {
    if (reduced) {
      setT(restAt);
      return;
    }
    const id = setInterval(() => setT((v) => (v + tick) % cycle), tick);
    return () => clearInterval(id);
  }, [reduced, cycle, restAt, tick]);

  return t;
}

/** Cross-fades one act in and the others out. */
export function Stage({ show, children }: { show: boolean; children: React.ReactNode }) {
  return (
    <div
      aria-hidden={!show}
      className={cn(
        "absolute inset-0 grid place-items-center p-4 transition-all duration-500 ease-[cubic-bezier(0.22,1,0.36,1)]",
        show ? "scale-100 opacity-100" : "pointer-events-none scale-[0.97] opacity-0",
      )}
    >
      {children}
    </div>
  );
}

export function SceneFrame({
  children,
  caption,
}: {
  children: React.ReactNode;
  caption: string;
}) {
  return (
    <figure className="relative">
      <div className="relative aspect-[16/10] overflow-hidden rounded-[1.4rem] bg-sky-50 shadow-lift ring-1 ring-line">
        {children}
      </div>
      <figcaption className="mt-4 text-center text-[0.9rem] text-body-soft">{caption}</figcaption>
    </figure>
  );
}

export function PhoneFrame({ children }: { children: React.ReactNode }) {
  return (
    <div className="h-full w-[42%] min-w-[9.5rem] max-w-[12rem] rounded-[1.5rem] bg-ink-950 p-[0.4rem] shadow-lift">
      <div className="flex h-full flex-col gap-1.5 overflow-hidden rounded-[1.15rem] bg-white p-2.5">
        <div className="flex items-center justify-between px-1 pb-1 text-[0.5rem] font-semibold text-ink-900">
          <span>9:41</span>
          <span className="h-1.5 w-8 rounded-full bg-ink-900/15" />
        </div>
        {children}
      </div>
    </div>
  );
}

export function Bubble({ children, mine = false }: { children: React.ReactNode; mine?: boolean }) {
  return (
    <div className={cn("flex", mine ? "justify-end" : "justify-start")}>
      <p
        className={cn(
          "max-w-[88%] rounded-[0.85rem] px-2.5 py-1.5 text-[0.6rem] leading-[1.35]",
          mine
            ? "rounded-br-[0.25rem] bg-brand-600 text-white"
            : "rounded-bl-[0.25rem] bg-sky-100 text-ink-900",
        )}
        style={{ animation: "bubble-in .4s var(--ease-out-soft) both" }}
      >
        {children}
      </p>
    </div>
  );
}

export function Typing() {
  return (
    <div className="flex justify-start">
      <span className="flex items-center gap-[0.18rem] rounded-[0.85rem] rounded-bl-[0.25rem] bg-sky-100 px-2.5 py-2">
        {[0, 1, 2].map((d) => (
          <span
            key={d}
            className="h-[0.3rem] w-[0.3rem] rounded-full bg-ink-700/45"
            style={{ animation: "typing-dot 1.3s ease-in-out infinite", animationDelay: `${d * 0.18}s` }}
          />
        ))}
      </span>
    </div>
  );
}

/** Pointer that glides between beats by transitioning its coordinates. */
export function Cursor({ left, top }: { left: string; top: string }) {
  return (
    <span
      aria-hidden="true"
      className="pointer-events-none absolute z-10 transition-all duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]"
      style={{ left, top }}
    >
      <svg width="15" height="20" viewBox="0 0 15 20" fill="none">
        <path
          d="M1 1l11 7-4.6 1.4L5.6 15z"
          fill="var(--color-ink-900)"
          stroke="#fff"
          strokeWidth="1.6"
          strokeLinejoin="round"
        />
      </svg>
    </span>
  );
}

/**
 * Counter badge, used to make "fast" measurable rather than asserted.
 *
 * The number sits beside the ring rather than inside it, because a value like
 * 4.35 does not fit in a 32px circle. Tabular figures, or the pill jitters on
 * every hundredth.
 */
export function CounterBadge({
  value,
  max,
  unit,
  decimals = 0,
}: {
  value: number;
  max: number;
  unit: string;
  decimals?: number;
}) {
  const safe = Math.max(0, value);
  const r = 15;
  const c = 2 * Math.PI * r;

  return (
    <div className="absolute right-3 top-3 z-20 flex items-center gap-2.5 rounded-full bg-ink-900/92 py-1.5 pl-2 pr-3.5 backdrop-blur">
      <span className="relative grid h-6 w-6 place-items-center">
        <svg viewBox="0 0 36 36" className="absolute inset-0 -rotate-90" aria-hidden="true">
          <circle cx="18" cy="18" r={r} fill="none" stroke="#fff" strokeOpacity="0.22" strokeWidth="4" />
          <circle
            cx="18"
            cy="18"
            r={r}
            fill="none"
            stroke="var(--color-sky-400)"
            strokeWidth="4"
            strokeLinecap="round"
            strokeDasharray={c}
            strokeDashoffset={c * (1 - safe / max)}
            style={{ transition: "stroke-dashoffset .12s linear" }}
          />
        </svg>
      </span>

      <span className="flex items-baseline gap-1.5">
        <span className="font-display text-[0.95rem] font-extrabold tabular-nums leading-none text-white">
          {safe.toFixed(decimals)}
        </span>
        <span className="text-[0.62rem] font-semibold uppercase tracking-[0.14em] text-sky-200">
          {unit}
        </span>
      </span>
    </div>
  );
}
