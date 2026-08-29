import { Container } from "@/components/ui/primitives";
import { HeroStart } from "@/components/landing/HeroStart";
import { PhoneShowcase } from "@/components/ui/PhoneShowcase";
import { Reveal } from "@/components/ui/Reveal";

export function Hero() {
  return (
    // id is read by the header, which keeps its own CTA hidden until the hero
    // (and the much larger CTA inside it) has scrolled away.
    // Tinted panel with curved bottom corners, so the hero reads as a distinct
    // sheet the rest of the page slides out from under. The tint is what makes
    // the curve legible; on white it would be invisible.
    // The header is hidden over the hero and reserves no space, so the hero
    // supplies its own top breathing room.
    <section
      id="hero"
      className="relative overflow-hidden rounded-b-[2rem] bg-hero pb-16 pt-16 sm:rounded-b-[3rem] sm:pb-24 sm:pt-24"
    >
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

            <Reveal delay={170}>
              <div className="mt-9">
                <HeroStart />
              </div>
            </Reveal>

            <Reveal delay={240}>
              {/*
                Two claims, not six, and one column rather than two: a block of
                six ticks beside the phone is a specification sheet, and the
                hero is meant to make one promise and then get out of the way.
                The rest of the argument is the feature wall, which is where
                "See more" goes.

                Both are phrased as things it does to your week rather than
                features it has. "Full schedule in calendar" describes a data
                structure; "Schedules your due dates" describes the afternoon
                you get back.

                What was here and is not any more: "Your portal password stays
                encrypted", "Revoke its Google access any time", and "One text
                turns it all off". Those are access terms rather than features,
                and they arrived here when a "What we can see" section further
                down the page was folded into the hero, on the reasoning that
                answering them in the same breath as the pitch was more honest
                than putting them a scroll away. They are now on neither, so if
                they matter they need a home: the feature wall or the safety
                line in the closing CTA.
              */}
            {/* One row: two claims and the way to the rest of them. Down to two
                items they no longer need a column of their own, and a single
                line under the composer reads as a caption rather than as a
                list, which is the right weight for the hero. flex-wrap because
                the three of them are about 500px and the left column is not
                much more than that. */}
            <div className="mt-8 flex flex-wrap items-center gap-x-5 gap-y-2.5">
              <ul className="flex flex-wrap items-center gap-x-5 gap-y-2.5 text-[0.88rem] text-body-soft">
                {["Schedules your due dates", "Updates you from emails"].map((claim) => (
                  <li key={claim} className="flex items-center gap-2">
                    <CheckDot />
                    {claim}
                  </li>
                ))}
              </ul>

              {/* A plain anchor. globals.css sets scroll-behavior: smooth and
                  drops it under reduced motion, and Section carries scroll-mt-24
                  so the heading lands clear of the floating header, so this
                  needs no JavaScript to behave. */}
              <a
                href="#features"
                className="inline-flex items-center gap-1.5 text-[0.88rem] font-semibold text-brand-600 transition-colors hover:text-brand-700"
              >
                See more
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 14 14"
                  fill="none"
                  aria-hidden="true"
                  className="mt-px"
                >
                  <path
                    d="M3.5 5.25 7 8.75l3.5-3.5"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </a>
            </div>
            </Reveal>
          </div>

          <Reveal delay={120} className="relative">
            <PhoneShowcase />
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
