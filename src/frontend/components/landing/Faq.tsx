import { Container, Section, SectionHeading } from "@/components/ui/primitives";
import { Reveal } from "@/components/ui/Reveal";

const QUESTIONS = [
  {
    q: "Do I need to download anything?",
    a: "No. You do onboarding once on this site, then everything happens in your normal Messages app. There is a web dashboard if you want to check its work, but you never have to open it.",
  },
  {
    q: "Why do you need my student portal password?",
    a: "Course content, posted grades, and most syllabi live behind the portal login, and there is no API for them. Classistant signs in as you, in an isolated browser, to read those pages. The password is encrypted at rest and is only ever sent to your school's own login page.",
  },
  {
    q: "My school is not on the list. Can I still use it?",
    a: "Not yet. Classistant reads your mail and calendar through Google, so it only works where student mail runs on Google Workspace. Start onboarding anyway, search for your school, and we will tell you when it is supported.",
  },
  {
    q: "Will it text me in the middle of the night?",
    a: "No. You set quiet hours during onboarding and it holds anything non-urgent until morning. The only thing that can break quiet hours is a deadline inside the next few hours, and only if you asked it to.",
  },
  {
    q: "Will it do my assignments for me?",
    a: "No. It will not write your essays or submit work as you. It gets you to the desk on time, tells you what is due and what it is worth, and drafts routine email like extension requests and office hours bookings, which you approve before anything sends.",
  },
  {
    q: "Can I turn off the phone calls?",
    a: "Yes. Calls are opt in during setup, and you can drop them mid term by replying STOP CALLS. Texts keep working. Reply STOP to end everything.",
  },
  {
    q: "What does it cost?",
    a: "Nothing during early access. If we start charging, current students keep their term free and we will tell you well before the next one starts.",
  },
  {
    q: "What happens when the semester ends?",
    a: "It goes quiet. Course data from a finished term is kept so it can pace you better next semester, and you can wipe all of it at any time by replying DELETE or emailing us.",
  },
];

export function Faq() {
  return (
    <Section id="faq">
      <Container>
        <div className="grid gap-12 lg:grid-cols-[0.8fr_1.2fr] lg:gap-16">
          <Reveal>
            <SectionHeading
              label="Questions"
              title="What students ask first"
              lead="Not here? Email hello@classistant.ca and a person answers."
            />
          </Reveal>

          <Reveal delay={100}>
            <div className="divide-y divide-line border-y border-line">
              {QUESTIONS.map((item) => (
                <details key={item.q} className="group py-5">
                  <summary className="flex cursor-pointer list-none items-start justify-between gap-6 text-[1.02rem] font-semibold text-ink-900 transition-colors hover:text-brand-600 [&::-webkit-details-marker]:hidden">
                    {item.q}
                    <span
                      aria-hidden="true"
                      className="mt-1 grid h-6 w-6 shrink-0 place-items-center rounded-full bg-sky-100 text-brand-600 transition-transform duration-300 group-open:rotate-45"
                    >
                      <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                        <path d="M6 2.5v7M2.5 6h7" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                      </svg>
                    </span>
                  </summary>
                  <p className="mt-3 max-w-2xl pr-10 text-[0.95rem] leading-[1.7] text-body">
                    {item.a}
                  </p>
                </details>
              ))}
            </div>
          </Reveal>
        </div>
      </Container>
    </Section>
  );
}
