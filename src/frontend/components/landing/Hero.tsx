import { Button, Container, ArrowRight } from "@/components/ui/primitives";
import { PhoneThread } from "@/components/ui/PhoneThread";
import { Reveal } from "@/components/ui/Reveal";
import { LIVE_SCHOOLS } from "@/data/schools";

export function Hero() {
  return (
    <section className="relative overflow-hidden pb-16 pt-10 sm:pb-24 sm:pt-16">
      <HeroBackdrop />

      <Container className="relative">
        <div className="grid items-center gap-14 lg:grid-cols-[1.05fr_0.95fr] lg:gap-10">
          <div>
            <Reveal>
              <h1 className="text-[2.6rem] font-extrabold leading-[1.05] tracking-[-0.032em] text-ink-900 sm:text-[3.6rem]">
                Your semester,
                <br />
                handled over text.
              </h1>
            </Reveal>

            <Reveal delay={90}>
              <p className="mt-6 max-w-xl text-[1.1rem] leading-[1.65] text-body">
                Classistant signs in to your school account, turns every syllabus into a
                calendar, watches for new grades, and texts you before something is due.
                There is no new app to remember to open.
              </p>
            </Reveal>

            <Reveal delay={170}>
              <div className="mt-9 flex flex-wrap items-center gap-3">
                <Button href="/onboarding" className="group">
                  Get set up
                  <ArrowRight />
                </Button>
                <Button href="#how" variant="secondary">
                  See how it works
                </Button>
              </div>
            </Reveal>

            <Reveal delay={240}>
              <div className="mt-8 flex flex-wrap items-center gap-x-6 gap-y-3 text-[0.88rem] text-body-soft">
                <span className="flex items-center gap-2">
                  <CheckDot />
                  Free during early access
                </span>
                <span className="flex items-center gap-2">
                  <CheckDot />
                  {LIVE_SCHOOLS.length} Canadian schools supported
                </span>
                <span className="flex items-center gap-2">
                  <CheckDot />
                  Turn it off with one text
                </span>
              </div>
            </Reveal>
          </div>

          <Reveal delay={120} className="relative">
            <PhoneThread />
          </Reveal>
        </div>
      </Container>
    </section>
  );
}

function CheckDot() {
  return (
    <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden="true" className="shrink-0">
      <circle cx="8" cy="8" r="7.25" fill="var(--color-sky-100)" stroke="var(--color-sky-300)" strokeWidth="1" />
      <path
        d="M4.8 8.2 L6.9 10.2 L11.2 5.9"
        stroke="var(--color-brand-600)"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/**
 * Background for the hero: a faint grid, two soft blue washes, and a set of
 * concentric arcs that read as a signal going out to a phone. All decorative,
 * so it is hidden from assistive tech and sits behind everything.
 */
function HeroBackdrop() {
  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
      {/* The grid's strongest point sits below the floating header rather than
          at y=0, so it fades in instead of starting on a hard horizontal seam
          where the header used to be attached. */}
      <div className="grain-grid absolute inset-0 [mask-image:radial-gradient(68%_62%_at_50%_22%,black,transparent)]" />

      {/* Both washes stay clear of the section's top edge. The section is
          overflow-hidden (to stop the left blob causing horizontal scroll), so
          anything crossing that edge gets sliced into a hard line across the
          page, right where the floating header no longer covers it. */}
      <div className="absolute -left-32 top-4 h-[32rem] w-[32rem] rounded-full bg-sky-200/45 blur-[110px]" />
      <div className="absolute -right-24 top-28 h-[26rem] w-[26rem] rounded-full bg-brand-400/20 blur-[110px]" />

      <svg
        className="absolute right-[6%] top-[12%] hidden h-[30rem] w-[30rem] lg:block"
        viewBox="0 0 400 400"
        fill="none"
      >
        {[70, 118, 166, 214].map((r, i) => (
          <circle
            key={r}
            cx="200"
            cy="200"
            r={r}
            stroke="var(--color-sky-400)"
            strokeWidth="1.1"
            strokeDasharray="3 9"
            opacity={0.5 - i * 0.09}
            style={{
              transformOrigin: "200px 200px",
              animation: `pulse-ring ${5 + i}s var(--ease-out-soft) infinite`,
              animationDelay: `${i * 1.1}s`,
            }}
          />
        ))}
      </svg>
    </div>
  );
}
