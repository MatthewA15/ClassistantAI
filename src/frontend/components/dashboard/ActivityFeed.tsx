"use client";

import { useMemo, useState } from "react";

import { EmptyState } from "@/components/dashboard/ui";
import {
  ACTIVITY_KINDS,
  activityKind,
  formatTime,
  groupByDay,
  type ActivityEntry,
  type ActivityKind,
  type ActivityStatus,
} from "@/data/activity";
import { cn } from "@/lib/cn";

/**
 * The task history: what Classistant has actually done on this account.
 *
 * ## Filtering is client side, and that is not laziness
 *
 * The page reads at most ACTIVITY_PAGE_SIZE rows, which is sixty. Sixty objects
 * of five short fields is a few kilobytes, and filtering them in the browser is
 * instant and works offline on a page already loaded. The alternative is a
 * round trip and a Firestore composite index on `(kind, at)` per filter, for a
 * result the client already has in memory.
 *
 * It does mean the chips filter the page rather than the history: a student
 * with two terms of activity who filters to "Calls" sees the calls within their
 * last sixty rows, not every call they have ever received. The footer says so
 * when the page is full, because a filtered view that silently omits matches is
 * the kind of quiet wrongness that makes someone stop trusting a log.
 */
export function ActivityFeed({
  entries,
  timezone,
  truncated,
  filterable = true,
}: {
  entries: ActivityEntry[];
  timezone: string;
  /** Whether the read came back full, meaning there is older history this page
   *  is not showing. */
  truncated: boolean;
  /**
   * Off for the overview's five row preview.
   *
   * A filter is a promise that the set below it is the set being filtered, and
   * on a preview that is false in a way a student cannot see: filtering five
   * rows to "Calls" would show the calls among the last five things that
   * happened, which is almost always none, on a card that gives no hint it is
   * not the whole history. The "See all" beside it is the correct control
   * there.
   */
  filterable?: boolean;
}) {
  const [filter, setFilter] = useState<ActivityKind | "all">("all");

  // Only the kinds that actually occur. A chip for "Outlines" on an account
  // that has never had one is a filter whose only possible result is an empty
  // list, and a row of eight chips where three do anything is worse at its job
  // than a row of five that all do.
  const present = useMemo(() => {
    const seen = new Set(entries.map((entry) => entry.kind));
    return ACTIVITY_KINDS.filter((kind) => seen.has(kind.key));
  }, [entries]);

  const shown = useMemo(
    () => (filter === "all" ? entries : entries.filter((entry) => entry.kind === filter)),
    [entries, filter],
  );

  const groups = useMemo(() => groupByDay(shown, timezone), [shown, timezone]);

  if (entries.length === 0) {
    return (
      <EmptyState
        title="Nothing here yet"
        body={
          <>
            Classistant writes a line here every time it does something for you: a deadline it
            found in your mail, an event it added to your calendar, a reply it drafted, a night it
            signed in to your portal. The first entries land after its first overnight run.
          </>
        }
      />
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {filterable && present.length > 1 ? (
        <div
          role="group"
          aria-label="Filter activity"
          className="-mx-1 flex flex-wrap gap-2 px-1"
        >
          <Chip active={filter === "all"} onClick={() => setFilter("all")}>
            Everything
          </Chip>
          {present.map((kind) => (
            <Chip
              key={kind.key}
              active={filter === kind.key}
              onClick={() => setFilter(kind.key)}
            >
              {kind.plural}
            </Chip>
          ))}
        </div>
      ) : null}

      {shown.length === 0 ? (
        <EmptyState
          title="Nothing of that kind on this page"
          body="There may be older ones further back than this page reaches."
        />
      ) : (
        groups.map((group) => (
          <section key={group.day}>
            <h2 className="mb-3 text-[0.72rem] font-semibold uppercase tracking-[0.14em] text-body-soft">
              {group.day}
            </h2>
            <ul className="flex flex-col">
              {group.entries.map((entry, index) => (
                <Row
                  key={entry.id}
                  entry={entry}
                  timezone={timezone}
                  last={index === group.entries.length - 1}
                />
              ))}
            </ul>
          </section>
        ))
      )}

      {truncated ? (
        <p className="text-[0.8rem] leading-[1.6] text-body-soft">
          Showing the most recent {entries.length} entries. Older ones are kept but not shown
          here; ask for them at{" "}
          <a
            href="mailto:privacy@classistant.ca"
            className="font-semibold text-brand-600 hover:underline"
          >
            privacy@classistant.ca
          </a>{" "}
          and we will send you everything we hold.
        </p>
      ) : null}
    </div>
  );
}

function Chip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "rounded-full px-3.5 py-1.5 text-[0.82rem] transition-colors",
        // Competing utilities inside the branches only. A `font-semibold` in a
        // shared base with a `font-bold` in a branch is resolved by Tailwind's
        // emission order rather than by which was written last.
        active
          ? "bg-ink-900 font-bold text-white"
          : "bg-white font-semibold text-body ring-1 ring-line hover:bg-sky-50 hover:text-ink-900",
      )}
    >
      {children}
    </button>
  );
}

/**
 * One row, on a rail.
 *
 * The connecting line is a sibling of the marker inside a flex column, not an
 * absolutely positioned element behind the list. Absolute positioning would
 * need the row height to draw the right length, which is not known until the
 * title has wrapped, and it would run past the last row of a day into the
 * heading below it.
 */
function Row({
  entry,
  timezone,
  last,
}: {
  entry: ActivityEntry;
  timezone: string;
  last: boolean;
}) {
  const kind = activityKind(entry.kind);

  return (
    <li className="flex gap-4">
      <div aria-hidden="true" className="flex w-2.5 shrink-0 flex-col items-center">
        <span
          className={cn("mt-[0.45rem] h-2.5 w-2.5 shrink-0 rounded-full", markerTone(entry.status))}
        />
        {last ? null : <span className="mt-1.5 w-px flex-1 bg-line" />}
      </div>

      <div className="min-w-0 flex-1 pb-5">
        <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
          <span className="text-[0.75rem] font-semibold uppercase tracking-[0.08em] text-body-soft">
            {kind?.label ?? entry.kind}
          </span>
          <span aria-hidden="true" className="text-line">
            &middot;
          </span>
          <time
            dateTime={new Date(entry.at).toISOString()}
            className="text-[0.75rem] text-body-soft"
          >
            {formatTime(entry.at, timezone)}
          </time>
        </div>

        <p className="mt-1 text-[0.95rem] font-semibold leading-[1.45] text-ink-900">
          {entry.title}
        </p>

        {entry.detail ? (
          <p className="mt-1 text-[0.85rem] leading-[1.6] text-body">{entry.detail}</p>
        ) : null}

        {entry.href ? (
          // rel is not optional here. `noreferrer noopener` on a link out of a
          // page the student is signed in to, whose href came from another
          // service, is the difference between a link and a handle on this tab.
          <a
            href={entry.href}
            target="_blank"
            rel="noreferrer noopener"
            className="mt-1.5 inline-flex items-center gap-1 text-[0.84rem] font-semibold text-brand-600 hover:underline"
          >
            Open it
            <span aria-hidden="true">&rarr;</span>
          </a>
        ) : null}
      </div>
    </li>
  );
}

/**
 * The marker colour.
 *
 * Blue for done, because done is the overwhelming majority and a feed of green
 * ticks is a feed with no signal in it. The two functional non-blues are kept
 * for the rows that actually need to be found: something that needs the
 * student, and something that failed.
 */
function markerTone(status: ActivityStatus): string {
  switch (status) {
    case "attention":
      return "bg-warn";
    case "failed":
      return "bg-alert";
    default:
      return "bg-brand-500";
  }
}
