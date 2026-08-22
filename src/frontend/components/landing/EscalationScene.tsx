"use client";

import {
  PhoneFrame,
  SceneFrame,
  Stage,
  useSceneClock,
} from "@/components/landing/sceneParts";
import { cn } from "@/lib/cn";

/**
 * "It gets louder on purpose", as one continuous loop.
 *
 * Days tally off toward a deadline on the 30th. Every fifth day closes a tally
 * group and cuts to the phone, where the same reminder arrives a shade louder:
 * green, then amber, then red, and finally the handset rings.
 *
 * This absorbed a separate escalation section that described the same ladder in
 * four cards of prose. Watching the colour change costs no reading, and the
 * pause between cuts is doing the real work: the pressure is a function of time
 * running out, not of the agent getting impatient.
 *
 * The three notification hues are the one place the palette runs non-blue on
 * purpose. Hue is the only signal a reader decodes without being taught it.
 */

const CYCLE = 16_000;
const TICK = 80;

/** Beat boundaries in ms. Calendar stretches feed each phone cut. */
const B = {
  tally1: 2000, // days 1..5
  green: 3600,
  tally2: 5600, // days 6..10
  amber: 7200,
  tally3: 9200, // days 11..15
  red: 10_800,
  ringing: 13_000,
  answered: CYCLE,
} as const;

const DEADLINE = 30;

type View = "tally" | "green" | "amber" | "red" | "ringing" | "answered";

function viewAt(t: number): View {
  if (t < B.tally1) return "tally";
  if (t < B.green) return "green";
  if (t < B.tally2) return "tally";
  if (t < B.amber) return "amber";
  if (t < B.tally3) return "tally";
  if (t < B.red) return "red";
  if (t < B.ringing) return "ringing";
  return "answered";
}

/** Days struck off so far, derived from which stretch we are in. */
function daysAt(t: number): number {
  if (t < B.tally1) return Math.floor((t / B.tally1) * 5);
  if (t < B.tally2)
    return t < B.green
      ? 5
      : 5 + Math.floor(((t - B.green) / (B.tally2 - B.green)) * 5);
  if (t < B.tally3)
    return t < B.amber
      ? 10
      : 10 + Math.floor(((t - B.amber) / (B.tally3 - B.amber)) * 5);
  return 15;
}

const NOTES = {
  green: {
    tone: "ok" as const,
    title: "PSYC 258 essay posted",
    body: "Due the 30th. Plenty of time.",
  },
  amber: {
    tone: "warn" as const,
    title: "Still not started",
    body: "Two weeks left, about 6 hours of work.",
  },
  red: {
    tone: "alert" as const,
    title: "Final warning",
    body: "Start today or you will not finish on time.",
  },
};

export function EscalationScene() {
  const t = useSceneClock(CYCLE, 14_500, TICK);
  const view = viewAt(t);
  const days = daysAt(t);

  return (
    <SceneFrame caption="Same reminder, five days louder each time.">
      <Stage show={view === "tally"}>
        <Calendar days={days} />
      </Stage>

      {(["green", "amber", "red"] as const).map((key) => (
        <Stage key={key} show={view === key}>
          <PhoneFrame>
            <Lockscreen {...NOTES[key]} />
          </PhoneFrame>
        </Stage>
      ))}

      <Stage show={view === "ringing" || view === "answered"}>
        <PhoneFrame>
          <CallScreen answered={view === "answered"} />
        </PhoneFrame>
      </Stage>
    </SceneFrame>
  );
}

/* -------------------------------------------------------------- calendar */

function Calendar({ days }: { days: number }) {
  return (
    <div className="flex h-full w-full flex-col rounded-[1rem] bg-white p-3 shadow-lift ring-1 ring-line">
      <div className="mb-2 flex shrink-0 items-baseline justify-between">
        <span className="font-display text-[0.72rem] font-extrabold text-ink-900">
          November
        </span>
        <span className="text-[0.58rem] font-semibold uppercase tracking-[0.12em] text-body-soft">
          {DEADLINE - days} days left
        </span>
      </div>

      {/* Five explicit rows filling the height that is left, rather than square
          cells sized off the width: those made the grid taller than the card
          and pushed the last row, the deadline, out of the frame. */}
      <div className="min-h-0 flex-1">
        <div className="grid h-full w-full grid-cols-6 grid-rows-5 gap-1">
          {Array.from({ length: DEADLINE }).map((_, i) => {
            const day = i + 1;
            const gone = day <= days;
            const isDeadline = day === DEADLINE;
            return (
              <span
                key={day}
                className={cn(
                  "relative rounded-[0.3rem] transition-colors duration-200",
                  isDeadline
                    ? "bg-[var(--color-alert)]/12"
                    : gone
                      ? "bg-sky-100"
                      : "bg-paper",
                )}
              >
                <span
                  className={cn(
                    "absolute left-[8%] top-[3%] text-[0.42rem] font-semibold leading-[1.6]",
                    isDeadline
                      ? "text-[var(--color-alert)]"
                      : gone
                        ? "text-body-soft"
                        : "text-body-soft/70",
                  )}
                >
                  {day}
                </span>
                {gone && !isDeadline ? <Tally marks={((day - 1) % 5) + 1} /> : null}
                {isDeadline ? (
                  <svg
                    viewBox="0 0 24 24"
                    className="absolute inset-0 h-full w-full"
                    aria-hidden="true"
                  >
                    <path
                      d="M7.5 8 16.5 17M16.5 8 7.5 17"
                      stroke="var(--color-alert)"
                      strokeWidth="2.4"
                      strokeLinecap="round"
                    />
                  </svg>
                ) : null}
              </span>
            );
          })}
        </div>
      </div>

    </div>
  );
}

/**
 * The tally is drawn on the day itself rather than in a counter underneath, so
 * the marks accumulate where the time is being spent.
 *
 * It runs in the usual groups of five: day one gets one upright, day two two,
 * up to the fifth, which closes the group with the diagonal. The sixth starts
 * the next group. A running total in a single cell would need fifteen strokes
 * by the end of the scene, and no cell this size can hold that.
 */
function Tally({ marks }: { marks: number }) {
  const closed = marks === 5;
  const uprights = Math.min(4, marks);

  return (
    <svg
      viewBox="0 0 24 24"
      className="absolute inset-0 h-full w-full"
      fill="none"
      aria-hidden="true"
    >
      {Array.from({ length: uprights }).map((_, i) => (
        <path
          key={i}
          d={`M${5.5 + i * 4.4} 9.5v11`}
          stroke="var(--color-ink-800)"
          strokeWidth="1.7"
          strokeLinecap="round"
          style={{ animation: "bubble-in .25s var(--ease-out-soft) both" }}
        />
      ))}
      {closed ? (
        // Blue, not alert red: red is reserved for the deadline cell, and with
        // a closing stroke every fifth day it would stop meaning anything.
        <path
          d="M3.4 21 21 9"
          stroke="var(--color-brand-600)"
          strokeWidth="1.7"
          strokeLinecap="round"
          style={{ animation: "bubble-in .3s var(--ease-out-soft) both" }}
        />
      ) : null}
    </svg>
  );
}

/* ------------------------------------------------------------- lockscreen */

const TONE_COLOR = {
  ok: "var(--color-ok)",
  warn: "var(--color-warn)",
  alert: "var(--color-alert)",
} as const;

function Lockscreen({
  tone,
  title,
  body,
}: {
  tone: "ok" | "warn" | "alert";
  title: string;
  body: string;
}) {
  return (
    <div className="relative -m-2.5 flex h-[calc(100%+1.25rem)] flex-col items-center overflow-hidden rounded-[1.15rem] bg-ink-950 p-2.5 pt-5">
      {/* wallpaper wash, tinted by severity */}
      <div
        aria-hidden="true"
        className="absolute inset-0 opacity-40"
        style={{
          background: `radial-gradient(120% 70% at 50% 0%, ${TONE_COLOR[tone]}55, transparent 70%)`,
        }}
      />

      <div className="relative flex flex-col items-center">
        <span className="text-[0.55rem] font-medium text-white/70">
          Friday 14 November
        </span>
        <span className="font-display text-[1.9rem] font-extrabold leading-none text-white">
          9:41
        </span>
      </div>

      <div
        className="relative mt-4 w-full rounded-[0.7rem] bg-white/14 p-2 backdrop-blur"
        style={{ animation: "bubble-in .45s var(--ease-out-soft) both" }}
      >
        <span className="flex items-center gap-1.5">
          <span
            className="grid h-3.5 w-3.5 place-items-center rounded-[0.25rem]"
            style={{ background: TONE_COLOR[tone] }}
          >
            <span className="h-1 w-1 rounded-full bg-white" />
          </span>
          <span className="text-[0.48rem] font-semibold uppercase tracking-[0.1em] text-white/70">
            Classistant
          </span>
        </span>
        <p className="mt-1 text-[0.58rem] font-bold leading-tight text-white">
          {title}
        </p>
        <p className="mt-0.5 text-[0.55rem] leading-[1.35] text-white/75">
          {body}
        </p>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------- call */

function CallScreen({ answered }: { answered: boolean }) {
  return (
    <div className="relative -m-2.5 flex h-[calc(100%+1.25rem)] flex-col items-center justify-between overflow-hidden rounded-[1.15rem] bg-ink-950 px-3 pb-4 pt-6">
      <div
        aria-hidden="true"
        className="absolute inset-0 opacity-45"
        style={{
          background:
            "radial-gradient(120% 70% at 50% 0%, var(--color-alert)55, transparent 70%)",
        }}
      />

      <div className="relative flex flex-col items-center">
        <span className="relative grid h-11 w-11 place-items-center rounded-full bg-gradient-to-b from-[#4C9BFF] to-[#0B63E5]">
          {!answered ? (
            <span
              aria-hidden="true"
              className="absolute inset-0 rounded-full bg-white/25 motion-safe:animate-[pulse-ring_1.5s_ease-out_infinite]"
            />
          ) : null}
          <svg
            width="18"
            height="18"
            viewBox="0 0 48 48"
            fill="none"
            aria-hidden="true"
          >
            <path
              d="M17.4 8.6 Q22 4 26.6 8.6 L34.4 16.4 Q39 21 34.4 25.6 L23.6 36.4 Q22 38 20.4 36.4 L9.6 25.6 Q5 21 9.6 16.4 Z"
              fill="#fff"
            />
            <path
              d="M14.5 18.6H29.5M14.5 25.4H24.5"
              stroke="#0B63E5"
              strokeWidth="3"
              strokeLinecap="round"
            />
          </svg>
        </span>
        <p className="mt-2 text-[0.68rem] font-bold text-white">Classistant</p>
        <p className="text-[0.52rem] text-white/60">
          {answered ? "0:04" : "Incoming call"}
        </p>

        {answered ? (
          <p
            className="mt-3 rounded-[0.7rem] bg-white/14 px-2.5 py-2 text-center text-[0.56rem] font-medium leading-[1.45] text-white backdrop-blur"
            style={{ animation: "bubble-in .5s var(--ease-out-soft) both" }}
          >
            &ldquo;This is the last time to start the assignment if you plan to
            finish on time.&rdquo;
          </p>
        ) : null}
      </div>

      <div className="relative flex w-full items-center justify-around">
        <span className="grid h-8 w-8 place-items-center rounded-full bg-[var(--color-alert)]">
          <span className="rotate-[134deg]">
            <PhoneGlyph />
          </span>
        </span>
        {!answered ? (
          <span className="grid h-8 w-8 place-items-center rounded-full bg-[var(--color-ok)] motion-safe:animate-[float-slow_1.3s_ease-in-out_infinite]">
            <PhoneGlyph />
          </span>
        ) : null}
      </div>
    </div>
  );
}

function PhoneGlyph() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M7.2 3.8 9.4 8 7.6 9.9a11 11 0 0 0 5 5l1.9-1.8 4.2 2.2-.5 2.6a2 2 0 0 1-2.2 1.6C9.4 18.8 5 14.4 4 6.5a2 2 0 0 1 1.6-2.2l1.6-.5Z"
        fill="#fff"
      />
    </svg>
  );
}
