import { Button, Container, ArrowRight } from "@/components/ui/primitives";
import { LogoMark } from "@/components/brand/LogoMark";
import { Reveal } from "@/components/ui/Reveal";

export function CtaBand() {
  return (
    <section className="relative overflow-hidden bg-ink-900 py-24">
      <div aria-hidden="true" className="pointer-events-none absolute inset-0">
        <div className="absolute left-1/2 top-1/2 h-[38rem] w-[38rem] -translate-x-1/2 -translate-y-1/2 rounded-full bg-brand-600/25 blur-[130px]" />
        <svg className="absolute left-1/2 top-1/2 h-[26rem] w-[26rem] -translate-x-1/2 -translate-y-1/2" viewBox="0 0 300 300" fill="none">
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

      <Container className="relative">
        <Reveal className="mx-auto max-w-2xl text-center">
          <LogoMark size={56} tone="white" animated className="mx-auto" />
          <h2 className="mt-7 text-[2.4rem] font-extrabold leading-[1.06] text-white sm:text-[3.2rem]">
            Set it up before the syllabi pile up
          </h2>
          <p className="mx-auto mt-5 max-w-md text-[1.08rem] leading-[1.6] text-sky-200/85">
            Four minutes now. Free in early access.
          </p>
          <div className="mt-9 flex flex-wrap items-center justify-center gap-3">
            <Button href="/onboarding" variant="onInk" className="group">
              Get set up
              <ArrowRight />
            </Button>
            <Button
              href="/#features"
              variant="ghost"
              className="text-sky-200 hover:bg-ink-800 hover:text-white"
            >
              See what it does
            </Button>
          </div>
        </Reveal>
      </Container>
    </section>
  );
}
