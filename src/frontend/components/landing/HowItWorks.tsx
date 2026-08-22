import { Container, Section, SectionHeading } from "@/components/ui/primitives";
import { PlaceholderShot } from "@/components/ui/PlaceholderShot";
import { Reveal } from "@/components/ui/Reveal";
import { SceneCalendar, ScenePhone, SceneReads, SceneSignIn } from "@/components/landing/hiwScenes";

const STEPS = [
  { n: "01", title: "Sign in", body: "Google, then your portal.", scene: <SceneSignIn /> },
  { n: "02", title: "It reads everything", body: "Courses, grades, syllabi.", scene: <SceneReads /> },
  { n: "03", title: "Calendar fills itself", body: "Deadlines, exams, labs.", scene: <SceneCalendar /> },
  { n: "04", title: "It stays on you", body: "Texts. Then a phone call.", scene: <ScenePhone /> },
];

export function HowItWorks() {
  return (
    // tight: the hero already ends in generous space, so normal top padding
    // stacked into a visible gap.
    <Section id="how" tone="paper" padTop="tight">
      <Container>
        <Reveal>
          <SectionHeading title="You do step one. It does the semester." />
        </Reveal>

        <div className="relative mt-12">
          <ol className="relative grid gap-8 sm:grid-cols-2 lg:grid-cols-4 lg:gap-6">
            {STEPS.map((step, i) => (
              <Reveal as="li" key={step.n} delay={i * 110}>
                <div className="flex h-full flex-col rounded-2xl bg-white p-6 shadow-soft ring-1 ring-line">
                  <div className="flex items-start justify-between gap-3">
                    {/* The scene does the explaining; the copy underneath is a
                        caption for it, not the other way round. */}
                    <span className="h-[7rem] flex-1 overflow-hidden rounded-xl bg-sky-50 p-2.5">
                      {step.scene}
                    </span>
                    <span className="font-display text-[0.8rem] font-bold tracking-widest text-sky-400">
                      {step.n}
                    </span>
                  </div>
                  <h3 className="mt-5 text-[1.15rem] font-bold leading-snug text-ink-900">
                    {step.title}
                  </h3>
                  <p className="mt-1.5 text-[0.92rem] leading-[1.5] text-body">{step.body}</p>
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
              caption="Check its work here. You almost never need to."
            />
          </div>
        </Reveal>
      </Container>
    </Section>
  );
}
