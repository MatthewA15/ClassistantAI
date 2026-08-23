"use client";

import { LogoPlate } from "@/components/brand/LogoMark";
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
 * green, then amber, then red, and finally the handset rings at day 20, with
 * exactly two tally groups left standing between the last mark and the X.
 *
 * This absorbed a separate escalation section that described the same ladder in
 * four cards of prose. Watching the colour change costs no reading, and the
 * pause between cuts is doing the real work: the pressure is a function of time
 * running out, not of the agent getting impatient.
 *
 * The three notification hues are the one place the palette runs non-blue on
 * purpose. Hue is the only signal a reader decodes without being taught it.
 */

const CYCLE = 18_000;
const TICK = 80;

/**
 * Beat boundaries in ms. Each calendar stretch closes a tally group and feeds
 * the next phone cut.
 *
 * Four stretches, not three. The call has to land with exactly TWO tally groups
 * still standing between the last mark and the X, so it arrives at day 20 of 30
 * with ten days left. An earlier cut rang after three groups, which put the call
 * fifteen days out and made the agent look impatient rather than out of runway.
 */
const B = {
  tally1: 2000, // days 1..5
  green: 3600,
  tally2: 5600, // days 6..10
  amber: 7200,
  tally3: 9200, // days 11..15
  red: 10_800,
  tally4: 12_800, // days 16..20, leaving two groups before the deadline
  ringing: 15_000,
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
  if (t < B.tally4) return "tally";
  if (t < B.ringing) return "ringing";
  return "answered";
}

/**
 * The four calendar stretches, as [from, to] in ms. `viewAt` and `daysAt` both
 * read this, so a stretch cannot be added to one and forgotten in the other.
 * It was: viewAt grew a fourth stretch while daysAt stayed capped at 15, so the
 * last run of days showed the calendar with no new marks appearing on it.
 */
const STRETCHES: ReadonlyArray<readonly [number, number]> = [
  [0, B.tally1],
  [B.green, B.tally2],
  [B.amber, B.tally3],
  [B.red, B.tally4],
];

/** Days struck off so far. Five per completed stretch, prorated inside one. */
function daysAt(t: number): number {
  let days = 0;
  for (const [from, to] of STRETCHES) {
    if (t >= to) {
      days += 5;
      continue;
    }
    if (t >= from) return days + Math.floor(((t - from) / (to - from)) * 5);
    return days;
  }
  return days;
}

/**
 * November 2026 opens on a Sunday, so a weekday falls out of the date with no
 * Date object involved. Hardcoding one weekday per beat would have let the two
 * drift the first time a beat moved.
 */
const WEEKDAYS = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
] as const;

function weekdayOf(day: number) {
  return WEEKDAYS[(day - 1) % 7];
}

/**
 * Each notification carries the clock, not the date: the date it lands on is
 * whatever the calendar just finished counting to, so the two cannot disagree.
 *
 * The times are the point of the ladder as much as the colours are. The first
 * arrives mid-morning on a Thursday, the second on a Tuesday evening, the third
 * before eight on a Sunday, and the call on the Friday commute. All inside
 * waking hours, because quiet hours are a promise the product makes elsewhere
 * and a 3am screenshot would contradict it.
 */
const NOTES = {
  green: {
    tone: "ok" as const,
    time: "9:41",
    meridiem: "AM",
    title: "PSYC 258 essay posted",
    body: "Due Monday the 30th. Plenty of time.",
  },
  amber: {
    tone: "warn" as const,
    time: "6:12",
    meridiem: "PM",
    title: "Still not started",
    body: "Twenty days out, about 6 hours of work.",
  },
  red: {
    tone: "alert" as const,
    time: "7:58",
    meridiem: "AM",
    title: "Final warning",
    body: "Start today or you will not finish on time.",
  },
};

/** The call lands on the Friday evening, ten days out. */
const CALL_TIME = "5:30";

export function EscalationScene() {
  const t = useSceneClock(CYCLE, 16_500, TICK);
  const view = viewAt(t);
  const days = daysAt(t);

  return (
    <SceneFrame caption="Same reminder, five days louder each time.">
      <Stage show={view === "tally"}>
        <Calendar days={days} />
      </Stage>

      {/* `days` rather than a date per note: at every phone cut it already holds
          the tally the viewer just watched close, so the lockscreen cannot show
          a date the calendar never reached. */}
      {(["green", "amber", "red"] as const).map((key) => (
        <Stage key={key} show={view === key}>
          <PhoneFrame screen="full">
            <Lockscreen {...NOTES[key]} day={days} />
          </PhoneFrame>
        </Stage>
      ))}

      <Stage show={view === "ringing" || view === "answered"}>
        <PhoneFrame screen="full" time={CALL_TIME}>
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
  day,
  time,
  meridiem,
}: {
  tone: "ok" | "warn" | "alert";
  title: string;
  body: string;
  day: number;
  time: string;
  meridiem: string;
}) {
  return (
    <div className="relative flex h-full flex-col items-center overflow-hidden bg-ink-950 px-2.5 pb-2 pt-7">
      {/* wallpaper wash, tinted by severity */}
      <div
        aria-hidden="true"
        className="absolute inset-0 opacity-40"
        style={{
          background: `radial-gradient(120% 70% at 50% 0%, ${TONE_COLOR[tone]}55, transparent 70%)`,
        }}
      />

      <div className="relative flex flex-col items-center">
        <Padlock />
        <span className="mt-1 text-[0.55rem] font-medium text-white/70">
          {weekdayOf(day)} {day} November
        </span>
        <span className="font-display text-[1.9rem] font-extrabold tabular-nums leading-none text-white">
          {time}
        </span>
      </div>

      {/* Pushed to the foot of the screen, where a phone actually stacks
          notifications, instead of floating under the clock. */}
      <div
        className="relative mt-auto w-full rounded-[0.7rem] bg-white/14 p-2 backdrop-blur"
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
          {/* The one place the meridiem is spelled out. The big clock runs
              bare, the way a phone does, so this is what settles whether 6:12
              was morning or evening. */}
          <span className="ml-auto text-[0.45rem] font-semibold tabular-nums text-white/55">
            {time} {meridiem}
          </span>
        </span>
        <p className="mt-1 text-[0.58rem] font-bold leading-tight text-white">
          {title}
        </p>
        <p className="mt-0.5 text-[0.55rem] leading-[1.35] text-white/75">
          {body}
        </p>
      </div>

      <HomeBar className="mt-2" />
    </div>
  );
}

/** Closed padlock over the clock, the one glyph that says "locked". */
function Padlock() {
  return (
    <svg width="9" height="11" viewBox="0 0 12 15" fill="none" aria-hidden="true">
      <path
        d="M3.4 6.4V4.3a2.6 2.6 0 0 1 5.2 0v2.1"
        stroke="rgb(255 255 255 / 0.55)"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
      <rect x="1.6" y="6.2" width="8.8" height="7.2" rx="1.9" fill="rgb(255 255 255 / 0.55)" />
    </svg>
  );
}

function HomeBar({ className }: { className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={cn("relative h-[0.13rem] w-1/3 shrink-0 rounded-full bg-white/45", className)}
    />
  );
}

/* ------------------------------------------------------------------- call */

function CallScreen({ answered }: { answered: boolean }) {
  return (
    <div className="relative flex h-full flex-col items-center justify-between overflow-hidden bg-ink-950 px-3 pb-3 pt-8">
      <div
        aria-hidden="true"
        className="absolute inset-0 opacity-45"
        style={{
          background:
            "radial-gradient(120% 70% at 50% 0%, var(--color-alert)55, transparent 70%)",
        }}
      />

      <div className="relative flex flex-col items-center">
        {/* White plate: the mark's own hand runs navy-to-blue and would sink
            into this screen's near-black wallpaper. */}
        <span className="relative">
          {!answered ? (
            <span
              aria-hidden="true"
              className="absolute inset-0 rounded-full bg-white/25 motion-safe:animate-[pulse-ring_1.5s_ease-out_infinite]"
            />
          ) : null}
          <LogoPlate size={44} plate="white" className="relative" />
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

      <div className="relative flex w-full flex-col items-center gap-3">
        <div className="flex w-full items-center justify-around">
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
        <HomeBar />
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
