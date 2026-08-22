"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { LogoMark } from "@/components/brand/LogoMark";
import { GlowSlot, pillSurface } from "@/components/site/Pill";
import { NAV_SECTIONS, SectionNav } from "@/components/site/SectionNav";
import { cn } from "@/lib/cn";

/**
 * Header built as three separate floating pills rather than one long bar:
 * brand, section switcher, and the call to action, each its own capsule with
 * its own morphing light behind it.
 *
 * One wide bar reads as a lid on the page. Three capsules read as objects
 * hovering over it, and they let the middle pill appear and disappear with the
 * scrollspy without leaving a hole in a container.
 *
 * Over the hero there is no header at all: the hero already carries the brand,
 * the pitch, and a bigger CTA, so a bar on top of it is duplication.
 */
export function Header({ overHero = false }: { overHero?: boolean }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [pastHero, setPastHero] = useState(false);

  useEffect(() => {
    const onScroll = () => {
      setScrolled(window.scrollY > 8);
      const hero = document.getElementById("hero");
      setPastHero(hero ? hero.getBoundingClientRect().bottom <= 96 : true);
    };

    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, [pathname]);

  const hidden = overHero && !pastHero;

  /** On the landing page, scroll back to the hero's picker instead of routing. */
  const backToHero = (e: React.MouseEvent) => {
    setOpen(false);
    if (pathname !== "/") return;
    e.preventDefault();
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  useEffect(() => {
    if (hidden) setOpen(false);
  }, [hidden]);

  return (
    <>
      {/* fixed, not sticky: a header that appears on scroll must not reserve a
          band of empty space at the top of the hero. */}
      <header
        inert={hidden}
        className={cn(
          "pointer-events-none fixed inset-x-0 top-0 z-50 px-3 pt-4 sm:px-6 sm:pt-6",
          "transition-all duration-500 ease-[cubic-bezier(0.22,1,0.36,1)]",
          hidden ? "-translate-y-[135%] opacity-0" : "translate-y-0 opacity-100",
        )}
      >
        {/* Three sibling capsules, all h-11, each its own single pill. The
            brand mark and wordmark are sized to match the other pills' text,
            so nothing in the row shouts louder than the rest. */}
        <div className="mx-auto flex max-w-[73rem] items-center gap-2 sm:gap-2.5">
          <GlowSlot scrolled={scrolled}>
            <Link
              href="/"
              aria-label="Classistant home"
              className={cn(pillSurface(scrolled), "group gap-2 px-4")}
            >
              <LogoMark size={21} className="transition-transform duration-300 group-hover:scale-[1.05]" />
              <span className="font-display text-[0.88rem] font-extrabold tracking-[-0.03em] text-ink-900">
                Classistant
              </span>
            </Link>
          </GlowSlot>

          <SectionNav scrolled={scrolled} />

          <span className="flex-1" />

          {/* Setup starts by picking a school, and that picker lives in the
              hero, so this goes back there rather than jumping into a flow that
              would immediately ask the same question. */}
          <GlowSlot scrolled={scrolled} className="hidden md:block">
            <Link
              href="/"
              onClick={backToHero}
              className={cn(pillSurface(scrolled, "ink"), "px-5 text-[0.88rem] font-semibold")}
            >
              Get set up
            </Link>
          </GlowSlot>

          <GlowSlot scrolled={scrolled} className="md:hidden">
            <button
              type="button"
              onClick={() => setOpen((v) => !v)}
              aria-expanded={open}
              aria-label={open ? "Close menu" : "Open menu"}
              className={cn(pillSurface(scrolled), "w-11 justify-center")}
            >
              <svg width="19" height="19" viewBox="0 0 20 20" fill="none" aria-hidden="true">
                <path
                  d={open ? "M5 5l10 10M15 5L5 15" : "M3 6h14M3 10h14M3 14h14"}
                  stroke="var(--color-ink-900)"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                />
              </svg>
            </button>
          </GlowSlot>
        </div>

        {open ? (
          <div className="mx-auto mt-2 max-w-[73rem] md:hidden">
            <div className="pointer-events-auto rounded-[1.75rem] bg-white/95 p-2 shadow-lift ring-1 ring-line backdrop-blur-xl">
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
                  href="/"
                  onClick={backToHero}
                  className="mt-1 rounded-full bg-ink-900 px-4 py-3 text-center text-[0.95rem] font-semibold text-white"
                >
                  Get set up
                </Link>
              </nav>
            </div>
          </div>
        ) : null}
      </header>

      {overHero ? null : <div aria-hidden="true" className="h-20 sm:h-[5.5rem]" />}
    </>
  );
}
