import { Button, Container } from "@/components/ui/primitives";
import { LogoMark } from "@/components/brand/LogoMark";
import { Reveal } from "@/components/ui/Reveal";
import { cn } from "@/lib/cn";

/**
 * Closing CTA, with the FAQ floating around it as overheard conversation.
 *
 * The questions used to be an accordion further up the page, which meant every
 * answer was hidden behind a click and most were never read. As bubbles they
 * are all visible at once, and the medium carries the message: this is a
 * product you talk to, so its FAQ is a set of texts rather than a help centre.
 *
 * Answers had to get much shorter to work at this size. That is a feature; a
 * question that cannot be answered in a bubble probably belongs in the docs.
 *
 * Blue and green because both are real: iMessage blue between Apple devices,
 * SMS green everywhere else. Alternating them says "works on your phone,
 * whichever one it is" without a line of copy.
 *
 * TODO(founders): the "84 hours a year" headline is a performance claim, and
 * the asterisk in the footer points at an estimate. Under s.74.01(1)(b) of the
 * Competition Act a performance claim must rest on adequate and proper testing
 * carried out BEFORE the claim is published, and a footnote does not cure an
 * untested one. Either run the survey the footnote describes and keep the
 * method on file, or soften the headline. See docs/design/08-legal-pages.md.
 */

type Pair = {
  q: string;
  a: string;
  /**
   * Percent offsets against the section height set below (38rem / 608px).
   *
   * Both columns start at 14.5%, which is the first row clear of the fixed
   * header: it overlays the top ~88px of the viewport wherever you are on the
   * page. From there each column spreads its own four threads evenly down to
   * the bottom edge, which is why the two columns do not share a row rhythm:
   * the threads are 74px to 110px depending on how far their answer wraps, so
   * an even split lands in a different place on each side. That staggering is
   * also what stops the two columns reading as a table.
   *
   * These are tuned to the measured thread heights. Shorten the section or
   * lengthen an answer past two lines and the rows below it need re-spacing.
   */
  /**
   * Which edge the thread hangs off. Not a percentage any more.
   *
   * The right column used to be positioned from the left at 72-74%, which is a
   * measurement that only works at one width: a 17rem thread starting at 72% of
   * 1280px begins at 922px, and the centred headline runs to 1024px, so the two
   * overlapped on every screen at the low end of the range. Anchoring each
   * column to its own edge puts the maximum possible air between them and the
   * text, at every width, with no numbers to re-tune.
   */
  side: "left" | "right";
  top: string;
};

const PAIRS: Pair[] = [
  { q: "Do I need to download anything?", a: "No. It lives in your Messages app.", side: "left", top: "14.5%" },
  { q: "Why do you need my portal password?", a: "Grades sit behind it. It checks overnight while you sleep.", side: "left", top: "36%" },
  { q: "Will it text me at 3am?", a: "Never. You set quiet hours.", side: "left", top: "63.5%" },
  { q: "What does it cost?", a: "Nothing during early access.", side: "left", top: "85%" },
  { q: "My school is not on the list?", a: "Not yet. Search it and we will tell you the day it goes live.", side: "right", top: "14.5%" },
  { q: "Will it do my assignments?", a: "No. It gets you to the desk on time.", side: "right", top: "38%" },
  { q: "Can I turn off the calls?", a: "Reply STOP CALLS. Texts keep working.", side: "right", top: "58.5%" },
  { q: "What happens when the term ends?", a: "It goes quiet. Reply DELETE to wipe everything.", side: "right", top: "82%" },
];

export function CtaBand() {
  return (
    <section
      id="final-cta"
      // Curved top corners, mirroring the hero's curved bottom, so the page
      // opens and closes on the same shape. The white section above shows
      // through the corners, which is what makes the curve read at all.
      //
      // The min-height only exists to give the conversation room to flank the
      // headline, and it is what decides when the footer arrives.
      //
      // The headline is centred in this box and the footer is the same ink with
      // no border between them, so "the footer appears" really means "the
      // footer's first row of links clears the fold", 56px past the section
      // end. With the headline centred that needs height < viewport - 112px, so
      // 38rem (608px) is the tallest this can be and still land the footer on a
      // 720px laptop. At 52rem it was a half-screen scroll through empty ink.
      //
      // The floor is 516px: py-24 plus the 324px headline block. Below that the
      // padding takes over and the min-height stops doing anything.
      className="relative flex flex-col justify-center overflow-hidden rounded-t-[2rem] bg-ink-900 py-24 sm:rounded-t-[3rem] xl:min-h-[38rem]"
    >
      <Backdrop />

      {/* Below xl there is not enough width to flank the headline without
          colliding with it, so the conversation simply does not render. The
          section still works as a plain CTA. */}
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 hidden xl:block">
        <Container className="relative h-full">
          {PAIRS.map((pair, i) => (
            <Thread key={pair.q} pair={pair} index={i} />
          ))}
        </Container>
      </div>

      <Container className="relative">
        <Reveal className="mx-auto max-w-3xl text-center">
          <LogoMark size={56} tone="white" animated className="mx-auto" />
          <h2 className="mt-7 text-[2.1rem] font-extrabold leading-[1.08] text-white sm:text-[2.85rem]">
            4 mins setup = 84 hrs Saved pa<span aria-hidden="true">*</span>
          </h2>
          {/* One button, and a wide one. A secondary "see what it does" here
              pointed back up a page the reader has just finished, and split the
              attention of the only ask that matters. */}
          {/* Same attention pulse as the header capsule: fifteen seconds of
              rest, then about five brighter. White rather than brand, because
              this one sits on the navy band and a blue glow on navy is invisible.
              `isolate` keeps the z-indices local so the light sits under the
              button without falling behind the section's own background. */}
          <div className="mt-9 flex justify-center">
            <div className="relative isolate" data-start-cta>
              <span
                aria-hidden="true"
                className="pointer-events-none absolute -inset-x-8 -inset-y-5 z-0 rounded-full bg-white/70 blur-[30px] motion-safe:animate-cta-attention"
                style={
                  { "--cta-glow": "0.4", "--cta-glow-peak": "0.56" } as React.CSSProperties
                }
              />
              <Button
                href="/#hero"
                variant="onInk"
                className="relative z-10 px-14 py-4 text-[1.02rem]"
              >
                Get set up
              </Button>
            </div>
          </div>
        </Reveal>
      </Container>
    </section>
  );
}

/** One overheard exchange: question sent, answer back. */
function Thread({ pair, index }: { pair: Pair; index: number }) {
  const green = index % 2 === 1;

  return (
    <div
      // Narrower at the bottom of the xl range, where the gap between the
      // headline and the edge is only about 250px, and full width again once
      // there is room for it.
      className="absolute w-[14.5rem] motion-safe:animate-float-slow 2xl:w-[17rem]"
      style={{
        ...(pair.side === "left" ? { left: "0.5rem" } : { right: "0.5rem" }),
        top: pair.top,
        animationDelay: `${index * 0.7}s`,
        animationDuration: `${9 + (index % 3)}s`,
      }}
    >
      <div className="flex justify-end">
        <p
          className={cn(
            "max-w-[92%] rounded-2xl rounded-br-md px-3.5 py-2 text-[0.8rem] leading-[1.4] text-white shadow-lg",
            green ? "bg-[#34C759]" : "bg-[#0A7CFF]",
          )}
          style={{ animation: "bubble-in .6s var(--ease-out-soft) both", animationDelay: `${index * 0.18}s` }}
        >
          {pair.q}
        </p>
      </div>

      <div className="mt-1.5 flex justify-start">
        <p
          className="max-w-[92%] rounded-2xl rounded-bl-md bg-white/92 px-3.5 py-2 text-[0.8rem] leading-[1.4] text-ink-900 shadow-lg backdrop-blur"
          style={{ animation: "bubble-in .6s var(--ease-out-soft) both", animationDelay: `${index * 0.18 + 0.3}s` }}
        >
          {pair.a}
        </p>
      </div>
    </div>
  );
}

function Backdrop() {
  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0">
      <div className="absolute left-1/2 top-1/2 h-[38rem] w-[38rem] -translate-x-1/2 -translate-y-1/2 rounded-full bg-brand-600/25 blur-[130px]" />
      <svg
        className="absolute left-1/2 top-1/2 h-[26rem] w-[26rem] -translate-x-1/2 -translate-y-1/2"
        viewBox="0 0 300 300"
        fill="none"
      >
        {[60, 100, 140].map((r, i) => (
          <circle
            key={r}
            cx="150"
            cy="150"
            r={r}
            stroke="var(--color-sky-400)"
            strokeWidth="1"
            strokeDasharray="2 10"
            opacity={0.35 - i * 0.08}
            style={{
              transformOrigin: "150px 150px",
              animation: `pulse-ring ${6 + i * 1.5}s var(--ease-out-soft) infinite`,
              animationDelay: `${i * 1.4}s`,
            }}
          />
        ))}
      </svg>
    </div>
  );
}
