"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Logo } from "@/components/brand/LogoMark";
import { NAV_SECTIONS, SectionNav } from "@/components/site/SectionNav";
import { cn } from "@/lib/cn";

/**
 * Floating pill header.
 *
 * It sits detached from the top of the viewport rather than spanning the full
 * width, so the page reads as sliding underneath it. Two morphing blobs of dark
 * blue sit behind the pill and are blurred hard enough to read as emitted light
 * rather than as shapes. The pill itself stays a true `rounded-full` capsule:
 * morphing its radius was tried and is invisible at 64px tall, so the motion
 * lives entirely in the light behind it.
 *
 * See docs/design/06-motion-and-svg.md.
 */
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
    // pointer-events-none on the wrapper so the transparent gutter around the
    // pill never swallows clicks meant for the page underneath.
    <header className="pointer-events-none sticky top-0 z-50 px-3 pt-4 sm:px-6 sm:pt-6">
      <div className="relative mx-auto max-w-[73rem]">
        <GlowField scrolled={scrolled} />

        <div
          className={cn(
            "pointer-events-auto relative flex h-16 items-center justify-between gap-4 rounded-full pl-5 pr-3 transition-all duration-500 ease-[cubic-bezier(0.22,1,0.36,1)]",
            "backdrop-blur-xl",
            scrolled
              ? "bg-white/90 shadow-[0_10px_40px_-12px_rgb(6_32_58_/_0.42)] ring-1 ring-white/70"
              : "bg-white/65 shadow-[0_8px_32px_-14px_rgb(6_32_58_/_0.3)] ring-1 ring-white/55",
          )}
        >
          {/* Logo and section switcher travel together on the left. */}
          <div className="flex min-w-0 items-center gap-3">
            <Link href="/" aria-label="Classistant home" className="group shrink-0">
              <Logo size={32} className="transition-transform duration-300 group-hover:scale-[1.03]" />
            </Link>
            <SectionNav />
          </div>

          <div className="hidden shrink-0 items-center gap-1.5 md:flex">
            <Link
              href="/onboarding"
              className="rounded-full px-3.5 py-2 text-[0.9rem] font-semibold text-ink-800 transition-colors hover:bg-ink-900/6"
            >
              Sign in
            </Link>
            <Link
              href="/onboarding"
              className="rounded-full bg-ink-900 px-5 py-2.5 text-[0.9rem] font-semibold text-white shadow-[0_8px_20px_-8px_rgb(6_32_58_/_0.8)] transition-all duration-200 hover:bg-ink-800 hover:shadow-[0_10px_26px_-8px_rgb(6_32_58_/_0.9)]"
            >
              Get set up
            </Link>
          </div>

          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
            aria-label={open ? "Close menu" : "Open menu"}
            className="grid h-10 w-10 shrink-0 place-items-center rounded-full ring-1 ring-line transition-colors hover:bg-ink-900/6 md:hidden"
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

        {open ? (
          <div className="pointer-events-auto relative mt-2 rounded-[1.75rem] bg-white/95 p-2 shadow-lift ring-1 ring-white/70 backdrop-blur-xl md:hidden">
            <nav className="flex flex-col">
              {NAV_SECTIONS.filter((item) => item.id).map((item) => (
                <Link
                  key={item.label}
                  href={`/#${item.id}`}
                  onClick={() => setOpen(false)}
                  className="rounded-full px-4 py-3 text-[1rem] font-medium text-ink-800 hover:bg-ink-900/6"
                >
                  {item.label}
                </Link>
              ))}
              <Link
                href="/onboarding"
                onClick={() => setOpen(false)}
                className="mt-1 rounded-full bg-ink-900 px-4 py-3 text-center text-[0.95rem] font-semibold text-white"
              >
                Get set up
              </Link>
            </nav>
          </div>
        ) : null}
      </div>
    </header>
  );
}

/**
 * The light behind the pill. Two blobs on different durations and offset
 * delays, so their overlap never repeats on a short cycle.
 */
function GlowField({ scrolled }: { scrolled: boolean }) {
  return (
    <div
      aria-hidden="true"
      className={cn(
        "absolute -inset-x-5 -bottom-7 -top-4 -z-10 transition-opacity duration-700",
        scrolled ? "opacity-100" : "opacity-75",
      )}
    >
      {/* Wide, low-opacity bed. This is what actually reads as light spilling
          out from under the pill, so it is the widest and the most blurred. */}
      <div
        className="absolute inset-x-[6%] top-[30%] h-[95%] rounded-full bg-brand-600/40 blur-[46px] motion-safe:animate-glow-morph"
        style={{ animationDuration: "22s" }}
      />
      {/* Two navy blobs drifting across it, for depth and colour variation. */}
      <div
        className="absolute left-[2%] top-0 h-full w-[54%] bg-ink-800/60 blur-[40px] motion-safe:animate-glow-morph"
        style={{ animationDuration: "18s", animationDelay: "-3s" }}
      />
      <div
        className="absolute right-[1%] top-[8%] h-full w-[50%] bg-ink-700/55 blur-[44px] motion-safe:animate-glow-morph"
        style={{ animationDuration: "29s", animationDelay: "-11s" }}
      />
    </div>
  );
}
