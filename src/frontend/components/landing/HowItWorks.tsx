import { Container, Section, SectionHeading } from "@/components/ui/primitives";
import { Reveal } from "@/components/ui/Reveal";
import {
  SceneCalendar,
  ScenePhone,
  SceneReads,
  SceneSignIn,
} from "@/components/landing/hiwScenes";

const STEPS = [
  {
    n: "01",
    title: "Sign in",
    body: "Google, then your portal.",
    scene: <SceneSignIn />,
  },
  {
    n: "02",
    title: "It reads everything",
    body: "Courses, grades, syllabi.",
    scene: <SceneReads />,
  },
  {
    n: "03",
    title: "Calendar fills itself",
    body: "Deadlines, exams, labs.",
    scene: <SceneCalendar />,
  },
  {
    n: "04",
    title: "It stays on you",
    body: "Texts. Then a phone call.",
    scene: <ScenePhone />,
  },
];

export function HowItWorks() {
  return (
    // tight: the hero already ends in generous space, so normal top padding
    // stacked into a visible gap.
    <Section id="how" tone="paper" padTop="tight" padBottom="tight">
      <Container>
        <Reveal>
          {/* Two lines, one sentence each: the split is the point, so the
              second sentence gets its own line rather than wherever the
              measure happens to break. `wide` keeps line two from wrapping
              again into a third. */}
          <SectionHeading
            width="wide"
            title={
              <>
                You do step one.{" "}
                <span className="block">
                  Your Classistant does the semester.
                </span>
              </>
            }
          />
        </Reveal>

        <div className="relative mt-12">
          <ol className="relative grid gap-8 sm:grid-cols-2 lg:grid-cols-4 lg:gap-6">
            {STEPS.map((step, i) => (
              <Reveal as="li" key={step.n} delay={i * 110}>
                {/* Each card is a soft round object with its own light under it,
                    the same idea as the header capsules. Offsetting the delays
                    keeps the four from breathing in unison, which reads as one
                    animation applied four times rather than four objects. */}
                {/* isolate, or the light is invisible: nothing between here and
                    the root makes a stacking context, so a -z-10 child paints
                    underneath the section's own bg-paper rather than on it. */}
                <div className="relative isolate h-full">
                  <div
                    aria-hidden="true"
                    className="absolute inset-x-6 -bottom-4 -z-10 h-16 rounded-full bg-[var(--color-accent)] opacity-70 blur-[22px] motion-safe:animate-glow-morph"
                    style={{ animationDelay: `${i * -4}s` }}
                  />
                  <div
                    className="flex h-full flex-col rounded-[2.6rem] bg-white p-6 shadow-soft ring-1 ring-line motion-safe:animate-card-morph"
                    style={{ animationDelay: `${i * -3.5}s` }}
                  >
                    <div className="flex items-start justify-between gap-3">
                      {/* The scene does the explaining; the copy underneath is a
                        caption for it, not the other way round. */}
                      <span className="h-[7rem] flex-1 overflow-hidden rounded-[1.6rem] bg-sky-50 p-2.5">
                        {step.scene}
                      </span>
                      <span className="font-display text-[0.8rem] font-bold tracking-widest text-sky-400">
                        {step.n}
                      </span>
                    </div>
                    <h3 className="mt-5 text-[1.15rem] font-bold leading-snug text-ink-900">
                      {step.title}
                    </h3>
                    <p className="mt-1.5 text-[0.92rem] leading-[1.5] text-body">
                      {step.body}
                    </p>
                  </div>
                </div>
              </Reveal>
            ))}
          </ol>
        </div>
      </Container>
    </Section>
  );
}
