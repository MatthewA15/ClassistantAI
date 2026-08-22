import { Container, Section } from "@/components/ui/primitives";
import { PlaceholderShot } from "@/components/ui/PlaceholderShot";
import { Reveal } from "@/components/ui/Reveal";
import { cn } from "@/lib/cn";

type Row = {
  label: string;
  title: string;
  body: string;
  points: string[];
  shot: { variant: "syllabus" | "inbox" | "calendar"; title: string };
  flip?: boolean;
};

const ROWS: Row[] = [
  {
    label: "Syllabus parsing",
    title: "Every syllabus turns into dates you cannot miss",
    body: "Classistant downloads the syllabus for each course, pulls out every graded item, and writes it into your calendar and its own database so nothing depends on you rereading a PDF in week nine.",
    points: [
      "Assignment and project due dates",
      "Midterm, final, and lab exam dates",
      "Weekly lecture, tutorial, and lab blocks",
      "Weighting, so it knows what actually matters",
    ],
    shot: { variant: "syllabus", title: "Syllabus, PSYC 258 fall term" },
  },
  {
    label: "Email and discussions",
    title: "It reads the inbox you have stopped opening",
    body: "Course announcements, discussion board replies, and that one email from your prof about a room change all get scanned. Anything that changes your schedule or your grade reaches you as a text.",
    points: [
      "Flags schedule changes and cancelled classes",
      "Summarises long announcement threads",
      "Drafts replies and sends them once you approve",
      "Books office hours with your prof for you",
    ],
    shot: { variant: "inbox", title: "Course mail, 6 new" },
    flip: true,
  },
  {
    label: "One calendar",
    title: "The whole term in one place, kept current",
    body: "Classes, deadlines, exams, and the study blocks it schedules for you all live in your existing Google Calendar. If the portal changes a date, your calendar changes with it.",
    points: [
      "Writes to the Google Calendar you already use",
      "Re-checks the portal for changed dates",
      "Blocks work time based on your real pace",
      "Protects the hours you mark as off limits",
    ],
    shot: { variant: "calendar", title: "Google Calendar, November" },
  },
];

export function Showcase() {
  return (
    <Section>
      <Container>
        <div className="flex flex-col gap-24 sm:gap-32">
          {ROWS.map((row, i) => (
            <div
              key={row.title}
              className="grid items-center gap-10 lg:grid-cols-2 lg:gap-16"
            >
              <Reveal className={cn(row.flip && "lg:order-2")}>
                <p className="text-[0.8rem] font-semibold uppercase tracking-[0.16em] text-brand-600">
                  {row.label}
                </p>
                <h2 className="mt-3 text-[1.85rem] font-extrabold leading-[1.15] text-ink-900 sm:text-[2.25rem]">
                  {row.title}
                </h2>
                <p className="mt-4 text-[1.02rem] leading-[1.65] text-body">{row.body}</p>
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
                <PlaceholderShot variant={row.shot.variant} title={row.shot.title} />
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
