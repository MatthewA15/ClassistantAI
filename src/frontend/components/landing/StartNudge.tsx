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
  const dismissButton = useRef<HTMLButtonElement>(null);
  const returnFocusTo = useRef<Element | null>(null);

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
    if (school && open) close();
  }, [school, open, close]);

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

const CYCLE = 9000;
const B = {
  reachChip: 1100,
  clickChip: 2100,
  lit: 2400,
  reachCta: 2800,
  clickCta: 3900,
};

const EASE = "cubic-bezier(0.22, 1, 0.36, 1)";

/** The two clicks, in the order they have to happen. */
function NudgeScene() {
  // Rests with the school chosen, the button live, and the pointer on it: the
  // frame that answers "why is that button not doing anything".
  const t = useSceneClock(CYCLE, 4600, 90);

  const picked = t >= B.clickChip;
  const lit = t >= B.lit;
  const pressingChip = t >= B.clickChip && t < B.clickChip + 260;
  const pressingCta = t >= B.clickCta && t < B.clickCta + 320;

  const cursor =
    t < B.reachChip
      ? { x: 250, y: 168 }
      : t < B.reachCta
        ? { x: 78, y: 88 }
        : { x: 262, y: 160 };

  const schools = LIVE_SCHOOLS.slice(0, 2);

  return (
    <svg viewBox="0 0 320 200" className="h-full w-full" aria-hidden="true" role="presentation">
      <rect x="10" y="10" width="300" height="180" rx="14" fill="#fff" />

      {/* Stand-ins for the hero's headline. Bars rather than real words: the
          card is teaching a gesture, and lettering here would be read instead
          of the thing being pointed at. */}
      <rect x="26" y="28" width="150" height="9" rx="4.5" fill="var(--color-sky-200)" />
      <rect x="26" y="44" width="104" height="9" rx="4.5" fill="var(--color-sky-100)" />

      {schools.map((s, i) => (
        <Chip
          key={s.id}
          school={s}
          y={70 + i * 32}
          on={picked && i === 0}
          pressing={pressingChip && i === 0}
        />
      ))}

      {/* the composer, inert until a school is chosen */}
      <g
        style={{
          transform: pressingCta ? "translateY(1.5px)" : "none",
          transition: `transform 140ms ${EASE}`,
        }}
      >
        <rect
          x="26"
          y="142"
          width="258"
          height="30"
          rx="15"
          fill="#fff"
          stroke={lit ? "var(--color-brand-500)" : "var(--color-line)"}
          strokeWidth={lit ? 2 : 1.4}
          style={{ transition: "stroke 400ms linear, stroke-width 400ms linear" }}
        />
        <text
          x="42"
          y="161"
          fontSize="8"
          fill={lit ? "var(--color-ink-900)" : "var(--color-body-soft)"}
          style={{ transition: "fill 400ms linear" }}
        >
          i&rsquo;m ready to start for free
        </text>
        <circle
          cx="266"
          cy="157"
          r="10"
          fill={lit ? "var(--color-brand-600)" : "var(--color-line)"}
          style={{ transition: "fill 400ms linear" }}
        />
        <path
          d="M262 157h7M266.5 153.5l3.5 3.5-3.5 3.5"
          fill="none"
          stroke={lit ? "#fff" : "var(--color-body-soft)"}
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeLinejoin="round"
          style={{ transition: "stroke 400ms linear" }}
        />
      </g>

      <g
        style={{
          transform: `translate(${cursor.x}px, ${cursor.y}px)`,
          transition: `transform 620ms ${EASE}`,
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
 * One school chip. Full legal name, matching the real picker: the abbreviation
 * is unambiguous on campus and meaningless off it, and this is a picture of the
 * moment a student confirms we mean their school.
 */
function Chip({
  school,
  y,
  on,
  pressing,
}: {
  school: School;
  y: number;
  on: boolean;
  pressing: boolean;
}) {
  const brand = school.brand?.primary ?? "var(--color-brand-600)";

  return (
    <g
      style={{
        transform: pressing ? "scale(0.985)" : "none",
        transformOrigin: `26px ${y + 13}px`,
        transition: `transform 160ms ${EASE}`,
      }}
    >
      <rect
        x="26"
        y={y}
        width="258"
        height="26"
        rx="13"
        fill={on ? "var(--color-brand-600)" : "#fff"}
        stroke={on ? "var(--color-brand-600)" : "var(--color-line)"}
        strokeWidth="1.4"
        style={{ transition: "fill 300ms linear, stroke 300ms linear" }}
      />
      <circle cx="41" cy={y + 13} r="9" fill={on ? "#fff" : brand} />
      <text
        x="41"
        y={y + 16}
        textAnchor="middle"
        fontSize="7"
        fontWeight="700"
        fill={on ? brand : "#fff"}
      >
        {schoolInitials(school.name)}
      </text>
      <text
        x="57"
        y={y + 17}
        fontSize="8.5"
        fontWeight="600"
        fill={on ? "#fff" : "var(--color-ink-800)"}
        style={{ transition: "fill 300ms linear" }}
      >
        {school.name}
      </text>
    </g>
  );
}
