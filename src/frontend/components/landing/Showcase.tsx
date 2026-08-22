import { Container, Section } from "@/components/ui/primitives";
import { PlaceholderShot } from "@/components/ui/PlaceholderShot";
import { Reveal } from "@/components/ui/Reveal";
import { SyllabusScene } from "@/components/landing/SyllabusScene";
import { InboxScene } from "@/components/landing/InboxScene";
import { cn } from "@/lib/cn";

type Row = {
  /** Omit to let the headline stand on its own. */
  label?: string;
  title: string;
  points: string[];
  /** Either a screenshot placeholder or a purpose-built animated scene. */
  shot?: { variant: "syllabus" | "inbox" | "calendar"; title: string };
  scene?: "syllabus" | "inbox";
  flip?: boolean;
};

// No prose paragraphs here on purpose. The screenshot carries the explanation
// and the four points carry the detail. See docs/design/02-design-system.md.
const ROWS: Row[] = [
  {
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
    title: "It reads the inbox you stopped opening",
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
    title: "The whole term, kept current",
    points: [
      "Writes to the calendar you already use",
      "Re-checks the portal for changed dates",
      "Blocks work time around your real pace",
      "Protects hours you mark off limits",
    ],
    shot: { variant: "calendar", title: "Google Calendar, November" },
  },
];

export function Showcase() {
  return (
    <Section padTop="tight">
      <Container>
        <div className="flex flex-col gap-24 sm:gap-32">
          {ROWS.map((row, i) => (
            <div
              key={row.title}
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
                ) : row.shot ? (
                  <PlaceholderShot variant={row.shot.variant} title={row.shot.title} />
                ) : null}
              </Reveal>
            </div>
          ))}
        </div>
      </Container>
    </Section>
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
