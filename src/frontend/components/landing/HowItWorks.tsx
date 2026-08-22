import { Container, Section, SectionHeading } from "@/components/ui/primitives";
import { PlaceholderShot } from "@/components/ui/PlaceholderShot";
import { Reveal } from "@/components/ui/Reveal";

const STEPS = [
  {
    n: "01",
    title: "Sign in with your school email",
    body: "One Google sign in, then your student portal login so the agent can reach course pages your email cannot.",
    glyph: <SignInGlyph />,
  },
  {
    n: "02",
    title: "It reads your semester",
    body: "Classes, schedule, grade history, course content, and every syllabus it can download from the portal.",
    glyph: <ScanGlyph />,
  },
  {
    n: "03",
    title: "Your calendar fills itself",
    body: "Due dates, exam dates, labs, and lectures land in Google Calendar and in your task list, ranked by what matters.",
    glyph: <CalendarFillGlyph />,
  },
  {
    n: "04",
    title: "Then it stays on you",
    body: "Texts paced to how fast you actually work. Ignore the final warning and your phone rings.",
    glyph: <NudgeGlyph />,
  },
];

export function HowItWorks() {
  return (
    <Section id="how" tone="paper">
      <Container>
        <Reveal>
          <SectionHeading
            label="Setup takes about four minutes"
            title="You do the first step. It does the rest of the semester."
            lead="Most of what a school assistant needs is already sitting in your email, your portal, and your syllabi. Classistant goes and gets it instead of asking you to type it in."
          />
        </Reveal>

        <div className="relative mt-16">
          <StepConnector />
          <ol className="relative grid gap-8 sm:grid-cols-2 lg:grid-cols-4 lg:gap-6">
            {STEPS.map((step, i) => (
              <Reveal as="li" key={step.n} delay={i * 110}>
                <div className="flex h-full flex-col rounded-2xl bg-white p-6 shadow-soft ring-1 ring-line">
                  <div className="flex items-center justify-between">
                    <span className="grid h-11 w-11 place-items-center rounded-xl bg-sky-100">
                      {step.glyph}
                    </span>
                    <span className="font-display text-[0.8rem] font-bold tracking-widest text-sky-400">
                      {step.n}
                    </span>
                  </div>
                  <h3 className="mt-5 text-[1.06rem] font-bold leading-snug text-ink-900">
                    {step.title}
                  </h3>
                  <p className="mt-2.5 text-[0.9rem] leading-[1.6] text-body">{step.body}</p>
                </div>
              </Reveal>
            ))}
          </ol>
        </div>

        <Reveal delay={120}>
          <div className="mt-16">
            <PlaceholderShot
              variant="dashboard"
              title="classistant.ca/dashboard"
              caption="The web dashboard is where you check its work. Day to day, you never have to open it."
            />
          </div>
        </Reveal>
      </Container>
    </Section>
  );
}

/** Dashed line that draws itself across the four steps on large screens. */
function StepConnector() {
  return (
    <svg
      aria-hidden="true"
      className="absolute left-0 top-[2.6rem] hidden w-full lg:block"
      height="2"
      viewBox="0 0 1000 2"
      preserveAspectRatio="none"
    >
      <path
        d="M0 1 H1000"
        stroke="var(--color-sky-300)"
        strokeWidth="2"
        strokeDasharray="6 8"
        className="draw-line"
        style={{ ["--dash" as string]: "1000", ["--draw-delay" as string]: "200ms" }}
        data-shown="true"
      />
    </svg>
  );
}

function SignInGlyph() {
  return (
    <svg width="21" height="21" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M10 4H6.5A2.5 2.5 0 0 0 4 6.5v11A2.5 2.5 0 0 0 6.5 20H10"
        stroke="var(--color-brand-600)"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
      <path
        d="M14 8.5 17.5 12 14 15.5M17 12H8.5"
        stroke="var(--color-sky-500)"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function ScanGlyph() {
  return (
    <svg width="21" height="21" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect x="4.5" y="3" width="15" height="18" rx="2.5" stroke="var(--color-brand-600)" strokeWidth="1.8" />
      <path d="M8 8h6M8 12h8M8 16h5" stroke="var(--color-sky-500)" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

function CalendarFillGlyph() {
  return (
    <svg width="21" height="21" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect x="3.5" y="5" width="17" height="15.5" rx="2.5" stroke="var(--color-brand-600)" strokeWidth="1.8" />
      <path d="M3.5 9.5h17" stroke="var(--color-brand-600)" strokeWidth="1.8" />
      <path d="M8 3v3.5M16 3v3.5" stroke="var(--color-brand-600)" strokeWidth="1.8" strokeLinecap="round" />
      <rect x="6.5" y="12.2" width="6" height="2.4" rx="1.2" fill="var(--color-sky-500)" />
      <rect x="14" y="16" width="4" height="2.4" rx="1.2" fill="var(--color-sky-400)" />
    </svg>
  );
}

function NudgeGlyph() {
  return (
    <svg width="21" height="21" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M12 3.5a6 6 0 0 0-6 6v3.2l-1.4 2.6a.8.8 0 0 0 .7 1.2h13.4a.8.8 0 0 0 .7-1.2L18 12.7V9.5a6 6 0 0 0-6-6Z"
        stroke="var(--color-brand-600)"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
      <path d="M10 19.5a2.2 2.2 0 0 0 4 0" stroke="var(--color-sky-500)" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}
