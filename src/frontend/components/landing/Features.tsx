import type { ReactNode } from "react";
import { Container, Section, SectionHeading } from "@/components/ui/primitives";
import { Reveal } from "@/components/ui/Reveal";
import { cn } from "@/lib/cn";

/**
 * The feature wall, built as a pile of home-screen widgets rather than a grid
 * of identical icon cards.
 *
 * A uniform 3-column icon-and-paragraph grid is the single most recognisable
 * generated-landing-page layout there is, and it also flattens everything: the
 * grade alert and "books office hours" get identical visual weight. Widgets in
 * four sizes let the interesting features be big, and each one shows a scrap of
 * the actual thing (a mark, a calendar strip, a draft) instead of a glyph.
 *
 * Art layers are drawn, not photographic. To drop in a real image later, replace
 * the `art` node with a positioned <Image fill> and keep the overlay gradient so
 * foreground text stays legible.
 */

type Size = "sm" | "wide" | "tall" | "big";
type Tone = "light" | "tint" | "brand" | "ink";

const SPAN: Record<Size, string> = {
  sm: "col-span-1 row-span-1",
  wide: "col-span-2 row-span-1",
  tall: "col-span-1 row-span-2",
  big: "col-span-2 row-span-2",
};

const TONE: Record<Tone, string> = {
  light: "bg-white ring-1 ring-line text-ink-900",
  tint: "bg-sky-100 ring-1 ring-sky-200 text-ink-900",
  brand: "bg-brand-600 text-white",
  ink: "bg-ink-900 text-white",
};

function Widget({
  size,
  tone = "light",
  title,
  body,
  art,
  children,
  className,
}: {
  size: Size;
  tone?: Tone;
  title: string;
  body?: string;
  art?: ReactNode;
  children?: ReactNode;
  className?: string;
}) {
  return (
    <article
      className={cn(
        // iOS widget corner. Large radius is most of what sells the metaphor.
        "group relative flex flex-col overflow-hidden rounded-[1.6rem] p-5 shadow-soft transition-transform duration-400 ease-[cubic-bezier(0.22,1,0.36,1)] hover:-translate-y-1 sm:rounded-[1.8rem]",
        SPAN[size],
        TONE[tone],
        className,
      )}
    >
      {art ? <div aria-hidden="true" className="pointer-events-none absolute inset-0">{art}</div> : null}

      <div className="relative flex h-full flex-col">
        {/* Colour must be set on the heading itself. The base stylesheet gives
            every h3 an explicit ink colour, so `text-white` on the card cannot
            be inherited through it, and dark headings vanish on dark tones. */}
        <h3
          className={cn(
            "font-display font-bold leading-[1.15]",
            size === "big" ? "text-[1.4rem] sm:text-[1.65rem]" : "text-[1.02rem]",
            tone === "ink" || tone === "brand" ? "text-white" : "text-ink-900",
          )}
        >
          {title}
        </h3>
        {body ? (
          <p
            className={cn(
              "mt-1.5 text-[0.85rem] leading-[1.45]",
              tone === "ink" || tone === "brand" ? "text-white/70" : "text-body",
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

export function Features() {
  return (
    <Section id="features" tone="paper">
      <Container>
        <Reveal>
          <SectionHeading
            label="The full list"
            title="Everything it handles"
            lead="One job, start of term to final grades."
          />
        </Reveal>

        <Reveal delay={80}>
          <div className="mt-14 grid auto-rows-[9rem] grid-cols-2 gap-3 [grid-auto-flow:dense] sm:gap-4 lg:grid-cols-4">
            <Widget
              size="big"
              tone="ink"
              title="It tells you your grade before you think to check"
              art={<GlowArt />}
            >
              <div className="flex items-end gap-4">
                <ScoreRing value={78} />
                <p className="mb-1 max-w-[13rem] rounded-2xl rounded-bl-md bg-white/12 px-3 py-2 text-[0.78rem] leading-[1.4] text-white/90">
                  Prof. Adeyemi just posted the midterm. You got 78.
                </p>
              </div>
            </Widget>

            <Widget size="wide" title="Reads every syllabus" body="The term is planned before week one.">
              <SyllabusArt />
            </Widget>

            <Widget size="sm" tone="tint" title="Pulls your profile" body="Courses, times, rooms, marks." />

            <Widget size="sm" title="Grabs course content" body="Slides, readings, posted files." />

            <Widget size="wide" title="Due dates land on your calendar" body="With the weighting attached.">
              <CalendarArt />
            </Widget>

            <Widget size="sm" title="Exams and schedules" body="Corrected when the school moves them." />

            <Widget size="tall" tone="brand" title="Paced to you" body="It learns how long you actually take." art={<GlowArt soft />}>
              <PaceArt />
            </Widget>

            <Widget
              size="big"
              title="Ignore the last warning and your phone rings"
              body="A real call, from a voice that will not let you scroll past it."
              art={<RingArt />}
            >
              <span className="inline-flex items-center gap-2 rounded-full bg-ink-900 px-3.5 py-1.5 text-[0.78rem] font-semibold text-white">
                <span className="h-1.5 w-1.5 rounded-full bg-accent motion-safe:animate-blink" />
                Calling now
              </span>
            </Widget>

            <Widget size="wide" tone="tint" title="Writes emails for you" body="You approve, it sends.">
              <DraftArt />
            </Widget>

            <Widget size="wide" title="Books office hours" body="Emails your prof, then adds the meeting.">
              <SlotArt />
            </Widget>

            <Widget size="sm" title="Watches your email" body="Only what changes your week reaches you." />

            <Widget size="wide" title="Ranks what is next" body="By weight and runway, not just by date.">
              <RankArt />
            </Widget>
          </div>
        </Reveal>
      </Container>
    </Section>
  );
}

/* --------------------------------------------------------------------- art */

function GlowArt({ soft = false }: { soft?: boolean }) {
  return (
    <>
      <div
        className={cn(
          "absolute -right-10 -top-12 h-48 w-48 rounded-full blur-[46px]",
          soft ? "bg-white/25" : "bg-brand-500/40",
        )}
      />
      <div className="absolute -bottom-16 -left-10 h-44 w-44 rounded-full bg-accent/20 blur-[52px]" />
      <svg className="absolute inset-0 h-full w-full opacity-[0.14]" aria-hidden="true">
        <defs>
          <pattern id="w-dots" width="14" height="14" patternUnits="userSpaceOnUse">
            <circle cx="1.6" cy="1.6" r="1.1" fill="currentColor" />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#w-dots)" />
      </svg>
    </>
  );
}

function RingArt() {
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
    <span className="relative grid h-[4.6rem] w-[4.6rem] shrink-0 place-items-center">
      <svg className="absolute inset-0 -rotate-90" viewBox="0 0 64 64" aria-hidden="true">
        <circle cx="32" cy="32" r={r} stroke="currentColor" strokeOpacity="0.18" strokeWidth="6" fill="none" />
        <circle
          cx="32"
          cy="32"
          r={r}
          stroke="var(--color-accent)"
          strokeWidth="6"
          strokeLinecap="round"
          fill="none"
          className="draw-line"
          data-shown="true"
          style={{ ["--dash" as string]: `${c}`, strokeDashoffset: c * (1 - value / 100) }}
          strokeDasharray={`${c * (value / 100)} ${c}`}
        />
      </svg>
      <span className="font-display text-[1.35rem] font-extrabold">{value}</span>
    </span>
  );
}

function SyllabusArt() {
  return (
    <div className="flex items-center gap-3">
      <span className="flex w-[4.5rem] shrink-0 flex-col gap-1 rounded-lg bg-sky-50 p-2 ring-1 ring-line-soft">
        {[90, 70, 82, 55].map((w, i) => (
          <span key={i} className="block h-1 rounded-full bg-sky-300" style={{ width: `${w}%` }} />
        ))}
      </span>
      <svg width="18" height="12" viewBox="0 0 18 12" fill="none" aria-hidden="true" className="shrink-0">
        <path d="M0 6h15m0 0-4-4m4 4-4 4" stroke="var(--color-sky-400)" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      <span className="flex gap-1.5">
        {["12", "19", "26"].map((d, i) => (
          <span
            key={d}
            className="grid h-8 w-8 place-items-center rounded-lg bg-brand-600 text-[0.7rem] font-bold text-white"
            style={{ animation: "bubble-in .5s var(--ease-out-soft) both", animationDelay: `${i * 120}ms` }}
          >
            {d}
          </span>
        ))}
      </span>
    </div>
  );
}

function CalendarArt() {
  const marks = [2, 5, 6, 11, 15, 18, 19, 24];
  return (
    <div className="grid grid-cols-7 gap-1">
      {Array.from({ length: 28 }).map((_, i) => (
        <span
          key={i}
          className={cn(
            "h-3.5 rounded-[0.3rem]",
            marks.includes(i) ? "bg-brand-600" : "bg-line-soft",
            marks.includes(i) && i % 3 === 0 && "bg-accent",
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

function PaceArt() {
  return (
    <div className="flex items-end gap-1.5">
      {[34, 52, 44, 70, 88, 62].map((h, i) => (
        <span
          key={i}
          className="w-full rounded-t-md bg-white/35"
          style={{
            height: `${h * 0.55}px`,
            animation: "bubble-in .55s var(--ease-out-soft) both",
            animationDelay: `${i * 90}ms`,
          }}
        />
      ))}
    </div>
  );
}

function DraftArt() {
  return (
    <div className="flex items-center gap-3">
      <span className="flex flex-1 flex-col gap-1.5 rounded-lg bg-white p-2.5 ring-1 ring-line">
        {[88, 96, 62].map((w, i) => (
          <span key={i} className="block h-1.5 rounded-full bg-line" style={{ width: `${w}%` }} />
        ))}
      </span>
      <span className="shrink-0 rounded-full bg-brand-600 px-3 py-1.5 text-[0.72rem] font-semibold text-white">
        Approve
      </span>
    </div>
  );
}

function SlotArt() {
  return (
    <div className="flex gap-1.5">
      {["Tue 2:00", "Tue 3:30", "Thu 11:00"].map((slot, i) => (
        <span
          key={slot}
          className={cn(
            "rounded-lg px-2.5 py-1.5 text-[0.7rem] font-semibold",
            i === 1 ? "bg-brand-600 text-white" : "bg-sky-100 text-ink-800",
          )}
        >
          {slot}
        </span>
      ))}
    </div>
  );
}

function RankArt() {
  return (
    <div className="flex flex-col gap-1.5">
      {[
        { w: "92%", label: "35%" },
        { w: "64%", label: "20%" },
        { w: "38%", label: "5%" },
      ].map((row, i) => (
        <span key={i} className="flex items-center gap-2">
          <span className="h-2 flex-1 overflow-hidden rounded-full bg-line-soft">
            <span
              className="block h-full rounded-full bg-brand-600"
              style={{ width: row.w, animation: "bubble-in .6s var(--ease-out-soft) both", animationDelay: `${i * 110}ms` }}
            />
          </span>
          <span className="w-8 shrink-0 text-right text-[0.68rem] font-semibold text-body-soft">{row.label}</span>
        </span>
      ))}
    </div>
  );
}
