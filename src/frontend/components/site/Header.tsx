"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Logo } from "@/components/brand/LogoMark";
import { Container } from "@/components/ui/primitives";
import { cn } from "@/lib/cn";

const NAV = [
  { href: "/#how", label: "How it works" },
  { href: "/#features", label: "What it does" },
  { href: "/#schools", label: "Schools" },
  { href: "/#faq", label: "FAQ" },
];

export function Header() {
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // Stop the page scrolling behind the open mobile sheet.
  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  return (
    <header
      className={cn(
        "sticky top-0 z-50 transition-all duration-300",
        scrolled ? "bg-white/85 shadow-[0_1px_0_rgb(217_232_247_/_1)] backdrop-blur-md" : "bg-transparent",
      )}
    >
      <Container>
        <div className="flex h-[4.5rem] items-center justify-between gap-4">
          <Link href="/" aria-label="Classistant home" className="group">
            <Logo size={34} className="transition-transform duration-300 group-hover:scale-[1.02]" />
          </Link>

          <nav className="hidden items-center gap-1 md:flex">
            {NAV.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="rounded-lg px-3.5 py-2 text-[0.92rem] font-medium text-body transition-colors hover:bg-sky-100 hover:text-ink-900"
              >
                {item.label}
              </Link>
            ))}
          </nav>

          <div className="hidden items-center gap-2 md:flex">
            <Link
              href="/onboarding"
              className="rounded-lg px-3.5 py-2 text-[0.92rem] font-semibold text-ink-800 transition-colors hover:bg-sky-100"
            >
              Sign in
            </Link>
            <Link
              href="/onboarding"
              className="rounded-xl bg-brand-600 px-4.5 py-2.5 text-[0.92rem] font-semibold text-white shadow-[0_10px_22px_-12px_rgb(11_99_229_/_0.9)] transition-colors hover:bg-brand-700"
            >
              Get set up
            </Link>
          </div>

          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
            aria-label={open ? "Close menu" : "Open menu"}
            className="grid h-10 w-10 place-items-center rounded-lg ring-1 ring-line md:hidden"
          >
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
              <path
                d={open ? "M5 5l10 10M15 5L5 15" : "M3 6h14M3 10h14M3 14h14"}
                stroke="var(--color-ink-900)"
                strokeWidth="1.8"
                strokeLinecap="round"
              />
            </svg>
          </button>
        </div>
      </Container>

      {open ? (
        <div className="border-t border-line bg-white md:hidden">
          <Container>
            <nav className="flex flex-col py-3">
              {NAV.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setOpen(false)}
                  className="rounded-lg px-3 py-3 text-[1rem] font-medium text-ink-800 hover:bg-sky-100"
                >
                  {item.label}
                </Link>
              ))}
              <Link
                href="/onboarding"
                onClick={() => setOpen(false)}
                className="mt-2 rounded-xl bg-brand-600 px-4 py-3 text-center text-[0.95rem] font-semibold text-white"
              >
                Get set up
              </Link>
            </nav>
          </Container>
        </div>
      ) : null}
    </header>
  );
}
