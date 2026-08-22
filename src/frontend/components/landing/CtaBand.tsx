import { Button, Container, ArrowRight } from "@/components/ui/primitives";
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
  /** Percent offsets. Kept clear of the middle so the headline stays dominant. */
  left: string;
  top: string;
};

const PAIRS: Pair[] = [
  { q: "Do I need to download anything?", a: "No. It lives in your Messages app.", left: "1%", top: "4%" },
  { q: "Why do you need my portal password?", a: "Grades sit behind it. It checks overnight while you sleep.", left: "0%", top: "27%" },
  { q: "Will it text me at 3am?", a: "Never. You set quiet hours.", left: "2%", top: "53%" },
  { q: "What does it cost?", a: "Nothing during early access.", left: "1%", top: "74%" },
  { q: "My school is not on the list?", a: "Not yet. Search it and we will tell you the day it goes live.", left: "72%", top: "6%" },
  { q: "Will it do my assignments?", a: "No. It gets you to the desk on time.", left: "74%", top: "31%" },
  { q: "Can I turn off the calls?", a: "Reply STOP CALLS. Texts keep working.", left: "73%", top: "56%" },
  { q: "What happens when the term ends?", a: "It goes quiet. Reply DELETE to wipe everything.", left: "72%", top: "77%" },
];

export function CtaBand() {
  return (
    <section
      id="final-cta"
      className="relative flex flex-col justify-center overflow-hidden bg-ink-900 py-24 xl:min-h-[52rem]"
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
        <Reveal className="mx-auto max-w-2xl text-center">
          <LogoMark size={56} tone="white" animated className="mx-auto" />
          <h2 className="mt-7 text-[2.4rem] font-extrabold leading-[1.06] text-white sm:text-[3.2rem]">
            The average student saves 84 hours a year
            <span aria-hidden="true">*</span>
          </h2>
          <p className="mx-auto mt-5 max-w-md text-[1.08rem] leading-[1.6] text-sky-200/85">
            It only costs 4 minutes of your time.
          </p>
          {/* One button, and a wide one. A secondary "see what it does" here
              pointed back up a page the reader has just finished, and split the
              attention of the only ask that matters. */}
          <div className="mt-9 flex justify-center">
            <Button href="/#hero" variant="onInk" className="group px-14 py-4 text-[1.02rem]">
              Get set up
              <ArrowRight />
            </Button>
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
      className="absolute w-[17rem] motion-safe:animate-float-slow"
      style={{
        left: pair.left,
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
