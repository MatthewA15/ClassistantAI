import { Container, Section, SectionHeading } from "@/components/ui/primitives";
import { Reveal } from "@/components/ui/Reveal";
import * as G from "@/components/landing/glyphs";

const FEATURES = [
  {
    title: "Pulls your whole profile",
    body: "Courses, section times, room numbers, and your grade history, straight from the portal.",
    glyph: <G.Profile />,
  },
  {
    title: "Grabs course content",
    body: "Slides, readings, and posted files come down from the portal so it knows what the work actually is.",
    glyph: <G.Files />,
  },
  {
    title: "Downloads every syllabus",
    body: "Then reads it, so the term plan exists before week one instead of after your first missed deadline.",
    glyph: <G.Syllabus />,
  },
  {
    title: "Due dates into your calendar",
    body: "Every graded item lands in Google Calendar and in your task list, with the weighting attached.",
    glyph: <G.DueDate />,
  },
  {
    title: "Exams and class schedules",
    body: "Midterms, finals, labs, and every recurring block, set up once and corrected when the school moves them.",
    glyph: <G.Exam />,
  },
  {
    title: "Ranks what to do next",
    body: "Incoming work gets ordered by weight, deadline, and how much runway you have left. Not just by date.",
    glyph: <G.Priority />,
  },
  {
    title: "Reminders paced to you",
    body: "It learns how long your assignments actually take and starts nudging with enough time to finish, not the night before.",
    glyph: <G.Pace />,
  },
  {
    title: "Grade checker",
    body: "The moment a prof uploads a mark, you get a text. No more refreshing the grades page for a week.",
    glyph: <G.Grade />,
  },
  {
    title: "Watches your email",
    body: "Announcements, discussion threads, and schedule changes get read and summarised down to what affects you.",
    glyph: <G.Inbox />,
  },
  {
    title: "Writes emails for you",
    body: "Tell it what you need, approve the draft, and it sends. Extensions, clarifications, group project chasing.",
    glyph: <G.Compose />,
  },
  {
    title: "Books office hours",
    body: "It emails your prof to set up a meeting when you are struggling in a course, and puts it in your calendar.",
    glyph: <G.OfficeHours />,
  },
  {
    title: "Calls you when texts fail",
    body: "Ignore the final warning and your phone rings. You can also opt into calls for urgent email and hard deadlines.",
    glyph: <G.Call />,
  },
];

export function Features() {
  return (
    <Section id="features" tone="paper">
      <Container>
        <Reveal>
          <SectionHeading
            label="The full list"
            title="Everything it handles once it is set up"
            lead="Classistant is built for one job, getting you through a semester. That is the whole scope, start of term to final grades."
          />
        </Reveal>

        <div className="mt-14 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((feature, i) => (
            <Reveal key={feature.title} delay={(i % 3) * 80}>
              <article className="group h-full rounded-2xl bg-white p-6 shadow-soft ring-1 ring-line transition-all duration-300 hover:-translate-y-1 hover:shadow-lift hover:ring-sky-300">
                <span className="grid h-11 w-11 place-items-center rounded-xl bg-sky-100 transition-colors duration-300 group-hover:bg-sky-200">
                  {feature.glyph}
                </span>
                <h3 className="mt-5 text-[1.02rem] font-bold leading-snug text-ink-900">
                  {feature.title}
                </h3>
                <p className="mt-2 text-[0.9rem] leading-[1.6] text-body">{feature.body}</p>
              </article>
            </Reveal>
          ))}
        </div>
      </Container>
    </Section>
  );
}
