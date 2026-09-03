import Link from "next/link";
import { BuiltBy } from "@/components/site/BuiltBy";
import { Container } from "@/components/ui/primitives";
import { themeCss } from "@/components/theme/themeVars";
import { cn } from "@/lib/cn";
import type { School } from "@/data/schools";

/**
 * The furniture around the wizard: the page wash, the card, the progress bar.
 *
 * This is a plain module with no "use client" on purpose, even though the wizard
 * that renders it is a client component. Everything here is static markup and a
 * Link, so it costs nothing to run on the server, and being server-renderable is
 * what lets app/onboarding/loading.tsx draw the exact same card while the real
 * one is still being fetched.
 *
 * That matters more than it sounds. /onboarding is force-dynamic, and Next only
 * prefetches a dynamic route as far as its nearest loading boundary. With no
 * loading.tsx the prefetch returned 186 bytes of nothing, so clicking "i'm ready
 * to start" paid for a server round trip AND ~57 kB gzipped of never-before-seen
 * JavaScript before a single pixel moved. That pause is the stutter students see
 * on their first arrival and never again.
 * See docs/design/16-onboarding-entry-cost.md.
 *
 * So these components have exactly one hard rule: no hooks, no browser APIs,
 * nothing that would force a "use client" onto this file. Adding one silently
 * drags the whole wizard bundle into the loading boundary and undoes the fix.
 */

/**
 * What the student is told they are doing, which is not the same as the number
 * of screens.
 *
 * Four screens were shown as four numbered steps in a rail down the side, plus
 * the school picker before them, so the flow announced itself as five things to
 * get through before anything happened. It is three: pick a school, sign in,
 * confirm your details. The two sign-in screens are one job with a technical
 * seam in the middle. (There are three screens now rather than four, since the
 * portal password left for /portal-login, and the phases did not move: they
 * were already counting jobs rather than screens.)
 *
 * Counting this way also means the school picker is worth something. It was
 * unnumbered, so a student arriving at screen two had done a third of the work
 * and was told they were at step one of four.
 *
 * The last one is called "Welcome gift" rather than "Your details" because the
 * screen it labels is where a student finds out Classistant is free for the
 * whole beta. Naming the reward instead of the paperwork is the difference
 * between a third step and a reason to finish.
 */
export const PHASES = ["Pick your school", "Log in", "Welcome gift"];

/**
 * The page around the card: background wash, container, and the faces at the
 * bottom.
 *
 * Shared by page.tsx and loading.tsx so the two paint identically. If the
 * loading boundary drew its own approximation of this, arriving content would
 * shift the card, which is a worse artefact than the pause it replaced.
 *
 * `school` exists only to paint it in that school's colours from the server.
 * The theme is otherwise applied by SchoolThemeProvider in an effect, which
 * cannot run until React has hydrated, so a hard load of
 * /onboarding?school=ualberta drew the whole page in the default blue and then
 * repainted it green a moment later. Emitting the tokens as a stylesheet the
 * server sends means the first paint is already right and the effect changes
 * nothing when it arrives.
 *
 * Optional because loading.tsx has no way to know the school -- it is rendered
 * for a prefetch, before the request that carries ?school= exists. That is
 * fine: the loading card is only ever shown during a client-side navigation,
 * and by then the provider has already themed the document.
 */
export function OnboardingFrame({
  school,
  children,
}: {
  school?: School | null;
  children: React.ReactNode;
}) {
  const css = school ? themeCss(school) : null;

  return (
    <div className="relative min-h-dvh bg-paper">
      {/* Ahead of everything it themes, and rendered as a plain <style> with no
          `precedence` so React leaves it here rather than hoisting it into the
          head. It has to lose to the provider's inline properties, which are
          what a student picking a different school updates, and beat Tailwind's
          default `:root` block, which themeCss's doubled selector handles. */}
      {css ? <style dangerouslySetInnerHTML={{ __html: css }} /> : null}

      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 h-[28rem] overflow-hidden"
      >
        <div className="grain-grid absolute inset-0 [mask-image:linear-gradient(to_bottom,black,transparent)]" />
        <div className="absolute -left-24 -top-32 h-[26rem] w-[26rem] rounded-full bg-sky-200/50 blur-[110px]" />
      </div>

      <Container className="relative py-12 sm:py-16">
        {children}

        {/* A "trouble getting in? email chim@wopara.com or read the privacy
            policy" line used to sit here. The privacy policy and terms are
            still linked from the consent step, which is the screen where they
            actually matter. The support address is not on this page any more,
            so a student who cannot get in has nowhere to write from here.

            Everything above this is mechanism: fields, scopes, a progress bar.
            Three faces at the bottom of the page that asks for a school login
            is the cheapest way to say a person is behind it. */}
        <div className="mt-12">
          <BuiltBy />
        </div>
      </Container>
    </div>
  );
}

export function Shell({
  phase,
  school,
  showSignIn = false,
  children,
}: {
  /** Index into PHASES. Also the count of phases already finished. */
  phase: number;
  school?: School;
  /**
   * Whether to offer the way back in to somebody who already has an account.
   *
   * A prop rather than something derived from `phase`, because the phases do
   * not draw the line in the right place: phase 1 covers the number and the
   * Google grant, and this belongs under the first of those two and nowhere
   * near the second. Offering "Sign in" to a student who has already verified
   * their number a screen ago is offering to send them back to the beginning of
   * what they are in the middle of.
   */
  showSignIn?: boolean;
  children: React.ReactNode;
}) {
  return (
    <>
    {/* One column. The 17rem rail that used to sit on the left held a logo and
        a school name, and once the numbered steps came out of it there was not
        enough left to justify a quarter of the viewport. Both survivors moved
        into the card's own top row, so the form gets the full width. */}
    <div className="mx-auto w-full max-w-[58rem] rounded-[1.4rem] bg-white p-6 shadow-soft ring-1 ring-line sm:p-9">
      {/* The wordmark used to sit here. It said where you were, which the
          student already knows, and said nothing about whether to keep going.
          Only the arrow navigates: making the whole row a link would mean the
          line of encouragement is also the way out of the flow. */}
      <div className="mb-7 flex items-center justify-between gap-4">
        <div className="flex min-w-0 items-center gap-2.5">
          <Link
            href="/"
            aria-label="Back to the home page"
            className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-body-soft ring-1 ring-line transition-colors hover:bg-sky-50 hover:text-ink-900"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
              <path
                d="M9.75 3.5 5.25 8l4.5 4.5"
                stroke="currentColor"
                strokeWidth="1.9"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </Link>
          <span className="truncate font-display text-[1.05rem] font-extrabold tracking-[-0.01em] text-ink-900">
            You&rsquo;re almost done!
          </span>
        </div>

        {school ? (
          <span className="hidden truncate text-[0.85rem] font-semibold text-body-soft sm:block">
            {school.name}
          </span>
        ) : null}
      </div>

      <Progress phase={phase} />
      {children}
    </div>

    {/*
      The door for somebody who is already set up.

      Under the card rather than inside it, and quiet rather than a button. This
      page has exactly one job, which is to get a new student through three
      screens, and a prominent second call to action at the top of it is an
      invitation to leave the flow. But a returning student who lands here -- and
      they do, because /onboarding was the only door this site had until the
      dashboard existed -- needs to be told there is a shorter way, rather than
      being walked back through a wizard that will recognise them halfway.

      It is not conditional on being signed out. It cannot be: this file has no
      "use client" and no session, deliberately, so that app/onboarding/loading.tsx
      can render the same card during a prefetch (docs/design/16). `showSignIn`
      is decided by the caller, which does know.
    */}
    {showSignIn ? (
      <p className="mx-auto mt-5 w-full max-w-[58rem] text-center text-[0.88rem] text-body sm:text-left">
        Already set up?{" "}
        <Link href="/signin" className="font-semibold text-brand-600 hover:underline">
          Sign in with your number
        </Link>
      </p>
    ) : null}
    </>
  );
}

/**
 * Three milestones and a bar, in place of the numbered rail.
 *
 * The fill is phases *finished*, so picking a school is worth a third before
 * the sign-in screen is even drawn. That is the honest reading and it is also
 * the encouraging one: nobody arrives at the second screen having earned zero.
 *
 * It follows that the last phase shows two thirds while you are working through
 * it, and only the finished screen would be full.
 */
function Progress({ phase }: { phase: number }) {
  // Fill to the middle of the phase you are in, not to the start of it. The
  // labels are spread across the full width, so a bar that stopped at the start
  // of "Log in" landed short of the word and read as not having got there yet.
  // Half a phase in puts the end of the bar under the label it belongs to, and
  // the flow feels quicker for it. It also never claims 100% before the last
  // screen is done, which fill-the-whole-current-phase would.
  const pct = ((phase + 0.5) / PHASES.length) * 100;

  return (
    <div className="mb-7">
      <div className="flex items-baseline justify-between gap-3">
        {PHASES.map((label, i) => (
          <span
            key={label}
            className={cn(
              "text-[0.68rem] uppercase tracking-[0.12em] transition-colors",
              // The current phase has to be the loudest thing here. Finished
              // phases were brand green, and green beat black: on the sign-in
              // screen the eye landed on "Pick your school" and the page read
              // as if that were where you still were. Done recedes to grey now
              // and the bar carries the progress; only the current label is
              // dark, and it is the only bold one.
              //
              // Competing utilities live in the branches only, never split
              // between a base string and a branch: Tailwind resolves those by
              // emission order, not by writing order.
              i < phase
                ? "font-semibold text-body-soft"
                : i === phase
                  ? "font-bold text-ink-900"
                  : "font-semibold text-body-soft/55",
            )}
          >
            {label}
          </span>
        ))}
      </div>

      <div
        className="mt-2.5 h-1.5 overflow-hidden rounded-full bg-line"
        role="progressbar"
        aria-valuenow={phase}
        aria-valuemin={0}
        aria-valuemax={PHASES.length}
        aria-label={`Step ${phase + 1} of ${PHASES.length}: ${PHASES[phase]}`}
      >
        {/* max() keeps a visible nub at the start rather than an empty track,
            without overstating how far along a fresh arrival actually is. */}
        <div
          className="h-full rounded-full bg-brand-600 transition-[width] duration-500 ease-[cubic-bezier(0.22,1,0.36,1)]"
          style={{ width: `max(${pct}%, 0.4rem)` }}
        />
      </div>
    </div>
  );
}

/**
 * What stands in for the wizard until it arrives.
 *
 * The card, the back arrow, the line of encouragement and the progress bar are
 * the real ones, not placeholders -- none of them depend on the session, so
 * there is no reason to fake them and then swap. Only the body below is greyed,
 * and it is held at roughly the height of the first screen so the card does not
 * jump when the form lands.
 *
 * The bar opens on phase 0 because a student arriving with no ?school still has
 * a school to pick. One who arrives with one is moved to phase 1 by the wizard;
 * that is a bar animating forward, which is the direction it should move
 * anyway, rather than a correction.
 *
 * Deliberately not a shimmer. This is on screen for a few hundred milliseconds
 * on a first visit and never again, and an animation that draws the eye to a
 * blank rectangle makes the wait feel longer than a still one does.
 */
export function WizardSkeleton() {
  return (
    // showSignIn, because the skeleton stands in for the school picker or the
    // number screen, and both of those offer it. Leaving it out here would make
    // the line appear as the real card lands, which is a layout shift in the
    // one place this file exists to prevent one.
    <Shell phase={0} showSignIn>
      <div aria-hidden="true" className="min-h-[24rem] animate-pulse motion-reduce:animate-none">
        <div className="h-8 w-3/5 rounded-lg bg-line-soft" />
        <div className="mt-7 grid items-center gap-5 sm:grid-cols-2">
          <div className="flex flex-col gap-3">
            <div className="h-5 w-11/12 rounded bg-line-soft" />
            <div className="h-4 w-full rounded bg-line-soft/70" />
            <div className="h-4 w-10/12 rounded bg-line-soft/70" />
            <div className="h-4 w-7/12 rounded bg-line-soft/70" />
          </div>
          <div className="h-[12.5rem] rounded-[1.1rem] bg-paper ring-1 ring-line" />
        </div>
        <div className="mt-5 h-[3.4rem] rounded-xl bg-line-soft/60" />
        <div className="mt-9 border-t border-line-soft pt-6">
          <div className="ml-auto h-12 w-40 rounded-xl bg-line-soft" />
        </div>
      </div>

      {/* The visible card says nothing while it is empty, so the wait is
          announced here instead of being silent to a screen reader. */}
      <p className="sr-only" role="status">
        Loading your setup.
      </p>
    </Shell>
  );
}
