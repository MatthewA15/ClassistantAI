"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { LogoMark } from "@/components/brand/LogoMark";
import { GlowSlot, pillSurface } from "@/components/site/Pill";
import { SectionNav } from "@/components/site/SectionNav";
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
 * All three are present on phones too. There is no hamburger: the menu it
 * opened held the same two sections the switcher already lists plus the button
 * sitting next to it, so it was a tap costing a tap. Three pills fit across a
 * 320px screen once the brand capsule drops to the mark alone, which is the
 * trade that makes this work.
 *
 * Over the hero there is no header at all: the hero already carries the brand,
 * the pitch, and a bigger CTA, so a bar on top of it is duplication.
 */
export function Header({ overHero = false }: { overHero?: boolean }) {
  const pathname = usePathname();
  const [scrolled, setScrolled] = useState(false);
  const [pastHero, setPastHero] = useState(false);
  // True once the closing CTA is properly on screen. The header hides its own
  // button then: two "Get set up" buttons visible at once is the same ask twice.
  const [atFinalCta, setAtFinalCta] = useState(false);

  useEffect(() => {
    const onScroll = () => {
      setScrolled(window.scrollY > 8);
      const hero = document.getElementById("hero");
      setPastHero(hero ? hero.getBoundingClientRect().bottom <= 96 : true);

      const cta = document.getElementById("final-cta");
      setAtFinalCta(cta ? cta.getBoundingClientRect().top < window.innerHeight * 0.72 : false);
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
    if (pathname !== "/") return;
    e.preventDefault();
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

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
        <div className="mx-auto flex max-w-[73rem] items-center gap-1.5 sm:gap-2.5">
          <GlowSlot scrolled={scrolled}>
            <Link
              href="/"
              aria-label="Classistant home"
              className={cn(
                pillSurface(scrolled),
                // Mark alone on phones, as a circle the same height as its
                // siblings. The wordmark is ~80px, which is most of the room
                // the other two pills need; the hero one scroll above already
                // spells the name out.
                "group w-11 justify-center gap-2 sm:w-auto sm:justify-start sm:px-4",
              )}
            >
              <LogoMark size={21} className="transition-transform duration-300 group-hover:scale-[1.05]" />
              <span className="hidden font-display text-[0.88rem] font-extrabold tracking-[-0.03em] text-ink-900 sm:inline">
                Classistant
              </span>
            </Link>
          </GlowSlot>

          <SectionNav scrolled={scrolled} />

          <span className="flex-1" />

          {/* Setup starts by picking a school, and that picker lives in the
              hero, so this goes back there rather than jumping into a flow that
              would immediately ask the same question. */}
          <GlowSlot
            scrolled={scrolled}
            className={cn(
              "transition-all duration-400 ease-[cubic-bezier(0.22,1,0.36,1)]",
              atFinalCta ? "pointer-events-none scale-95 opacity-0" : "scale-100 opacity-100",
            )}
          >
            <Link
              href="/"
              onClick={backToHero}
              {...(atFinalCta ? { tabIndex: -1, "aria-hidden": true } : {})}
              className={cn(
                pillSurface(scrolled, "ink"),
                "whitespace-nowrap px-3.5 text-[0.82rem] font-semibold sm:px-5 sm:text-[0.88rem]",
              )}
            >
              Get set up
            </Link>
          </GlowSlot>
        </div>
      </header>

      {overHero ? null : <div aria-hidden="true" className="h-20 sm:h-[5.5rem]" />}
    </>
  );
}
