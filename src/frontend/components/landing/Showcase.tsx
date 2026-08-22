import type { ReactNode } from "react";
import { Container, Section } from "@/components/ui/primitives";
import { Reveal } from "@/components/ui/Reveal";
import { SyllabusScene } from "@/components/landing/SyllabusScene";
import { InboxScene } from "@/components/landing/InboxScene";
import { EscalationScene } from "@/components/landing/EscalationScene";
import { cn } from "@/lib/cn";

type Row = {
  /** List key, since a title can now carry markup and is not a usable one. */
  key: string;
  /** Omit to let the headline stand on its own. */
  label?: string;
  title: ReactNode;
  points: string[];
  /** Every row is a purpose-built animated scene now. */
  scene: "syllabus" | "inbox" | "escalation";
  flip?: boolean;
};

// No prose paragraphs here on purpose. The screenshot carries the explanation
// and the four points carry the detail. See docs/design/02-design-system.md.
const ROWS: Row[] = [
  {
    key: "syllabus",
    title: "Fast and Curious",
    points: [
      "Assignment and project deadlines",
      "Midterm, final, and lab dates",
      "Weekly lectures and tutorials",
      "Weighting, so it knows what matters",
    ],
    scene: "syllabus",
  },
  {
    key: "inbox",
    title: (
      <>
        Ignore your <UnreadMail count="6967" /> inbox
      </>
    ),
    points: [
      "Flags cancelled classes and room changes",
      "Summarises long announcement threads",
      "Drafts replies, sends once you approve",
      "Books office hours with your prof",
    ],
    scene: "inbox",
    flip: true,
  },
  {
    key: "escalation",
    title: "It gets louder on purpose",
    points: [
      "A quiet nudge while there is still time",
      "A real reminder once you have not started",
      "A final warning at the last useful moment",
      "Then your phone actually rings",
    ],
    scene: "escalation",
  },
];

export function Showcase() {
  return (
    // The step cards above end on a hard card edge and the paper-to-white
    // change lands mid-gap, so a gap that measures the same as the one between
    // rows still read as tighter than it: normal top padding buys it back.
    // loose at the bottom because the last row ends on a full-height scene and
    // the section after it starts on a heading with no visual of its own, so
    // the break between them has to out-measure the gap between rows.
    <Section padTop="normal" padBottom="loose">
      <Container>
        <div className="flex flex-col gap-24 sm:gap-32">
          {ROWS.map((row, i) => (
            <div
              key={row.key}
              className="grid items-center gap-10 lg:grid-cols-2 lg:gap-16"
            >
              <Reveal className={cn(row.flip && "lg:order-2")}>
                {row.label ? (
                  <p className="mb-3 text-[0.8rem] font-semibold uppercase tracking-[0.16em] text-brand-600">
                    {row.label}
                  </p>
                ) : null}
                <h2 className="text-[2.15rem] font-extrabold leading-[1.08] text-ink-900 sm:text-[2.7rem]">
                  {row.title}
                </h2>
                <ul className="mt-7 flex flex-col gap-3">
                  {row.points.map((point) => (
                    <li key={point} className="flex items-start gap-3 text-[0.95rem] text-ink-800">
                      <TickIcon />
                      {point}
                    </li>
                  ))}
                </ul>
              </Reveal>

              <Reveal delay={100} className={cn(row.flip && "lg:order-1")}>
                {row.scene === "syllabus" ? (
                  <SyllabusScene />
                ) : row.scene === "inbox" ? (
                  <InboxScene />
                ) : (
                  <EscalationScene />
                )}
              </Reveal>
            </div>
          ))}
        </div>
      </Container>
    </Section>
  );
}

/**
 * A mailbox sitting in the headline with its unread count on it.
 *
 * Sized in `em` throughout so it tracks the headline across the breakpoint
 * instead of needing a second set of numbers. Red is the one non-blue in the
 * palette and is functional only, which a real unread badge is: it is the
 * number the reader is being asked to recognise, not decoration.
 */
function UnreadMail({ count }: { count: string }) {
  return (
    // The right margin is clearance for the badge, which overhangs the icon.
    <span className="relative mr-[0.45em] inline-block whitespace-nowrap align-[-0.12em]">
      <svg
        viewBox="0 0 32 24"
        fill="none"
        aria-hidden="true"
        className="block h-[0.82em] w-[1.09em]"
      >
        <rect
          x="1.4"
          y="1.4"
          width="29.2"
          height="21.2"
          rx="4"
          fill="var(--color-sky-100)"
          stroke="var(--color-ink-900)"
          strokeWidth="2.4"
        />
        <path
          d="M3.6 4.6 16 13.6 28.4 4.6"
          stroke="var(--color-ink-900)"
          strokeWidth="2.4"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      <span
        className="absolute -right-[0.5em] -top-[0.34em] rounded-full bg-alert px-[0.34em] py-[0.06em] font-sans text-[0.31em] font-bold leading-[1.45] tabular-nums text-white ring-[0.14em] ring-white"
      >
        {count}
      </span>
    </span>
  );
}

function TickIcon() {
  return (
    <svg
      width="19"
      height="19"
      viewBox="0 0 20 20"
      fill="none"
      aria-hidden="true"
      className="mt-0.5 shrink-0"
    >
      <rect width="20" height="20" rx="6" fill="var(--color-sky-100)" />
      <path
        d="M5.8 10.2 8.2 12.6 14 6.9"
        stroke="var(--color-brand-600)"
        strokeWidth="1.9"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
