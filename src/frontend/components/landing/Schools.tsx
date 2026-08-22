import Link from "next/link";
import { Container, Section, SectionHeading } from "@/components/ui/primitives";
import { Reveal } from "@/components/ui/Reveal";
import { LIVE_SCHOOLS } from "@/data/schools";

export function Schools() {
  return (
    <Section id="schools">
      <Container>
        <div className="grid gap-12 lg:grid-cols-[0.95fr_1.05fr] lg:gap-16">
          <Reveal>
            <SectionHeading
              label="Where it works"
              title="Canadian schools running on Google"
              lead="Classistant signs in with Google and reads your mail, calendar, and Drive through it. That only works if your student mailbox is a Google mailbox, so the list is deliberately short and we check each one against the school's own IT pages."
            />
            <p className="mt-7 text-[0.95rem] leading-[1.65] text-body">
              Not seeing yours? Start onboarding anyway. You can search every Canadian school
              we track and get added to the list for the ones that are not live yet.
            </p>
            <Link
              href="/onboarding"
              className="mt-5 inline-flex items-center gap-2 text-[0.95rem] font-semibold text-brand-600 hover:text-brand-700"
            >
              Check your school
              <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                <path
                  d="M3 8h9m0 0L8.5 4.5M12 8l-3.5 3.5"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </Link>
          </Reveal>

          <div className="grid gap-3 sm:grid-cols-2">
            {LIVE_SCHOOLS.map((school, i) => (
              <Reveal key={school.id} delay={i * 70}>
                <div className="flex h-full items-start gap-3.5 rounded-2xl bg-white p-5 shadow-soft ring-1 ring-line">
                  <span className="mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-sky-100 font-display text-[0.8rem] font-extrabold text-brand-600">
                    {school.province}
                  </span>
                  <span className="min-w-0">
                    <span className="block text-[0.95rem] font-bold leading-snug text-ink-900">
                      {school.name}
                    </span>
                    <span className="mt-1 block truncate font-mono text-[0.78rem] text-body-soft">
                      @{school.emailDomain}
                    </span>
                    {school.note ? (
                      <span className="mt-2 block text-[0.76rem] leading-[1.5] text-body-soft">
                        {school.note}
                      </span>
                    ) : null}
                  </span>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </Container>
    </Section>
  );
}
