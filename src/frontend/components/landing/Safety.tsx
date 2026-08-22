import Link from "next/link";
import { Container, Section, SectionHeading } from "@/components/ui/primitives";
import { Reveal } from "@/components/ui/Reveal";
import * as G from "@/components/landing/glyphs";

const POINTS = [
  {
    glyph: <G.Lock />,
    title: "Portal credentials are encrypted",
    body: "Your student portal login is stored encrypted and used only to sign in to your own school portal on your behalf. It is never shown back to you, and never sent anywhere else.",
  },
  {
    glyph: <G.Shield />,
    title: "Google access is scoped and revocable",
    body: "You grant mail, calendar, and Drive access through Google's own consent screen, and you can revoke it from your Google account settings at any time without asking us.",
  },
  {
    glyph: <G.Switch />,
    title: "You can stop it in one message",
    body: "Reply STOP to end texts, STOP CALLS to keep texts but drop calls, or DELETE to wipe your account and everything we hold about your term.",
  },
];

export function Safety() {
  return (
    <Section tone="paper">
      <Container>
        <Reveal>
          <SectionHeading
            label="What we can see"
            title="It needs real access, so here is exactly what that means"
            lead="Classistant cannot do this job without getting into your email and your school portal. That is a big ask, so we would rather be blunt about it than bury it in a policy page."
          />
        </Reveal>

        <div className="mt-14 grid gap-4 lg:grid-cols-3">
          {POINTS.map((point, i) => (
            <Reveal key={point.title} delay={i * 100}>
              <div className="h-full rounded-2xl bg-white p-7 shadow-soft ring-1 ring-line">
                <span className="grid h-11 w-11 place-items-center rounded-xl bg-sky-100">
                  {point.glyph}
                </span>
                <h3 className="mt-5 text-[1.05rem] font-bold text-ink-900">{point.title}</h3>
                <p className="mt-2.5 text-[0.92rem] leading-[1.65] text-body">{point.body}</p>
              </div>
            </Reveal>
          ))}
        </div>

        <Reveal delay={140}>
          <p className="mt-8 text-[0.9rem] text-body-soft">
            The long version is in our{" "}
            <Link href="/privacy" className="font-semibold text-brand-600 hover:underline">
              privacy policy
            </Link>
            , which lists every provider that touches your data and how long each one keeps it.
          </p>
        </Reveal>
      </Container>
    </Section>
  );
}
