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
      className="relative overflow-hidden rounded-b-[2rem] bg-sky-50 pb-16 pt-16 sm:rounded-b-[3rem] sm:pb-24 sm:pt-24"
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
                Two halves of one promise. The first three are what it does; the
                last three are what that access means, which used to be a whole
                "What we can see" section further down the page. Answering it
                here, in the same breath as the pitch, is more honest than
                putting the pitch up top and the access terms a scroll away.
              */}
              <ul className="mt-8 grid gap-x-6 gap-y-2.5 text-[0.88rem] text-body-soft sm:grid-cols-2">
                {[
                  "Full schedule in calendar",
                  "Text and call reminders",
                  "Auto emails classmates",
                  "Your portal password stays encrypted",
                  "Revoke its Google access any time",
                  "One text turns it all off",
                ].map((claim) => (
                  <li key={claim} className="flex items-center gap-2">
                    <CheckDot />
                    {claim}
                  </li>
                ))}
              </ul>
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
