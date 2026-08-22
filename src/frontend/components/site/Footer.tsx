import Link from "next/link";
import { Logo } from "@/components/brand/LogoMark";
import { Container } from "@/components/ui/primitives";

const COLUMNS = [
  {
    title: "Product",
    links: [
      { href: "/#how", label: "How it works" },
      { href: "/#features", label: "What it does" },
      { href: "/#schools", label: "Supported schools" },
      { href: "/onboarding", label: "Get set up" },
    ],
  },
  {
    title: "Company",
    links: [
      { href: "/#faq", label: "FAQ" },
      { href: "mailto:hello@classistant.ca", label: "Contact" },
      { href: "mailto:schools@classistant.ca", label: "Request your school" },
    ],
  },
  {
    title: "Legal",
    links: [
      { href: "/privacy", label: "Privacy policy" },
      { href: "/terms", label: "Terms of service" },
      { href: "mailto:privacy@classistant.ca", label: "Delete my data" },
    ],
  },
];

export function Footer() {
  return (
    <footer className="border-t border-line bg-paper">
      <Container>
        <div className="grid gap-10 py-14 sm:grid-cols-2 lg:grid-cols-[1.4fr_repeat(3,1fr)]">
          <div>
            <Logo size={34} />
            <p className="mt-4 max-w-xs text-[0.9rem] leading-[1.6] text-body">
              A school assistant that lives in your text messages. Built in Canada, for
              students at Canadian schools running on Google.
            </p>
          </div>

          {COLUMNS.map((col) => (
            <div key={col.title}>
              <h3 className="text-[0.8rem] font-semibold uppercase tracking-[0.14em] text-ink-900">
                {col.title}
              </h3>
              <ul className="mt-4 flex flex-col gap-2.5">
                {col.links.map((link) => (
                  <li key={link.label}>
                    <Link
                      href={link.href}
                      className="text-[0.9rem] text-body transition-colors hover:text-brand-600"
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="flex flex-col gap-3 border-t border-line py-7 text-[0.82rem] text-body-soft sm:flex-row sm:items-center sm:justify-between">
          <p>&copy; {new Date().getFullYear()} Classistant. All rights reserved.</p>
          <p>
            Classistant is not affiliated with, endorsed by, or operated by any university,
            college, or Google LLC.
          </p>
        </div>
      </Container>
    </footer>
  );
}
