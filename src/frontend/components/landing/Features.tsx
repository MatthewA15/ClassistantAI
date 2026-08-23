import type { ReactNode } from "react";
import { LogoMark, LogoPlate } from "@/components/brand/LogoMark";
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

/**
 * `col`/`row` describe the tile on the wide wall. `mCol`/`mRow` override them on
 * the two-column phone grid, where the wide layout's spans do not survive: a
 * three-row tile becomes a 22rem sliver half a screen wide, which is the shape
 * a phone has the least of. Three rows is capped at two by default.
 *
 * The two sets are emitted as separate base and `sm:` utilities rather than one
 * merged class, because `cn` is a plain joiner and two spans at the same
 * breakpoint would be settled by Tailwind's emission order instead of intent.
 */
type Span = { col?: 1 | 2; row?: 1 | 2 | 3; mCol?: 1 | 2; mRow?: 1 | 2 };

const COL: Record<number, string> = { 1: "col-span-1", 2: "col-span-2" };
const ROW: Record<number, string> = { 1: "row-span-1", 2: "row-span-2" };
const COL_SM: Record<number, string> = { 1: "sm:col-span-1", 2: "sm:col-span-2" };
const ROW_SM: Record<number, string> = {
  1: "sm:row-span-1",
  2: "sm:row-span-2",
  3: "sm:row-span-3",
};

function Tile({
  col = 1,
  row = 1,
  mCol = col,
  mRow = row === 3 ? 2 : row,
  className,
  children,
}: Span & {
  className?: string;
  children: ReactNode;
}) {
  return (
    // Contents are centred, always. A tile whose art should reach the edges of
    // a taller box grows the art with `flex-1` instead, which fills the space
    // rather than pushing two small things apart and leaving a hole between
    // them, which is what spreading the three-row tile did.
    <div
      className={cn(
        "flex flex-col items-center justify-center overflow-hidden rounded-[1.15rem] bg-line-soft p-3 text-center sm:rounded-[1.3rem]",
        COL[mCol],
        ROW[mRow],
        COL_SM[col],
        ROW_SM[row],
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
          {/* grid-flow-row-dense is load-bearing, not a flourish. The plate is
              pinned and half the tiles span two tracks, so with plain sparse
              flow the cursor never backfills: a two-column tile that will not
              fit in the rest of a row starts a new one and leaves the tail of
              the old row empty. On the phone grid that showed up as three dead
              cells (22rem of nothing) beside the tall phone tile. */}
          <div className="mt-12 grid auto-rows-[7.4rem] grid-flow-row-dense grid-cols-2 gap-2 sm:auto-rows-[7.8rem] sm:grid-cols-4 lg:grid-cols-6">
            {/* Anchored dead centre on lg: rows 3-4, columns 3-4 of a 6x7 grid. */}
            {/* One row on phones. At two it is a 15rem slab of gradient with a
                38px mark adrift in the middle of it, which is the single
                loudest thing on the mobile wall and says nothing. */}
            <Tile
              col={2}
              row={2}
              mRow={1}
              className="bg-gradient-to-br from-brand-500 to-ink-800 lg:col-start-3 lg:row-start-4"
            >
              <LogoMark size={38} tone="white" />
              <p className="mt-3 font-display text-[1.3rem] font-extrabold leading-none text-white sm:text-[1.5rem]">
                Classistant
              </p>
            </Tile>

            {/* The phone takes every pixel the tile is not using for its name.
                Capped at a fixed width it left a third of the tallest tile on
                the wall empty, which read as a loading state. */}
            <Tile col={1} row={3}>
              <div className="flex w-full min-h-0 flex-1 items-stretch justify-center pb-2">
                <PhoneMock />
              </div>
              <p className="font-display text-[0.84rem] font-bold text-ink-900">It calls you</p>
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

/**
 * A ringing handset, sized off the tile rather than off a fixed width: height
 * comes from the box, width from the phone's own 1:2 proportions, and
 * `max-w-full` gives way on the narrow phone grid rather than pushing out of
 * the tile.
 *
 * Answer and decline carry the handset glyph instead of being bare colour
 * dots. Two circles alone said "traffic light"; the glyph is what makes the
 * green one an answer button.
 */
function PhoneMock() {
  return (
    <div className="aspect-[1/2] h-full w-auto max-w-full rounded-[0.9rem] bg-ink-950 p-[0.22rem] shadow-soft">
      <div className="flex h-full flex-col items-center rounded-[0.75rem] bg-white px-2 pb-2 pt-1.5">
        <span className="h-[0.15rem] w-5 shrink-0 rounded-full bg-ink-900/20" />

        <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-1">
          <LogoPlate size={34} plate="ink" />
          <span className="mt-0.5 font-display text-[0.62rem] font-bold leading-none text-ink-900">
            Classistant
          </span>
          <span className="text-[0.5rem] leading-none text-body-soft">Incoming call</span>
        </div>

        <span className="flex w-full shrink-0 items-center justify-around">
          <span className="grid h-[1.4rem] w-[1.4rem] place-items-center rounded-full bg-[var(--color-alert)]">
            <span className="rotate-[134deg]">
              <MiniHandset />
            </span>
          </span>
          <span className="grid h-[1.4rem] w-[1.4rem] place-items-center rounded-full bg-[var(--color-ok)]">
            <MiniHandset />
          </span>
        </span>
      </div>
    </div>
  );
}

function MiniHandset() {
  return (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M7.2 3.8 9.4 8 7.6 9.9a11 11 0 0 0 5 5l1.9-1.8 4.2 2.2-.5 2.6a2 2 0 0 1-2.2 1.6C9.4 18.8 5 14.4 4 6.5a2 2 0 0 1 1.6-2.2l1.6-.5Z"
        fill="#fff"
      />
    </svg>
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
    // Near full-bleed on phones. This tile spans both columns there, and a 9rem
    // calendar adrift in a 21rem box reads as a mistake rather than restraint.
    <svg viewBox="0 0 104 44" className="w-full max-w-[17rem] sm:max-w-[9rem]" aria-hidden="true">
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
    <svg viewBox="0 0 104 44" className="w-full max-w-[17rem] sm:max-w-[10rem]" aria-hidden="true">
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
