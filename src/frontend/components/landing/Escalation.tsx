import { Container, Section, SectionHeading } from "@/components/ui/primitives";
import { Reveal } from "@/components/ui/Reveal";

const RUNGS = [
  {
    when: "5 days out",
    title: "A quiet nudge",
    quote: "PSYC 258 essay is due Sunday. Your last three took about six hours each.",
  },
  {
    when: "2 days out",
    title: "A real reminder",
    quote: "You have not opened it yet. Two days left. Want me to block tonight, 8 to 10?",
  },
  {
    when: "12 hours out",
    title: "The final warning",
    quote: "Last call on the essay. It is 20 percent of the course and it closes at 11:59pm.",
  },
  {
    when: "You ignored it",
    title: "Your phone rings",
    quote: "Classistant calls you. Answer, and it walks you into starting. Say stop and it stops.",
  },
];

export function Escalation() {
  return (
    <Section tone="ink" className="relative overflow-hidden">
      <LadderBackdrop />
      <Container className="relative">
        <Reveal>
          <SectionHeading
            tone="ink"
            label="It gets louder on purpose"
            title="Most reminder apps give up when you swipe them away"
            lead="Classistant does not. It starts gently, escalates on a schedule tied to how much work is actually left, and ends with a phone call if you keep ignoring it. You set the ceiling during onboarding."
          />
        </Reveal>

        <div className="mt-16">
          <LadderLine />
          <ol className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {RUNGS.map((rung, i) => (
              <Reveal as="li" key={rung.title} delay={i * 120}>
                <div className="relative flex h-full flex-col rounded-2xl bg-ink-800/70 p-6 ring-1 ring-ink-700 backdrop-blur">
                  <span className="flex items-center gap-2.5">
                    <span className="relative grid h-8 w-8 place-items-center rounded-full bg-sky-400/15">
                      <span className="h-2.5 w-2.5 rounded-full bg-sky-400" />
                      {i === RUNGS.length - 1 ? (
                        <span
                          className="absolute inset-0 rounded-full bg-sky-400/40 motion-safe:animate-[pulse-ring_2.4s_ease-out_infinite]"
                          aria-hidden="true"
                        />
                      ) : null}
                    </span>
                    <span className="text-[0.78rem] font-semibold uppercase tracking-[0.12em] text-sky-400">
                      {rung.when}
                    </span>
                  </span>

                  <h3 className="mt-5 text-[1.08rem] font-bold text-white">{rung.title}</h3>
                  <p className="mt-3 border-l-2 border-sky-400/40 pl-3.5 text-[0.9rem] italic leading-[1.6] text-sky-200/80">
                    {rung.quote}
                  </p>
                </div>
              </Reveal>
            ))}
          </ol>
        </div>

        <Reveal delay={200}>
          <p className="mt-10 text-[0.9rem] text-sky-200/70">
            Quiet hours are respected. Calls are opt in, and you can drop back to texts only by
            replying STOP CALLS at any point in the term.
          </p>
        </Reveal>
      </Container>
    </Section>
  );
}

/** Ascending dashed line that draws across the four rungs on wide screens. */
function LadderLine() {
  return (
    <svg
      aria-hidden="true"
      className="mb-6 hidden h-16 w-full lg:block"
      viewBox="0 0 1000 64"
      fill="none"
      preserveAspectRatio="none"
    >
      <path
        d="M40 56 C 260 56, 240 34, 460 34 S 700 14, 960 8"
        stroke="var(--color-sky-400)"
        strokeWidth="2"
        strokeDasharray="7 9"
        strokeLinecap="round"
        opacity="0.6"
        className="draw-line"
        style={{ ["--dash" as string]: "1100" }}
        data-shown="true"
      />
      {[40, 353, 666, 960].map((x, i) => (
        <circle
          key={x}
          cx={x}
          cy={[56, 40, 24, 8][i]}
          r={4 + i}
          fill="var(--color-sky-400)"
          opacity={0.45 + i * 0.16}
        />
      ))}
    </svg>
  );
}

function LadderBackdrop() {
  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0 -z-0">
      <div className="absolute -right-20 top-0 h-96 w-96 rounded-full bg-brand-600/25 blur-[120px]" />
      <div className="absolute -left-24 bottom-0 h-80 w-80 rounded-full bg-sky-500/10 blur-[110px]" />
    </div>
  );
}
