import type { ReactNode } from "react";
import { LogoMark } from "@/components/brand/LogoMark";
import { Container, Section, SectionHeading } from "@/components/ui/primitives";
import { Reveal } from "@/components/ui/Reveal";
import * as A from "@/components/landing/featureArt";
import { cn } from "@/lib/cn";

/**
 * The feature recap, built the way Apple closes a keynote.
 *
 *  - **Light.** Soft grey tiles on white. The tiles recede and the words carry.
 *  - **Names, not descriptions.** Every tile is an icon and a feature name. If
 *    a feature needs a sentence, it is not recap material.
 *  - **Every tile carries its own small scene.** Not an icon: a scrap of the
 *    actual product. A room number changing, a 35% weighting, a 3:12am
 *    timestamp, a red bubble with the final warning in it. An outline glyph
 *    beside a feature name repeats the name and adds nothing, and twenty of
 *    them read as filler, which is what the icon pass looked like.
 *  - **Tight.** 8px gutters, so the wall reads as one object.
 *  - **A little colour.** Three names put one word in colour, and a few icons
 *    take a functional hue where the meaning calls for it.
 *
 * The brand plate is explicitly placed at the dead centre of the grid on large
 * screens, the way the OS tile anchors Apple's: rows 4-5 of eight, columns 3-4
 * of six. Everything else is auto-placed with `grid-auto-flow: dense` and flows
 * around it.
 *
 * Sizes sum to 48 cells, exactly eight rows of six. Pinning the plate changes
 * how the rest packs, so the count had to grow from 42; land on anything else
 * and dense flow leaves holes around the anchor.
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

/** Icon over a name. The bulk of the wall. */
function Name({
  children,
  art,
  col = 1,
  size = "sm",
}: Span & {
  children: ReactNode;
  art: ReactNode;
  size?: "sm" | "md";
}) {
  return (
    <Tile col={col}>
      <span className="mb-2 flex min-h-[2.4rem] items-center justify-center">{art}</span>
      <p
        className={cn(
          "font-display font-bold leading-[1.15] text-ink-900",
          size === "md" ? "text-[1rem] sm:text-[1.12rem]" : "text-[0.84rem] sm:text-[0.92rem]",
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
            title={<>We&rsquo;re in a class of our own</>}
            lead="One job, start of term to final grades."
          />
        </Reveal>

        <Reveal delay={80}>
          <div className="mt-12 grid auto-rows-[7.4rem] grid-cols-2 gap-2 sm:auto-rows-[7.8rem] sm:grid-cols-4 lg:grid-cols-6">
            {/* Anchored dead centre on lg: rows 3-4, columns 3-4 of a 6x7 grid. */}
            <Tile
              col={2}
              row={2}
              className="bg-gradient-to-br from-brand-500 to-ink-800 lg:col-start-3 lg:row-start-4"
            >
              <LogoMark size={38} tone="white" />
              <p className="mt-3 font-display text-[1.3rem] font-extrabold leading-none text-white sm:text-[1.5rem]">
                Classistant
              </p>
              <p className="mt-1.5 text-[0.72rem] font-medium text-white/70">One number, all term</p>
            </Tile>

            <Tile col={1} row={3} className="justify-between p-2.5">
              <PhoneMock />
              <p className="pb-1 font-display text-[0.84rem] font-bold text-ink-900">It calls you</p>
            </Tile>

            <Tile col={2} row={2}>
              <MiniCalendar />
              <p className="mt-2.5 font-display text-[0.88rem] font-bold text-ink-900">
                Your whole term, filled in
              </p>
            </Tile>

            <Tile col={1} row={2}>
              <Score />
              <p className="mt-2 font-display text-[0.84rem] font-bold text-ink-900">Grade alerts</p>
            </Tile>

            <Tile col={2} row={2}>
              <Notification />
              <p className="mt-2.5 font-display text-[0.88rem] font-bold text-ink-900">
                It gets louder on purpose
              </p>
            </Tile>

            <Name col={2} size="md" art={<A.ArtSyllabus />}>
              Syllabus <span className="text-brand-600">parsing</span>
            </Name>
            <Name art={<A.ArtExam />}>Exam dates</Name>
            <Name art={<A.ArtLab />}>Lab times</Name>
            <Name art={<A.ArtRoom />}>Room changes</Name>

            <Name col={2} size="md" art={<A.ArtFinalWarning />}>
              <span className="text-[var(--color-alert)]">Final</span> warnings
            </Name>
            <Name art={<A.ArtGradeHistory />}>Grade history</Name>
            <Name art={<A.ArtDraft />}>Email drafts</Name>

            <Name art={<A.ArtPdf />}>Reads PDFs</Name>
            <Name art={<A.ArtQuietHours />}>
              Quiet hours
            </Name>
            <Name art={<A.ArtDigest />}>Weekly digest</Name>
            <Name art={<A.ArtFiles />}>Course files</Name>

            <Name col={2} size="md" art={<A.ArtOvernight />}>
              Works while you <span className="text-brand-600">sleep</span>
            </Name>
            <Name art={<A.ArtStudyBlock />}>Study blocks</Name>
            <Name art={<A.ArtTimezone />}>Timezone aware</Name>

            <Name col={2} size="md" art={<A.ArtOfficeHours />}>
              Books office hours
            </Name>
            <Name art={<A.ArtGroup />}>Group chasing</Name>
            <Name art={<A.ArtCancelled />}>
              Cancelled classes
            </Name>

            <Name col={2} size="md" art={<A.ArtRank />}>
              Ranks what to do next
            </Name>
            <Name art={<A.ArtPlatforms />}>iOS and Android</Name>
            <Name art={<A.ArtStop />}>
              One text to stop
            </Name>
            <Name art={<A.ArtWeighting />}>Knows the weighting</Name>
            <Name art={<A.ArtRecheck />}>Re-checks dates</Name>
            <Name art={<A.ArtThreads />}>Summarises threads</Name>
            <Name art={<A.ArtAnnounce />}>Announcements</Name>
            <Name art={<A.ArtCountdown />}>Deadline countdown</Name>
            <Name art={<A.ArtProtect />}>
              Protects your time
            </Name>
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
  const marks: Record<number, string> = {
    4: "var(--color-brand-600)",
    9: "var(--color-brand-600)",
    13: "var(--color-alert)",
    18: "var(--color-brand-600)",
    24: "var(--color-alert)",
  };
  return (
    <svg viewBox="0 0 104 44" className="w-full max-w-[9rem]" aria-hidden="true">
      {Array.from({ length: 28 }).map((_, i) => (
        <rect
          key={i}
          x={(i % 7) * 15}
          y={Math.floor(i / 7) * 11}
          width="12"
          height="8"
          rx="2"
          fill={marks[i] ?? "#fff"}
        />
      ))}
    </svg>
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
  const rows = [
    { tone: "var(--color-ok)", w: 74 },
    { tone: "var(--color-warn)", w: 88 },
    { tone: "var(--color-alert)", w: 102 },
  ];
  return (
    <svg viewBox="0 0 104 44" className="w-full max-w-[10rem]" aria-hidden="true">
      {rows.map((row, i) => (
        <g key={row.tone}>
          <rect x="0" y={i * 15} width={row.w} height="12" rx="4" fill="#fff" />
          <rect x="4" y={i * 15 + 3.5} width="5" height="5" rx="1.4" fill={row.tone} />
          <rect x="13" y={i * 15 + 5} width={row.w - 20} height="2" rx="1" fill="var(--color-line)" />
        </g>
      ))}
    </svg>
  );
}
