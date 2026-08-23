import type { ReactNode } from "react";
import { Header } from "@/components/site/Header";
import { Footer } from "@/components/site/Footer";
import { Container } from "@/components/ui/primitives";

export type LegalSection = { id: string; heading: string; body: ReactNode };

/**
 * Shared shell for the privacy policy and terms.
 *
 * Sections are passed as data so both documents get the same anchor links,
 * sticky contents rail, and heading rhythm, and so nothing drifts between them.
 */
export function LegalLayout({
  title,
  intro,
  lastUpdated,
  sections,
}: {
  title: string;
  intro: ReactNode;
  lastUpdated: string;
  sections: LegalSection[];
}) {
  return (
    <>
      <Header />
      <main id="main" className="bg-white">
        <div className="border-b border-line bg-paper py-14 sm:py-20">
          <Container>
            <h1 className="text-[2.2rem] font-extrabold leading-tight text-ink-900 sm:text-[2.8rem]">
              {title}
            </h1>
            <p className="mt-3 text-[0.88rem] font-medium text-body-soft">
              Last updated {lastUpdated}
            </p>
            <div className="mt-6 max-w-2xl text-[1.02rem] leading-[1.7] text-body">{intro}</div>
          </Container>
        </div>

        <Container className="py-14 sm:py-20">
          <div className="grid gap-12 lg:grid-cols-[16rem_1fr] lg:gap-16">
            <nav aria-label="On this page" className="lg:sticky lg:top-28 lg:self-start">
              <p className="text-[0.78rem] font-semibold uppercase tracking-[0.16em] text-ink-900">
                On this page
              </p>
              <ol className="mt-4 flex flex-col gap-2 border-l border-line pl-4">
                {sections.map((section, i) => (
                  <li key={section.id}>
                    <a
                      href={`#${section.id}`}
                      className="text-[0.86rem] leading-[1.5] text-body transition-colors hover:text-brand-600"
                    >
                      {i + 1}. {section.heading}
                    </a>
                  </li>
                ))}
              </ol>
            </nav>

            <div className="min-w-0 max-w-3xl">
              {sections.map((section, i) => (
                <section key={section.id} id={section.id} className="scroll-mt-28 pb-10">
                  <h2 className="text-[1.35rem] font-bold leading-snug text-ink-900">
                    {i + 1}. {section.heading}
                  </h2>
                  <div className="legal-body mt-4 flex flex-col gap-4 text-[0.97rem] leading-[1.75] text-body">
                    {section.body}
                  </div>
                </section>
              ))}
            </div>
          </div>
        </Container>
      </main>
      <Footer />
    </>
  );
}

/** Bulleted list with the site's tick marker, used throughout both documents. */
export function LegalList({ items }: { items: ReactNode[] }) {
  return (
    <ul className="flex flex-col gap-2.5">
      {items.map((item, i) => (
        <li key={i} className="flex items-start gap-3">
          <span aria-hidden="true" className="mt-2.5 h-1.5 w-1.5 shrink-0 rounded-full bg-sky-400" />
          <span>{item}</span>
        </li>
      ))}
    </ul>
  );
}

export function Strong({ children }: { children: ReactNode }) {
  return <strong className="font-semibold text-ink-900">{children}</strong>;
}
