"use client";

import Link from "next/link";
import { useActionState, useEffect, useState } from "react";
import { joinWaitlist } from "@/app/onboarding/actions";
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
 * The CTA stays disabled until a school is chosen. The list is short, so the
 * choice is quick, and it means nobody starts onboarding only to find their
 * school is unsupported four steps in.
 *
 * A two-school list makes "not mine" the common case rather than the edge case,
 * so it gets a real answer instead of a dead end: the same composer, asking for
 * a school address, which is what tells us which campus to open next.
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
  /** True once the student has said their school is not on the list. */
  const [asking, setAsking] = useState(false);
  const [waitlist, submitWaitlist, sending] = useActionState(joinWaitlist, null);

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
            ? // Counted, never typed. This sentence used to say "six" and would
              // have quietly become a lie the moment the list changed.
              `Classistant is only supported at these ${LIVE_SCHOOLS.length} schools.`
            : ""}
      </p>

      <div className="mt-3 flex flex-wrap gap-2">
        {LIVE_SCHOOLS.map((s, i) => {
          const on = school?.id === s.id;
          return (
            <button
              key={s.id}
              type="button"
              onClick={() => {
                setSchool(on ? null : s.id);
                setAsking(false);
              }}
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

        {/* Sits in the same row as the chips, styled as an outline rather than
            a chip: it is the same kind of choice, but it is not a school. */}
        <button
          type="button"
          onClick={() => {
            setAsking((v) => !v);
            setNudge(0);
            if (!asking) setSchool(null);
          }}
          aria-expanded={asking}
          className={cn(
            "flex items-center gap-1.5 rounded-full border border-dashed py-1.5 pl-3 pr-3.5 text-[0.85rem] font-semibold transition-colors duration-300",
            asking
              ? "border-brand-600 text-brand-600"
              : "border-line text-body hover:border-brand-400 hover:text-ink-800",
          )}
        >
          <span aria-hidden="true" className="text-[1rem] leading-none">
            {asking ? "‹" : "+"}
          </span>
          {asking ? "Back to the list" : "Mine is not here"}
        </button>
      </div>

      {/* The CTA is a message composer, because the product is a thread. Locked,
          it holds placeholder text naming the step you skipped; once a school is
          picked the same bar holds a message you are about to send, and the send
          button lights up. The state change reads as "typed and ready" rather
          than as a button turning from grey to blue. */}
      <div className="mt-7">
        {asking ? (
          waitlist?.ok ? (
            <p className="max-w-[21.5rem] rounded-2xl bg-white/80 px-4 py-3 text-[0.88rem] leading-[1.55] text-ink-800 ring-1 ring-line">
              {waitlist.message}
            </p>
          ) : (
            // Same composer, different message. The student is still sending us
            // something, so the bar does not change shape just because what it
            // carries is an address rather than "i'm ready to start".
            <form
              action={submitWaitlist}
              className={cn(
                COMPOSER,
                waitlist?.errors?.email
                  ? "ring-2 ring-[var(--color-alert)]"
                  : "ring-1 ring-line focus-within:ring-brand-400",
              )}
            >
              <input
                type="email"
                name="email"
                required
                autoFocus
                placeholder="you@yourschool.ca"
                aria-label="Your school email address"
                aria-invalid={Boolean(waitlist?.errors?.email)}
                className="min-w-0 flex-1 bg-transparent font-medium text-ink-900 placeholder:font-normal placeholder:text-body-soft focus:outline-none"
              />
              <button type="submit" disabled={sending} aria-label="Send">
                <ComposerAction ready={!sending} />
              </button>
            </form>
          )
        ) : school ? (
          <Link
            href={`/onboarding?school=${school.id}`}
            className={cn(COMPOSER, "ring-1 ring-line hover:ring-brand-400")}
          >
            <span className="flex-1 truncate font-medium text-ink-900">
              i&rsquo;m ready to start for free
            </span>
            <ComposerAction ready />
          </Link>
        ) : (
          <button
            type="button"
            // aria-disabled, not `disabled`: a truly disabled control swallows
            // the click and gives no feedback at all. This one still responds,
            // and points at the step that is missing.
            aria-disabled="true"
            onClick={() => setNudge(1)}
            className={cn(
              COMPOSER,
              nudge > 0 ? "ring-2 ring-[var(--color-alert)]" : "ring-1 ring-line",
            )}
          >
            <span className="flex-1 truncate text-left text-body-soft">
              Pick a school above, then click here
            </span>
            <ComposerAction ready={false} />
          </button>
        )}
      </div>

      {asking && !waitlist?.ok ? (
        <p
          role="status"
          aria-live="polite"
          className={cn(
            "mt-4 max-w-sm text-[0.82rem] leading-[1.55]",
            waitlist?.errors?.email ? "font-semibold text-[var(--color-alert)]" : "text-body-soft",
          )}
        >
          {waitlist?.errors?.email ??
            "Your school address tells us which campus to open next. We will email you there the day it is ready."}
        </p>
      ) : school ? (
        <p className="mt-4 max-w-sm text-[0.82rem] leading-[1.55] text-body-soft">
          {/* school.note used to be appended here. It is per-school joining
              instructions ("sign in with your CCID"), which is advice for the
              moment someone is actually signing in, not for the moment they
              are choosing a school. It now sits under the Google button in the
              wizard, where it applies. */}
          Continuing as a{" "}
          <span className="font-semibold text-ink-800">{school.name}</span> student.
        </p>
      ) : null}
    </div>
  );
}

/**
 * Shared composer surface. No ring and no shadow here on purpose: those differ
 * per state, and a base value plus a branch value in one class list is resolved
 * by Tailwind's emission order rather than by the order they were written.
 */
const COMPOSER =
  "flex w-full max-w-[21.5rem] items-center gap-2 rounded-full bg-white py-1.5 pl-4 pr-1.5 text-[0.95rem] transition-all duration-300";

/**
 * The right-hand control in the bar, which is two different affordances in
 * iMessage rather than one control that dims.
 *
 * Empty, you get the bare voice-memo waveform in grey with no button behind it.
 * With something to send, that is replaced by a filled blue circle holding the
 * send arrow. Keeping the box the same size across both means the swap does not
 * shift the text beside it.
 */
function ComposerAction({ ready }: { ready: boolean }) {
  return (
    <span
      className={cn(
        "grid h-8 w-8 shrink-0 place-items-center rounded-full transition-colors duration-300",
        ready
          ? "bg-brand-600 text-white shadow-[0_6px_16px_-6px_var(--color-brand-600)]"
          : "text-body-soft",
      )}
    >
      {ready ? (
        <svg width="15" height="15" viewBox="0 0 20 20" fill="none" aria-hidden="true">
          <path
            d="M10 15.6V5M10 5 5.6 9.4M10 5l4.4 4.4"
            stroke="currentColor"
            strokeWidth="2.2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      ) : (
        <svg width="19" height="19" viewBox="0 0 20 20" fill="none" aria-hidden="true">
          <g stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
            <path d="M3.2 8.4v3.2" />
            <path d="M6.6 5.9v8.2" />
            <path d="M10 3.6v12.8" />
            <path d="M13.4 5.9v8.2" />
            <path d="M16.8 8.4v3.2" />
          </g>
        </svg>
      )}
    </span>
  );
}
