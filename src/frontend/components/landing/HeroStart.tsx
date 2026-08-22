"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useSchoolTheme } from "@/components/theme/SchoolTheme";
import { LIVE_SCHOOLS, schoolInitials, type School } from "@/data/schools";
import { cn } from "@/lib/cn";

/**
 * Brand-coloured monogram standing in for the school's logo.
 *
 * We do not ship university logos. They are trademarks, and a redrawn
 * approximation is both a legal problem and an obvious fake to any student who
 * knows the real one. Initials in the school's own published colour say the
 * same thing and claim nothing. Drop a licensed asset into `school.logo` and
 * this swaps to an <img> without touching the layout.
 */
function SchoolCrest({ school, active }: { school: School; active: boolean }) {
  const primary = school.brand?.primary ?? "var(--color-ink-800)";
  return (
    <span
      aria-hidden="true"
      className={cn(
        "grid h-6 w-6 shrink-0 place-items-center rounded-[0.45rem] text-[0.5rem] font-extrabold leading-none transition-colors duration-300",
        active ? "bg-white/20 text-white" : "text-white",
      )}
      style={active ? undefined : { backgroundColor: primary }}
    >
      {school.logo ? (
        <img src={school.logo} alt="" className="h-full w-full rounded-[0.45rem] object-contain" />
      ) : (
        schoolInitials(school.name)
      )}
    </span>
  );
}

/**
 * Picking your school IS step one of getting started, so it happens here rather
 * than on a separate screen. The site immediately repaints in that school's own
 * colours, which does two jobs at once: it confirms we recognised the school,
 * and it shows the product is built for that specific campus rather than being
 * a generic tool with a Canadian flag on it.
 *
 * The CTA stays disabled until a school is chosen. The list is only six long,
 * so the choice is quick, and it means nobody starts onboarding only to find
 * their school is unsupported four steps in.
 */
export function HeroStart() {
  const { school, setSchool } = useSchoolTheme();
  /**
   * Reaching for the locked CTA runs a two-beat explanation rather than a dead
   * click. Beat one names the step you skipped; beat two answers the question
   * that prompts, which is "why only these", and walks the eye across the list
   * one button at a time.
   *
   * 0 idle, 1 "pick your school", 2 "only these schools" plus the hop.
   */
  const [nudge, setNudge] = useState<0 | 1 | 2>(0);

  useEffect(() => {
    if (nudge !== 1) return;
    const toSecond = setTimeout(() => setNudge(2), 3000);
    return () => clearTimeout(toSecond);
  }, [nudge]);

  useEffect(() => {
    if (nudge !== 2) return;
    const done = setTimeout(() => setNudge(0), 3000);
    return () => clearTimeout(done);
  }, [nudge]);

  return (
    <div>
      <p
        // Weight lives only in the branches. Putting font-semibold in the base
        // and font-extrabold in the branch lets Tailwind's own emission order
        // decide the winner, and semibold silently won.
        className={cn(
          "uppercase tracking-[0.16em] transition-all duration-500 ease-[cubic-bezier(0.22,1,0.36,1)]",
          nudge > 0
            ? "text-[1.17rem] font-extrabold text-ink-900"
            : "text-[0.78rem] font-semibold text-body-soft",
        )}
      >
        {nudge === 2 ? "Only supported in these schools" : "Pick your school"}
      </p>

      <p role="status" aria-live="polite" className="sr-only">
        {nudge === 1
          ? "Pick your school before continuing."
          : nudge === 2
            ? "Classistant is only supported at these six schools."
            : ""}
      </p>

      <div className="mt-3 flex flex-wrap gap-2">
        {LIVE_SCHOOLS.map((s, i) => {
          const on = school?.id === s.id;
          return (
            <button
              key={s.id}
              type="button"
              onClick={() => setSchool(on ? null : s.id)}
              aria-pressed={on}
              // Hop in list order during beat two, so the eye is walked across
              // the full set rather than being told it is short.
              style={
                nudge === 2
                  ? { animation: `button-jump .55s var(--ease-out-soft) ${i * 0.32}s both` }
                  : undefined
              }
              className={cn(
                "flex items-center gap-2 rounded-full py-1.5 pl-1.5 pr-3.5 text-[0.85rem] font-semibold transition-all duration-300",
                on
                  ? "bg-brand-600 text-white shadow-[0_8px_20px_-8px_var(--color-brand-600)]"
                  : "bg-white text-ink-800 ring-1 ring-line hover:ring-brand-400",
                nudge > 0 && !on && "ring-2 ring-[var(--color-alert)]",
              )}
            >
              <SchoolCrest school={s} active={on} />
              {/* Full legal name, never the abbreviation. "U of A" and "MUN"
                  are unambiguous on campus and meaningless off it, and this is
                  the moment a student confirms we mean their school. */}
              {s.name}
            </button>
          );
        })}
      </div>

      <div className="mt-7 flex flex-wrap items-center gap-3">
        {school ? (
          <Link
            href={`/onboarding?school=${school.id}`}
            className="inline-flex items-center justify-center rounded-xl bg-brand-600 px-5 py-3 text-[0.95rem] font-semibold text-white shadow-[0_10px_24px_-10px_var(--color-brand-600)] transition-colors duration-200 hover:bg-brand-700"
          >
            Get set up
          </Link>
        ) : (
          <button
            type="button"
            // aria-disabled, not `disabled`: a truly disabled button swallows
            // the click and gives no feedback at all. This one still responds,
            // and points at the step that is missing.
            aria-disabled="true"
            onClick={() => setNudge(1)}
            className={cn(
              "flex items-center gap-2 rounded-xl px-5 py-3 text-[0.95rem] font-semibold transition-all duration-300",
              nudge > 0
                ? "bg-line text-ink-800 ring-2 ring-[var(--color-alert)]"
                : "bg-line text-body-soft",
            )}
          >
            <LockGlyph />
            Get set up
          </button>
        )}
      </div>

      {school ? (
        <p className="mt-4 max-w-sm text-[0.82rem] leading-[1.55] text-body-soft">
          Continuing as a{" "}
          <span className="font-semibold text-ink-800">{school.name}</span> student.
          {school.note ? ` ${school.note}` : ""}
        </p>
      ) : null}
    </div>
  );
}

function LockGlyph() {
  return (
    <svg width="15" height="15" viewBox="0 0 20 20" fill="none" aria-hidden="true" className="shrink-0">
      <rect x="4" y="8.6" width="12" height="8.4" rx="2.2" stroke="currentColor" strokeWidth="1.7" />
      <path d="M7 8.4V6.6a3 3 0 0 1 6 0v1.8" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    </svg>
  );
}
