"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useSceneClock } from "@/components/landing/sceneParts";
import { useSchoolTheme } from "@/components/theme/SchoolTheme";
import { LIVE_SCHOOLS, schoolInitials, type School } from "@/data/schools";
import { cn } from "@/lib/cn";

/**
 * A card that shows up after half a minute of nothing, and demonstrates the
 * two clicks that start the flow.
 *
 * The hero asks for something slightly unusual: pick your school first, and the
 * button underneath stays inert until you do. Someone who scrolls straight past
 * the chips finds a dead button and no explanation. Rather than explain it in
 * copy, this shows the gesture.
 *
 * It is deliberately hard to trigger. It waits 30 seconds, and any of the three
 * things a student might do in that time cancels it for good: picking a school,
 * clicking a "get set up" control anywhere on the page, or having seen it once
 * already this session.
 */

const IDLE_MS = 30_000;
const SEEN_KEY = "classistant:start-nudge-seen";

/** sessionStorage throws outright in some embedded contexts, so never bare. */
function seenThisSession() {
  try {
    return window.sessionStorage.getItem(SEEN_KEY) === "1";
  } catch {
    return false;
  }
}

function markSeen() {
  try {
    window.sessionStorage.setItem(SEEN_KEY, "1");
  } catch {
    /* a nudge that shows twice is better than a crash */
  }
}

export function StartNudge() {
  const { school } = useSchoolTheme();
  const [open, setOpen] = useState(false);
  /** Summoned by hand, so none of the cancels apply to it. */
  const [forced, setForced] = useState(false);
  const dismissButton = useRef<HTMLButtonElement>(null);
  const returnFocusTo = useRef<Element | null>(null);

  /**
   * `/?nudge=1` opens the card immediately, ignoring the timer and the
   * once-a-session flag. The card is otherwise deliberately hard to trigger,
   * which makes it deliberately hard to look at while designing it.
   *
   * Read off `window` rather than through `useSearchParams`, which would need a
   * Suspense boundary on this statically rendered route and would opt the whole
   * landing page into dynamic rendering for the sake of a preview flag.
   */
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("nudge") !== "1") return;
    returnFocusTo.current = document.activeElement;
    setForced(true);
    setOpen(true);
  }, []);

  const close = useCallback(() => {
    markSeen();
    setOpen(false);
    if (returnFocusTo.current instanceof HTMLElement) returnFocusTo.current.focus();
  }, []);

  // Arm the timer, and let three different things disarm it.
  useEffect(() => {
    if (school || seenThisSession()) return;

    const timer = window.setTimeout(() => {
      if (seenThisSession()) return;
      returnFocusTo.current = document.activeElement;
      setOpen(true);
    }, IDLE_MS);

    // Any control that starts the flow counts as engagement, wherever it is.
    // A capture-phase listener so it still registers on a link that navigates.
    const onClick = (e: MouseEvent) => {
      const el = e.target instanceof Element ? e.target.closest("[data-start-cta]") : null;
      if (el) {
        markSeen();
        window.clearTimeout(timer);
      }
    };

    document.addEventListener("click", onClick, true);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener("click", onClick, true);
    };
  }, [school]);

  // Picking a school after the card is already up answers it, so get out of
  // the way rather than making them dismiss a card about a thing they just did.
  useEffect(() => {
    if (school && open && !forced) close();
  }, [school, open, forced, close]);

  useEffect(() => {
    if (!open) return;
    dismissButton.current?.focus();

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, close]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[60] grid place-items-center p-5"
      role="dialog"
      aria-modal="true"
      aria-labelledby="start-nudge-title"
    >
      {/* Dismisses on click. It is a suggestion, not a decision to be extracted
          from someone, so every exit is available: this, Escape, and Got it. */}
      <button
        type="button"
        aria-label="Close"
        onClick={close}
        className="absolute inset-0 -z-10 cursor-default bg-ink-950/35 backdrop-blur-[2px]"
        style={{ animation: "nudge-scrim .3s ease-out both" }}
      />

      <div
        className="w-full max-w-[26rem] rounded-[1.4rem] bg-white p-5 shadow-lift ring-1 ring-line sm:p-6"
        style={{ animation: "bubble-in .4s var(--ease-out-soft) both" }}
      >
        <h2
          id="start-nudge-title"
          className="text-center text-[1.05rem] font-extrabold tracking-[-0.01em] text-ink-900"
        >
          Get started like this
        </h2>

        <div className="mt-4 overflow-hidden rounded-[1.1rem] bg-paper ring-1 ring-line">
          <NudgeScene />
        </div>

        <button
          ref={dismissButton}
          type="button"
          onClick={close}
          className="mt-4 w-full rounded-xl bg-ink-900 px-5 py-3 text-[0.92rem] font-semibold text-white transition-colors hover:bg-ink-800"
        >
          Got it
        </button>
      </div>
    </div>
  );
}

/* --------------------------------------------------------------- the scene */

const CYCLE = 10_000;
const B = {
  reachChip: 1200,
  clickChip: 2300,
  reachCta: 3000,
  clickCta: 4000,
};

const EASE = "cubic-bezier(0.22, 1, 0.36, 1)";

/** Approximate advance width per character at a given size, for this typeface. */
const textWidth = (s: string, size: number) => s.length * size * 0.505;

const CHIP_H = 22;
const CHIP_Y = 90;
const CHIP_TEXT = 6.2;

const IDLE_LABEL = "Pick a school above, then click here";
const READY_LABEL = "i’m ready to start for free";

/**
 * The two clicks, drawn as the hero actually looks.
 *
 * This is a picture whose whole job is recognition: a student should see it,
 * scroll up, and find the same thing. So it copies the real hero rather than
 * suggesting it. The real headline, the real "Pick your school" label, both
 * schools side by side the way the row actually wraps, the composer's real
 * placeholder, and the real send control, which is an arrow pointing UP, not
 * right, and which only exists once a school is chosen.
 *
 * The accent switches too. Picking the University of Alberta re-themes the
 * whole site into their green (SchoolThemeProvider rewrites --color-brand-*),
 * so a hint that stayed blue through the click would be showing something that
 * does not happen.
 */
function NudgeScene() {
  // Rests with the school chosen and the button live: the frame that answers
  // "why is that button not doing anything".
  const t = useSceneClock(CYCLE, 4700, 90);

  const picked = t >= B.clickChip;
  const pressingChip = t >= B.clickChip && t < B.clickChip + 240;
  const pressingCta = t >= B.clickCta && t < B.clickCta + 320;

  const schools = LIVE_SCHOOLS.slice(0, 2);
  const chosen = schools[0];

  // The site's own theme colour once a school is picked, exactly as the real
  // one does. Falls back to the default blue before the click.
  const accent = picked ? (chosen?.brand?.primary ?? "var(--color-brand-600)") : "var(--color-brand-600)";

  // Chips are laid out left to right on one row, which is how the real row sits
  // at full width. Widths come from the names so a longer school does not
  // silently overlap its neighbour.
  let x = 16;
  const laid = schools.map((s) => {
    const w = 22 + textWidth(s.name, CHIP_TEXT) + 8;
    const box = { school: s, x, w };
    x += w + 6;
    return box;
  });
  const notHereW = 12 + textWidth("+ Mine is not here", CHIP_TEXT) + 10;
  const notHereX = x;

  const cursor =
    t < B.reachChip
      ? { x: 240, y: 172 }
      : t < B.reachCta
        ? { x: laid[0].x + 34, y: CHIP_Y + 15 }
        : { x: 252, y: 146 };

  return (
    <svg viewBox="0 0 320 200" className="h-full w-full" aria-hidden="true" role="presentation">
      {/* The hero's own wash, so the card reads as a piece of that screen. */}
      <rect x="0" y="0" width="320" height="200" fill="var(--color-hero)" />

      <text
        x="16"
        y="42"
        fontSize="15"
        fontWeight="800"
        letterSpacing="-0.45"
        fill="var(--color-ink-900)"
      >
        Your semester,
      </text>
      <text
        x="16"
        y="60"
        fontSize="15"
        fontWeight="800"
        letterSpacing="-0.45"
        fill="var(--color-ink-900)"
      >
        handled over text.
      </text>

      <text
        x="16"
        y="82"
        fontSize="6"
        fontWeight="600"
        letterSpacing="1"
        fill="var(--color-body-soft)"
      >
        PICK YOUR SCHOOL
      </text>

      {laid.map((box, i) => (
        <Chip
          key={box.school.id}
          school={box.school}
          x={box.x}
          w={box.w}
          on={picked && i === 0}
          accent={accent}
          pressing={pressingChip && i === 0}
        />
      ))}

      {/* "Mine is not here" is part of the row in the real hero, and leaving it
          out would teach a two-option picker that does not exist. */}
      <g>
        <rect
          x={notHereX}
          y={CHIP_Y}
          width={notHereW}
          height={CHIP_H}
          rx={CHIP_H / 2}
          fill="none"
          stroke="var(--color-line)"
          strokeWidth="1.2"
          strokeDasharray="3 2.5"
        />
        <text
          x={notHereX + 10}
          y={CHIP_Y + 14.5}
          fontSize={CHIP_TEXT}
          fontWeight="600"
          fill="var(--color-body-soft)"
        >
          + Mine is not here
        </text>
      </g>

      {/* the composer */}
      <g
        style={{
          transform: pressingCta ? "translateY(1.5px)" : "none",
          transition: `transform 140ms ${EASE}`,
        }}
      >
        <rect
          x="16"
          y="126"
          width="250"
          height="28"
          rx="14"
          fill="#fff"
          stroke={picked ? accent : "var(--color-line)"}
          strokeWidth={picked ? 1.8 : 1.2}
          style={{ transition: "stroke 400ms linear" }}
        />
        <text
          x="32"
          y="144"
          fontSize="7.5"
          fill={picked ? "var(--color-ink-900)" : "var(--color-body-soft)"}
          style={{ transition: "fill 300ms linear" }}
        >
          {picked ? READY_LABEL : IDLE_LABEL}
        </text>

        {/* Two different affordances, not one control that dims: a waveform
            while there is nothing to send, and a filled arrow once there is. */}
        {picked ? (
          <g>
            <circle cx="250" cy="140" r="11" fill={accent} />
            <g transform="translate(242.5 132.5) scale(0.75)">
              <path
                d="M10 15.6V5M10 5 5.6 9.4M10 5l4.4 4.4"
                fill="none"
                stroke="#fff"
                strokeWidth="2.2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </g>
          </g>
        ) : (
          <g
            transform="translate(240.5 130.5) scale(0.95)"
            stroke="var(--color-body-soft)"
            strokeWidth="1.5"
            strokeLinecap="round"
            fill="none"
          >
            <path d="M3.2 8.4v3.2" />
            <path d="M6.6 5.9v8.2" />
            <path d="M10 3.6v12.8" />
            <path d="M13.4 5.9v8.2" />
            <path d="M16.8 8.4v3.2" />
          </g>
        )}
      </g>

      <g
        style={{
          transform: `translate(${cursor.x}px, ${cursor.y}px)`,
          transition: `transform 640ms ${EASE}`,
        }}
      >
        <path
          d="M0 0l10 6.5-4.3 1.3L4.3 13z"
          fill="var(--color-ink-900)"
          stroke="#fff"
          strokeWidth="1.6"
          strokeLinejoin="round"
        />
      </g>
    </svg>
  );
}

/**
 * One school chip, matching the real one: a rounded-square crest in the
 * school's own brand colour, then the full legal name. Selected, the chip fills
 * with that same colour and the crest goes translucent white on top of it.
 */
function Chip({
  school,
  x,
  w,
  on,
  accent,
  pressing,
}: {
  school: School;
  x: number;
  w: number;
  on: boolean;
  accent: string;
  pressing: boolean;
}) {
  const brand = school.brand?.primary ?? "var(--color-ink-800)";

  return (
    <g
      style={{
        transform: pressing ? "scale(0.98)" : "none",
        transformOrigin: `${x + w / 2}px ${CHIP_Y + CHIP_H / 2}px`,
        transition: `transform 160ms ${EASE}`,
      }}
    >
      <rect
        x={x}
        y={CHIP_Y}
        width={w}
        height={CHIP_H}
        rx={CHIP_H / 2}
        fill={on ? accent : "#fff"}
        stroke={on ? accent : "var(--color-line)"}
        strokeWidth="1.2"
        style={{ transition: "fill 300ms linear, stroke 300ms linear" }}
      />
      <rect
        x={x + 5}
        y={CHIP_Y + 4.5}
        width="13"
        height="13"
        rx="3.2"
        fill={on ? "rgba(255,255,255,0.22)" : brand}
        style={{ transition: "fill 300ms linear" }}
      />
      <text
        x={x + 11.5}
        y={CHIP_Y + 13.6}
        textAnchor="middle"
        fontSize="4.4"
        fontWeight="800"
        fill="#fff"
      >
        {schoolInitials(school.name)}
      </text>
      <text
        x={x + 22}
        y={CHIP_Y + 14.5}
        fontSize={CHIP_TEXT}
        fontWeight="600"
        fill={on ? "#fff" : "var(--color-ink-800)"}
        style={{ transition: "fill 300ms linear" }}
      >
        {school.name}
      </text>
    </g>
  );
}
