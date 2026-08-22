"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { GlowSlot, pillSurface } from "@/components/site/Pill";
import { cn } from "@/lib/cn";

/**
 * Section switcher in the header.
 *
 * A single pill next to the logo that names the section you are currently in
 * and opens a dropdown of the rest. It replaces a row of four flat links: with
 * a floating capsule header there is not much horizontal room, and a label that
 * tracks your scroll position tells you something the flat row never did.
 *
 * The first entry has no `id`. It stands for the top of the page and is the
 * resting state before you reach the first real section.
 */
const SECTIONS = [
  { id: null, label: "Overview" },
  { id: "how", label: "How it works" },
  { id: "features", label: "What it does" },
  { id: "schools", label: "Schools" },
  { id: "faq", label: "FAQ" },
] as const;

/** Distance below the viewport top at which a section counts as "current". */
const SPY_OFFSET = 150;

export function SectionNav({ scrolled = false }: { scrolled?: boolean }) {
  const pathname = usePathname();
  const isLanding = pathname === "/";

  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);

  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  // Scrollspy. Walks the sections and keeps the last one whose top has passed
  // the marker, so the label lands on a section as its heading reaches the
  // header rather than when the section merely enters the viewport.
  useEffect(() => {
    if (!isLanding) {
      setActive(0);
      return;
    }

    let frame = 0;

    const update = () => {
      frame = 0;
      const marker = window.scrollY + SPY_OFFSET;
      let current = 0;

      SECTIONS.forEach((section, i) => {
        if (!section.id) return;
        const el = document.getElementById(section.id);
        if (!el) return;
        const top = el.getBoundingClientRect().top + window.scrollY;
        if (top <= marker) current = i;
      });

      setActive(current);
    };

    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };

    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      if (frame) cancelAnimationFrame(frame);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, [isLanding]);

  // Close on outside pointer or Escape, returning focus to the button so
  // keyboard users are not dropped at the top of the document.
  useEffect(() => {
    if (!open) return;

    const onPointerDown = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        buttonRef.current?.focus();
      }
    };

    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  const goToTop = (e: React.MouseEvent) => {
    if (!isLanding) return;
    e.preventDefault();
    window.scrollTo({ top: 0, behavior: "smooth" });
    setOpen(false);
  };

  // Hidden while you are still in the hero. Naming the section you are in is
  // only useful once you are in one, and an "Overview" chip next to the logo on
  // first paint is a label for something the reader can already see.
  // Kept mounted (inert, faded) rather than unmounted so it can animate in and
  // so the scrollspy keeps running.
  const visible = active > 0;

  useEffect(() => {
    if (!visible) setOpen(false);
  }, [visible]);

  return (
    <div
      ref={rootRef}
      inert={!visible}
      className={cn(
        "relative hidden md:block",
        "transition-all duration-400 ease-[cubic-bezier(0.22,1,0.36,1)]",
        visible
          ? "translate-x-0 scale-100 opacity-100"
          : "pointer-events-none -translate-x-2 scale-95 opacity-0",
      )}
    >
      <GlowSlot scrolled={scrolled}>
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setOpen(true);
            requestAnimationFrame(() => {
              panelRef.current?.querySelector<HTMLAnchorElement>("a")?.focus();
            });
          }
        }}
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label={`Jump to a section, currently ${SECTIONS[active].label}`}
        className={cn(
          pillSurface(scrolled),
          "gap-2 pl-4 pr-3 text-[0.88rem] font-semibold text-ink-800",
          open && "text-ink-900",
        )}
      >
        {/* Fixed width, so the header does not twitch as the label changes
            length while you scroll. */}
        <span className="min-w-[6.6rem] text-left">{SECTIONS[active].label}</span>
        <svg
          width="14"
          height="14"
          viewBox="0 0 16 16"
          fill="none"
          aria-hidden="true"
          className={cn("shrink-0 transition-transform duration-300", open && "rotate-180")}
        >
          <path
            d="M4 6.25 8 10.25l4-4"
            stroke="currentColor"
            strokeWidth="1.9"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>

      {open ? (
        <div
          ref={panelRef}
          role="menu"
          aria-label="Sections"
          // Fully opaque, not white/95: the menu overlays the hero headline, and
          // even 5% transparency ghosts 3rem type through behind the items.
          className="absolute left-0 top-[calc(100%+0.6rem)] w-[15rem] rounded-[1.4rem] bg-white p-1.5 shadow-lift ring-1 ring-line"
          style={{ animation: "bubble-in .22s var(--ease-out-soft) both" }}
        >
          {SECTIONS.map((section, i) => {
            const isActive = i === active;
            return (
              <Link
                key={section.label}
                role="menuitem"
                href={section.id ? `/#${section.id}` : "/"}
                onClick={section.id ? () => setOpen(false) : goToTop}
                className={cn(
                  "flex items-center rounded-full px-4 py-2.5 text-[0.9rem] transition-colors",
                  isActive
                    ? "bg-sky-100 font-semibold text-ink-900"
                    : "font-medium text-body hover:bg-ink-900/5 hover:text-ink-900",
                )}
              >
                {/* The current item is already carried by its fill and weight;
                    a dot on top of that was one signal too many. */}
                {section.label}
              </Link>
            );
          })}
        </div>
      ) : null}
      </GlowSlot>
    </div>
  );
}

/** Same destinations, rendered flat for the mobile sheet. */
export const NAV_SECTIONS = SECTIONS;
