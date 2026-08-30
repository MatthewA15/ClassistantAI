"use client";

import { useMemo, useState } from "react";
import { searchSchools, type School } from "@/data/schools";
import { useSchools } from "@/components/theme/SchoolTheme";
import { TextInput } from "@/components/onboarding/fields";
import { cn } from "@/lib/cn";

/**
 * Searchable school list.
 *
 * Schools we have not verified are listed but not selectable. Hiding them would
 * leave a student searching "Brock" with an empty box and no idea whether they
 * typed it wrong or the school is unsupported. Showing them, greyed, answers the
 * question and routes to the waitlist.
 */
export function SchoolPicker({
  value,
  onSelect,
  onUnsupported,
}: {
  value: School | null;
  onSelect: (school: School) => void;
  onUnsupported: (school: School) => void;
}) {
  const [query, setQuery] = useState("");
  const schools = useSchools();

  // No local sort any more. `listSchools` orders the collection by status and
  // then by name before it ever reaches the browser (lib/schools.ts), so
  // re-sorting here would be a second copy of that rule, free to disagree with
  // the first the next time either is edited.
  const results = useMemo(() => searchSchools(schools, query), [schools, query]);

  return (
    <div className="flex flex-col gap-3">
      <div className="relative">
        <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2">
          <svg width="17" height="17" viewBox="0 0 18 18" fill="none" aria-hidden="true">
            <circle cx="8" cy="8" r="5.6" stroke="var(--color-body-soft)" strokeWidth="1.7" />
            <path d="m12.4 12.4 3.1 3.1" stroke="var(--color-body-soft)" strokeWidth="1.7" strokeLinecap="round" />
          </svg>
        </span>
        <TextInput
          id="school-search"
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by school name or email domain"
          className="pl-11"
          autoComplete="off"
        />
      </div>

      {/* Native scrollbar rather than a fade mask: a mask would dim the last
          item even when the list is short enough not to scroll. `scrollbar-gutter`
          keeps the rows from shifting when the bar appears. */}
      <ul
        className="flex max-h-[23rem] flex-col gap-2 overflow-y-auto pr-1"
        style={{ scrollbarGutter: "stable" }}
      >
        {results.map((school) => {
          const selected = value?.id === school.id;
          const live = school.status === "live";
          return (
            <li key={school.id}>
              <button
                type="button"
                onClick={() => (live ? onSelect(school) : onUnsupported(school))}
                className={cn(
                  "flex w-full items-center gap-3.5 rounded-xl border p-3.5 text-left transition-all",
                  selected
                    ? "border-brand-500 bg-sky-50 ring-2 ring-brand-500/15"
                    : live
                      ? "border-line bg-white hover:border-sky-400 hover:bg-sky-50/60"
                      : "border-line-soft bg-paper hover:border-line",
                )}
              >
                <span
                  className={cn(
                    "grid h-9 w-9 shrink-0 place-items-center rounded-lg font-display text-[0.72rem] font-extrabold",
                    live ? "bg-sky-100 text-brand-600" : "bg-line-soft text-body-soft",
                  )}
                >
                  {school.province}
                </span>
                <span className="min-w-0 flex-1">
                  <span
                    className={cn(
                      "block truncate text-[0.92rem] font-semibold",
                      live ? "text-ink-900" : "text-body-soft",
                    )}
                  >
                    {school.name}
                  </span>
                  <span className="block truncate font-mono text-[0.75rem] text-body-soft">
                    @{school.emailDomain}
                  </span>
                </span>
                {live ? (
                  selected ? (
                    <SelectedTick />
                  ) : null
                ) : (
                  // "Soon" is a promise, so only a school we have actually
                  // confirmed on Google gets to make it. Everything else is
                  // "Not yet", which promises nothing.
                  <span
                    className={cn(
                      "shrink-0 rounded-md px-2 py-1 text-[0.66rem] font-semibold uppercase tracking-wide",
                      school.status === "soon"
                        ? "bg-sky-100 text-brand-600"
                        : "bg-line-soft text-body-soft",
                    )}
                  >
                    {school.status === "soon" ? "Soon" : "Not yet"}
                  </span>
                )}
              </button>
            </li>
          );
        })}

        {/*
          Two different empty states, and telling them apart is the whole reason
          lib/schools.ts refuses to fall back to a hardcoded list. An empty
          collection or a failed read is our problem, and saying "no match for
          Brock" when we never loaded a list at all would send the student off
          to check their spelling for a bug on our side.
        */}
        {results.length === 0 ? (
          <li className="rounded-xl border border-dashed border-line bg-paper p-5 text-center text-[0.88rem] text-body">
            {schools.length === 0 ? (
              <>
                We could not load the school list just now. Reload the page, and if it keeps
                happening it is our end, not yours.
              </>
            ) : (
              <>
                No match for &ldquo;{query}&rdquo;. Classistant only works where student email
                runs on Google, so the list is short on purpose.
              </>
            )}
          </li>
        ) : null}
      </ul>
    </div>
  );
}

function SelectedTick() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true" className="shrink-0">
      <circle cx="10" cy="10" r="10" fill="var(--color-brand-600)" />
      <path
        d="M5.8 10.2 8.2 12.6 14 6.9"
        stroke="white"
        strokeWidth="1.9"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
