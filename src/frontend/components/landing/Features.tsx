import type { ReactNode } from "react";
import { LogoMark } from "@/components/brand/LogoMark";
import { Container, Section, SectionHeading } from "@/components/ui/primitives";
import { Reveal } from "@/components/ui/Reveal";
import { cn } from "@/lib/cn";

/**
 * The feature recap, built the way Apple closes a keynote.
 *
 * The first attempt got this wrong: it went dark and gave every tile a title
 * plus a sentence of explanation. That is a feature grid wearing a dark theme.
 * The actual pattern is:
 *
 *  - **Light.** Soft grey tiles on white. The tiles recede and the words carry.
 *  - **Names, not descriptions.** Almost every tile is a single feature name in
 *    bold, centred. If a feature needs a sentence, it is not recap material.
 *  - **Mostly small, a few big.** Twenty little tiles around five that hold a
 *    real visual. The little ones create the density; the big ones stop the
 *    wall reading as a word cloud.
 *  - **Tight.** 8px gutters, so tiles nearly touch and the wall reads as one
 *    object rather than a set of cards.
 *  - **A little colour.** Three tiles put one word in colour. Uniform black
 *    would be flat; colouring everything would be noise.
 *
 * Tile sizes sum to 42 cells, exactly seven rows of six. Land on a non-multiple
 * and `grid-auto-flow: dense` leaves a hole in the last row.
 */

type Span = { col?: 1 | 2; row?: 1 | 2 | 3 };

const COL: Record<number, string> = { 1: "col-span-1", 2: "col-span-2" };
const ROW: Record<number, string> = { 1: "row-span-1", 2: "row-span-2", 3: "row-span-3" };

function Tile({
  col = 1,
  row = 1,
  className,
  children,
}: Span & { className?: string; children: ReactNode }) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center overflow-hidden rounded-[1.15rem] bg-line-soft p-3 text-center sm:rounded-[1.3rem]",
        COL[col],
        ROW[row],
        className,
      )}
    >
      {children}
    </div>
  );
}

/** A tile that is only a name. The bulk of the wall. */
function Name({
  children,
  col = 1,
  row = 1,
  size = "sm",
}: Span & { children: ReactNode; size?: "sm" | "md" }) {
  return (
    <Tile col={col} row={row}>
      <p
        className={cn(
          "font-display font-bold leading-[1.15] text-ink-900",
          size === "md" ? "text-[1.05rem] sm:text-[1.2rem]" : "text-[0.88rem] sm:text-[0.96rem]",
        )}
      >
        {children}
      </p>
    </Tile>
  );
}

export function Features() {
  return (
    <Section id="features">
      <Container>
        <Reveal>
          <SectionHeading
            label="The full list"
            title="Everything it handles"
            lead="One job, start of term to final grades."
          />
        </Reveal>

        <Reveal delay={80}>
          <div className="mt-12 grid auto-rows-[5.2rem] grid-cols-2 gap-2 sm:auto-rows-[5.6rem] sm:grid-cols-4 lg:grid-cols-6">
            {/* The centrepiece, their gradient "iOS" tile */}
            <Tile col={2} row={2} className="bg-gradient-to-br from-brand-500 to-ink-800">
              <LogoMark size={38} tone="white" />
              <p className="mt-3 font-display text-[1.35rem] font-extrabold leading-none text-white sm:text-[1.55rem]">
                Classistant
              </p>
              <p className="mt-1.5 text-[0.74rem] font-medium text-white/70">One number, all term</p>
            </Tile>

            <Tile col={1} row={3} className="justify-between p-2.5">
              <PhoneMock />
              <p className="pb-1 font-display text-[0.86rem] font-bold text-ink-900">It calls you</p>
            </Tile>

            <Tile col={2} row={2}>
              <MiniCalendar />
              <p className="mt-2.5 font-display text-[0.9rem] font-bold text-ink-900">
                Your whole term, filled in
              </p>
            </Tile>

            <Tile col={1} row={2}>
              <Score />
              <p className="mt-2 font-display text-[0.86rem] font-bold text-ink-900">Grade alerts</p>
            </Tile>

            <Name col={2} size="md">
              Syllabus <span className="text-brand-600">parsing</span>
            </Name>
            <Name>Exam dates</Name>
            <Name>Lab times</Name>
            <Name>Room changes</Name>

            <Name col={2} size="md">
              <span className="text-[var(--color-alert)]">Final</span> warnings
            </Name>
            <Name>Grade history</Name>
            <Name>Email drafts</Name>

            <Tile col={2} row={2}>
              <Notification />
              <p className="mt-2.5 font-display text-[0.9rem] font-bold text-ink-900">
                It gets louder on purpose
              </p>
            </Tile>

            <Name>Reads PDFs</Name>
            <Name>Quiet hours</Name>
            <Name>Weekly digest</Name>
            <Name>Course files</Name>

            <Name col={2} size="md">
              Works while you <span className="text-brand-600">sleep</span>
            </Name>
            <Name>Study blocks</Name>
            <Name>Timezone aware</Name>

            <Name col={2} size="md">
              Books office hours
            </Name>
            <Name>Group chasing</Name>
            <Name>Cancelled classes</Name>

            <Name col={2} size="md">
              Ranks what to do next
            </Name>
            <Name>iOS and Android</Name>
            <Name>One text to stop</Name>
          </div>
        </Reveal>
      </Container>
    </Section>
  );
}

/* ------------------------------------------------------------------ mocks */

function PhoneMock() {
  return (
    <div className="mt-1 w-full max-w-[5.2rem] rounded-[0.75rem] bg-ink-950 p-[0.18rem] shadow-soft">
      <div className="flex flex-col gap-1 rounded-[0.62rem] bg-white p-1.5">
        <span className="mx-auto h-0.5 w-4 rounded-full bg-ink-900/20" />
        <span className="grid h-6 w-6 place-self-center place-items-center rounded-full bg-gradient-to-b from-[#4C9BFF] to-[#0B63E5]">
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path
              d="M7.2 3.8 9.4 8 7.6 9.9a11 11 0 0 0 5 5l1.9-1.8 4.2 2.2-.5 2.6a2 2 0 0 1-2.2 1.6C9.4 18.8 5 14.4 4 6.5a2 2 0 0 1 1.6-2.2l1.6-.5Z"
              fill="#fff"
            />
          </svg>
        </span>
        <span className="text-center text-[0.4rem] font-bold text-ink-900">Classistant</span>
        <span className="flex justify-center gap-1.5 pb-0.5">
          <span className="h-3 w-3 rounded-full bg-[var(--color-alert)]" />
          <span className="h-3 w-3 rounded-full bg-[var(--color-ok)]" />
        </span>
      </div>
    </div>
  );
}

function MiniCalendar() {
  const marks: Record<number, "brand" | "alert"> = {
    4: "brand",
    9: "brand",
    13: "alert",
    18: "brand",
    24: "alert",
  };
  return (
    <div className="grid w-full max-w-[9rem] grid-cols-7 gap-[3px]">
      {Array.from({ length: 28 }).map((_, i) => (
        <span
          key={i}
          className={cn(
            "aspect-square rounded-[0.2rem]",
            marks[i] === "brand"
              ? "bg-brand-600"
              : marks[i] === "alert"
                ? "bg-[var(--color-alert)]"
                : "bg-white",
          )}
        />
      ))}
    </div>
  );
}

function Score() {
  const r = 20;
  const c = 2 * Math.PI * r;
  return (
    <span className="relative grid h-[3.2rem] w-[3.2rem] place-items-center">
      <svg viewBox="0 0 48 48" className="absolute inset-0 -rotate-90" aria-hidden="true">
        <circle cx="24" cy="24" r={r} fill="none" stroke="#fff" strokeWidth="5" />
        <circle
          cx="24"
          cy="24"
          r={r}
          fill="none"
          stroke="var(--color-brand-600)"
          strokeWidth="5"
          strokeLinecap="round"
          strokeDasharray={`${c * 0.78} ${c}`}
        />
      </svg>
      <span className="font-display text-[1rem] font-extrabold text-ink-900">78</span>
    </span>
  );
}

function Notification() {
  return (
    <div className="flex w-full max-w-[10rem] flex-col gap-1">
      {[
        { tone: "var(--color-ok)", w: "72%" },
        { tone: "var(--color-warn)", w: "86%" },
        { tone: "var(--color-alert)", w: "100%" },
      ].map((row) => (
        <span
          key={row.tone}
          className="flex items-center gap-1.5 rounded-[0.5rem] bg-white px-1.5 py-1.5"
          style={{ width: row.w }}
        >
          <span className="h-2.5 w-2.5 shrink-0 rounded-[0.2rem]" style={{ background: row.tone }} />
          <span className="h-1 flex-1 rounded-full bg-ink-900/12" />
        </span>
      ))}
    </div>
  );
}
