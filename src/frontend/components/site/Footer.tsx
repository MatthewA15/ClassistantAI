import Link from "next/link";
import { Logo } from "@/components/brand/LogoMark";
import { Container } from "@/components/ui/primitives";

const COLUMNS = [
  {
    title: "Product",
    links: [
      { href: "/#how", label: "How it works" },
      { href: "/#features", label: "What it does" },
      { href: "/onboarding", label: "Get set up" },
      // Deliberately below "Get set up" and not above it. This footer sits
      // under a marketing page whose entire job is to convert somebody who has
      // never heard of us; the returning student knows what they are looking
      // for and will find a second entry in the same column, whereas a new one
      // reading top to bottom should not meet "Sign in" first and wonder what
      // they were supposed to have signed up for.
      { href: "/signin", label: "Sign in" },
    ],
  },
  {
    title: "Company",
    links: [
      { href: "mailto:hello@classistant.ca", label: "Contact" },
      { href: "mailto:schools@classistant.ca", label: "Request your school" },
    ],
  },
  {
    title: "Legal",
    links: [
      { href: "/privacy", label: "Privacy policy" },
      { href: "/terms", label: "Terms of service" },
      { href: "/delete-my-data", label: "Delete my data" },
    ],
  },
];

/**
 * Same ink as the closing CTA above it, so the page ends on one uninterrupted
 * dark block instead of a dark band and then a light strip. No top border for
 * the same reason: with both sides the same colour there is no edge to draw.
 */
export function Footer() {
  return (
    <footer className="bg-ink-900">
      <Container>
        <div className="grid gap-10 py-14 sm:grid-cols-2 lg:grid-cols-[1.4fr_repeat(3,1fr)]">
          <div>
            <Logo size={34} tone="white" />
            <p className="mt-4 max-w-xs text-[0.9rem] leading-[1.6] text-sky-200/75">
              A school assistant that lives in your text messages. Built in Canada, for
              students at Canadian schools running on Google.
            </p>

            {/*
              The way back in for somebody who already has an account.

              Outlined rather than the filled white of Button's `onInk`, and
              that is not a style preference. The closing CTA band directly
              above this footer is one large filled button reading "Get set up",
              and the two surfaces are the same ink, so a second filled button a
              few centimetres below it competes with the page's actual ask. An
              outline reads as the secondary door it is: nobody arrives on the
              landing page looking for the sign-in button, and the people who do
              want it know they have an account already.

              It duplicates the "Sign in" link in the Product column on purpose,
              and only this once. That column is a site map, read by somebody
              scanning for a page name; this is a control, found by somebody who
              has scrolled to the bottom looking for a way in. The header's own
              CTA hides itself when the closing band is on screen for exactly
              the opposite reason -- two of the same ask at once -- and these
              two are far enough apart, and different enough in weight, that
              they read as one offer made twice rather than as the same button
              printed twice.
            */}
            <Link
              href="/signin"
              className="mt-6 inline-flex items-center justify-center gap-2 rounded-xl px-5 py-2.5 text-[0.9rem] font-semibold text-white ring-1 ring-white/25 transition-colors hover:bg-white/10 hover:ring-white/45"
            >
              Sign in
            </Link>
          </div>

          {COLUMNS.map((col) => (
            <div key={col.title}>
              <h3 className="text-[0.8rem] font-semibold uppercase tracking-[0.14em] text-white">
                {col.title}
              </h3>
              <ul className="mt-4 flex flex-col gap-2.5">
                {col.links.map((link) => (
                  <li key={link.label}>
                    <Link
                      href={link.href}
                      className="text-[0.9rem] text-sky-200/75 transition-colors hover:text-white"
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="flex flex-col gap-3 border-t border-white/12 py-7 text-[0.82rem] text-sky-200/60 sm:flex-row sm:items-center sm:justify-between">
          <p className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span>&copy; {new Date().getFullYear()} Classistant. All rights reserved.</span>
            <span aria-hidden="true" className="hidden text-white/25 sm:inline">
              &middot;
            </span>
            <a
              href="https://wopara.com"
              target="_blank"
              rel="noreferrer"
              className="font-semibold text-sky-200/85 transition-colors hover:text-white"
            >
              Designed by Wopara
            </a>
          </p>
          <p className="max-w-md sm:text-right">
            <span aria-hidden="true">*</span> The 84 hour figure is an estimate, based on time a
            sampled group of students reported spending organising their own schedules. Individual
            results vary.
            <br />
            Classistant is not affiliated with, endorsed by, or operated by any university,
            college, or Google LLC.
          </p>
        </div>
      </Container>
    </footer>
  );
}
