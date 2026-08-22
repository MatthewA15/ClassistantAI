import type { ReactNode } from "react";
import { Container, Section, SectionHeading } from "@/components/ui/primitives";
import { Reveal } from "@/components/ui/Reveal";
import { cn } from "@/lib/cn";

/**
 * The feature recap, built like the end of a keynote rather than a feature grid.
 *
 * The brief was "full". Three things do that here, and all three are the
 * opposite of what a tidy marketing grid does:
 *
 *  - **Dark.** It opens the dark run that carries the page home: this wall,
 *    the escalation ladder, then the closing CTA. Tiles glow off it, and the
 *    section reads as a finale rather than another band of cards.
 *  - **Dense.** Small gaps and a short row height, so tiles nearly touch. The
 *    abundance IS the message: there is more here than you can read at once.
 *  - **Uneven.** Four tile sizes, so the grade alert and "quiet hours" are
 *    visibly not the same size of idea. A uniform grid flattens everything to
 *    equal importance, which is exactly the feeling to avoid.
 *
 * It closes on a wrap of plain chips, which is the "and also" slide.
 *
 * Tile count is deliberate: sizes sum to 28 grid cells, which is exactly seven
 * full rows of four. Land on a non-multiple and `grid-auto-flow: dense` leaves
 * a visible hole in the last row. Add or remove tiles in matching pairs.
 */

type Size = "sm" | "wide" | "tall" | "big";
type Tone = "panel" | "brand" | "glass" | "light";

const SPAN: Record<Size, string> = {
  sm: "col-span-1 row-span-1",
  wide: "col-span-2 row-span-1",
  tall: "col-span-1 row-span-2",
  big: "col-span-2 row-span-2",
};

const TONE: Record<Tone, string> = {
  panel: "bg-ink-800 ring-1 ring-ink-700",
  brand: "bg-brand-600",
  glass: "bg-white/8 ring-1 ring-white/12 backdrop-blur",
  light: "bg-white",
};

function Tile({
  size,
  tone = "panel",
  title,
  body,
  art,
  children,
}: {
  size: Size;
  tone?: Tone;
  title: string;
  body?: string;
  art?: ReactNode;
  children?: ReactNode;
}) {
  const dark = tone !== "light";
  return (
    <article
      className={cn(
        "group relative flex flex-col overflow-hidden rounded-[1.35rem] p-4 transition-transform duration-400 ease-[cubic-bezier(0.22,1,0.36,1)] hover:-translate-y-1 sm:rounded-[1.6rem] sm:p-5",
        SPAN[size],
        TONE[tone],
      )}
    >
      {art ? <div aria-hidden="true" className="pointer-events-none absolute inset-0">{art}</div> : null}

      <div className="relative flex h-full flex-col">
        {/* Colour set on the heading itself: the base stylesheet gives every h3
            an ink colour, so text-white on the tile cannot be inherited. */}
        <h3
          className={cn(
            "font-display font-bold leading-[1.14]",
            size === "big" ? "text-[1.3rem] sm:text-[1.55rem]" : "text-[0.98rem]",
            dark ? "text-white" : "text-ink-900",
          )}
        >
          {title}
        </h3>
        {body ? (
          <p
            className={cn(
              "mt-1.5 text-[0.82rem] leading-[1.45]",
              dark ? "text-sky-200/75" : "text-body",
            )}
          >
            {body}
          </p>
        ) : null}
        {children ? <div className="mt-auto pt-4">{children}</div> : null}
      </div>
    </article>
  );
}

/** The "and also" slide. Short enough to scan, long enough to feel bottomless. */
const CHIPS = [
  "Knows what each item is worth",
  "Re-checks for changed dates",
  "Protects your off-limits hours",
  "Summarises long threads",
  "Flags cancelled classes",
  "Room changes",
  "Weekly digest",
  "Timezone aware",
  "Works on iOS and Android",
  "Turn it off with one text",
];

export function Features() {
  return (
    <Section id="features" tone="ink" className="relative overflow-hidden">
      <Backdrop />
      <Container className="relative">
        <Reveal>
          <SectionHeading
            tone="ink"
            label="The full list"
            title="Everything it handles"
            lead="One job, start of term to final grades."
          />
        </Reveal>

        <Reveal delay={80}>
          <div className="mt-12 grid auto-rows-[8.5rem] grid-cols-2 gap-2.5 [grid-auto-flow:dense] sm:gap-3 lg:grid-cols-4">
            <Tile size="big" tone="brand" title="It tells you your grade before you think to check" art={<Glow />}>
              <div className="flex items-end gap-4">
                <ScoreRing value={78} />
                <p className="mb-1 max-w-[13rem] rounded-2xl rounded-bl-md bg-white/15 px-3 py-2 text-[0.76rem] leading-[1.4] text-white">
                  Prof. Adeyemi just posted the midterm. You got 78.
                </p>
              </div>
            </Tile>

            <Tile size="wide" title="Reads every syllabus" body="The term is planned before week one.">
              <DateChips />
            </Tile>

            <Tile size="sm" tone="glass" title="Pulls your profile" body="Courses, times, rooms, marks." />
            <Tile size="sm" title="Grabs course content" body="Slides, readings, files." />

            <Tile size="wide" tone="light" title="Due dates land on your calendar" body="With the weighting attached.">
              <CalendarStrip />
            </Tile>

            <Tile size="sm" title="Exams and schedules" body="Corrected when the school moves them." />

            <Tile size="tall" tone="glass" title="Paced to you" body="It learns how long you actually take.">
              <PaceBars />
            </Tile>

            <Tile
              size="big"
              tone="light"
              title="Ignore the last warning and your phone rings"
              body="A real call, from a voice that will not let you scroll past it."
              art={<Rings />}
            >
              <span className="inline-flex items-center gap-2 rounded-full bg-ink-900 px-3.5 py-1.5 text-[0.76rem] font-semibold text-white">
                <span className="h-1.5 w-1.5 rounded-full bg-accent motion-safe:animate-blink" />
                Calling now
              </span>
            </Tile>

            <Tile size="wide" title="Writes emails for you" body="You approve, it sends.">
              <Draft />
            </Tile>

            <Tile size="wide" tone="glass" title="Books office hours" body="Emails your prof, adds the meeting.">
              <Slots />
            </Tile>

            <Tile size="sm" title="Watches your email" body="Only what changes your week." />

            <Tile size="wide" title="Ranks what is next" body="By weight and runway, not just date.">
              <RankBars />
            </Tile>

            <Tile size="sm" tone="glass" title="Quiet hours" body="Nothing lands while you sleep." />
            <Tile size="sm" title="One number" body="No new app to open." />
            <Tile size="sm" title="Reads PDFs" body="Slides and scanned handouts too." />
            <Tile size="sm" tone="glass" title="Chases group projects" body="So you are not the one nagging." />
          </div>
        </Reveal>

        <Reveal delay={140}>
          <div className="mt-8 flex flex-wrap gap-2">
            {CHIPS.map((chip) => (
              <span
                key={chip}
                className="rounded-full bg-white/8 px-3.5 py-1.5 text-[0.82rem] font-medium text-sky-200/85 ring-1 ring-white/10"
              >
                {chip}
              </span>
            ))}
          </div>
        </Reveal>
      </Container>
    </Section>
  );
}

/* --------------------------------------------------------------------- art */

function Backdrop() {
  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0">
      <div className="absolute -left-32 top-0 h-[34rem] w-[34rem] rounded-full bg-brand-600/22 blur-[130px]" />
      <div className="absolute -right-24 bottom-0 h-[30rem] w-[30rem] rounded-full bg-sky-500/12 blur-[130px]" />
    </div>
  );
}

function Glow() {
  return (
    <>
      <div className="absolute -right-10 -top-12 h-48 w-48 rounded-full bg-white/20 blur-[46px]" />
      <div className="absolute -bottom-16 -left-10 h-44 w-44 rounded-full bg-accent/25 blur-[52px]" />
    </>
  );
}

function Rings() {
  return (
    <>
      <div className="absolute -right-8 top-1/2 h-40 w-40 -translate-y-1/2 rounded-full bg-sky-200/60 blur-[40px]" />
      <svg className="absolute -right-6 top-1/2 h-56 w-56 -translate-y-1/2" viewBox="0 0 200 200" fill="none" aria-hidden="true">
        {[38, 58, 78, 98].map((r, i) => (
          <circle
            key={r}
            cx="100"
            cy="100"
            r={r}
            stroke="var(--color-brand-500)"
            strokeWidth="1.4"
            strokeDasharray="3 7"
            opacity={0.5 - i * 0.09}
            style={{
              transformOrigin: "100px 100px",
              animation: `pulse-ring ${5 + i}s var(--ease-out-soft) infinite`,
              animationDelay: `${i * 0.9}s`,
            }}
          />
        ))}
        <circle cx="100" cy="100" r="22" fill="var(--color-brand-600)" />
        <path
          d="M92 90.5 95 96l-2.4 2.4a14 14 0 0 0 6.4 6.4l2.4-2.4 5.5 3-.7 3.4a2.6 2.6 0 0 1-2.8 2.1c-10-1.3-15.7-7-17-17a2.6 2.6 0 0 1 2.1-2.8l3.5-.6Z"
          fill="#fff"
        />
      </svg>
    </>
  );
}

function ScoreRing({ value }: { value: number }) {
  const r = 26;
  const c = 2 * Math.PI * r;
  return (
    <span className="relative grid h-[4.4rem] w-[4.4rem] shrink-0 place-items-center">
      <svg className="absolute inset-0 -rotate-90" viewBox="0 0 64 64" aria-hidden="true">
        <circle cx="32" cy="32" r={r} stroke="#fff" strokeOpacity="0.25" strokeWidth="6" fill="none" />
        <circle
          cx="32"
          cy="32"
          r={r}
          stroke="var(--color-accent)"
          strokeWidth="6"
          strokeLinecap="round"
          fill="none"
          strokeDasharray={`${c * (value / 100)} ${c}`}
        />
      </svg>
      <span className="font-display text-[1.3rem] font-extrabold text-white">{value}</span>
    </span>
  );
}

function DateChips() {
  return (
    <div className="flex items-center gap-2.5">
      <span className="flex w-[4rem] shrink-0 flex-col gap-1 rounded-lg bg-white/10 p-2">
        {[90, 70, 82, 55].map((w, i) => (
          <span key={i} className="block h-1 rounded-full bg-white/35" style={{ width: `${w}%` }} />
        ))}
      </span>
      <svg width="16" height="12" viewBox="0 0 18 12" fill="none" aria-hidden="true" className="shrink-0">
        <path d="M0 6h15m0 0-4-4m4 4-4 4" stroke="var(--color-sky-400)" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      <span className="flex gap-1.5">
        {["12", "19", "26"].map((d, i) => (
          <span
            key={d}
            className="grid h-8 w-8 place-items-center rounded-lg bg-brand-500 text-[0.7rem] font-bold text-white"
            style={{ animation: "bubble-in .5s var(--ease-out-soft) both", animationDelay: `${i * 120}ms` }}
          >
            {d}
          </span>
        ))}
      </span>
    </div>
  );
}

function CalendarStrip() {
  const marks = [2, 5, 6, 11, 15, 18, 19, 24];
  return (
    <div className="grid grid-cols-7 gap-1">
      {Array.from({ length: 28 }).map((_, i) => (
        <span
          key={i}
          className={cn(
            "h-3 rounded-[0.28rem]",
            marks.includes(i) ? (i % 3 === 0 ? "bg-accent" : "bg-brand-600") : "bg-line-soft",
          )}
          style={
            marks.includes(i)
              ? { animation: "bubble-in .45s var(--ease-out-soft) both", animationDelay: `${i * 22}ms` }
              : undefined
          }
        />
      ))}
    </div>
  );
}

function PaceBars() {
  return (
    <div className="flex items-end gap-1.5">
      {[34, 52, 44, 70, 88, 62].map((h, i) => (
        <span
          key={i}
          className="w-full rounded-t-md bg-sky-400/60"
          style={{
            height: `${h * 0.5}px`,
            animation: "bubble-in .55s var(--ease-out-soft) both",
            animationDelay: `${i * 90}ms`,
          }}
        />
      ))}
    </div>
  );
}

function Draft() {
  return (
    <div className="flex items-center gap-3">
      <span className="flex flex-1 flex-col gap-1.5 rounded-lg bg-white/10 p-2.5">
        {[88, 96, 62].map((w, i) => (
          <span key={i} className="block h-1.5 rounded-full bg-white/30" style={{ width: `${w}%` }} />
        ))}
      </span>
      <span className="shrink-0 rounded-full bg-brand-500 px-3 py-1.5 text-[0.72rem] font-semibold text-white">
        Approve
      </span>
    </div>
  );
}

function Slots() {
  return (
    <div className="flex gap-1.5">
      {["Tue 2:00", "Tue 3:30", "Thu 11:00"].map((slot, i) => (
        <span
          key={slot}
          className={cn(
            "rounded-lg px-2.5 py-1.5 text-[0.7rem] font-semibold",
            i === 1 ? "bg-brand-500 text-white" : "bg-white/10 text-sky-200",
          )}
        >
          {slot}
        </span>
      ))}
    </div>
  );
}

function RankBars() {
  return (
    <div className="flex flex-col gap-1.5">
      {[
        { w: "92%", label: "35%" },
        { w: "64%", label: "20%" },
        { w: "38%", label: "5%" },
      ].map((row, i) => (
        <span key={i} className="flex items-center gap-2">
          <span className="h-2 flex-1 overflow-hidden rounded-full bg-white/12">
            <span
              className="block h-full rounded-full bg-sky-400"
              style={{ width: row.w, animation: "bubble-in .6s var(--ease-out-soft) both", animationDelay: `${i * 110}ms` }}
            />
          </span>
          <span className="w-8 shrink-0 text-right text-[0.68rem] font-semibold text-sky-200/70">{row.label}</span>
        </span>
      ))}
    </div>
  );
}
