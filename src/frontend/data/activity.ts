/**
 * The kinds of thing Classistant does, and what each one is called on screen.
 *
 * This is the vocabulary of the task history. It is a closed list on purpose:
 * an activity feed whose rows are free text is a log, and a log is what you read
 * when you already know what you are looking for. A student opening this page
 * wants to answer one question, "what has it been doing on my behalf", and a
 * fixed set of kinds is what makes that answer skimmable and filterable.
 *
 * ## The rule this list inherits from data/access.ts
 *
 * **Every kind must correspond to something the product can actually do, and
 * must not suggest anything it cannot.** There is no `email_sent`, because
 * `gmail.compose` writes drafts and is incapable of sending. There is no
 * `deleted` of any sort, because the grant asks for nothing that can delete a
 * student's mail, files, or docs. A row in a history is a claim that a thing
 * happened, so an unreachable kind here is worse than a misleading label on a
 * switch: it is evidence of an event that cannot occur.
 *
 * `access` on each row names the switch in data/access.ts that gates it, so
 * that a student who turned something off can be shown *why* a kind of row
 * stopped appearing, rather than being left to wonder whether it broke.
 */

export type ActivityKind =
  | "deadline"
  | "calendar"
  | "draft"
  | "doc"
  | "portal"
  | "text"
  | "call";

/**
 * Whether the thing worked. Three values, and the middle one earns its place:
 * "it tried and could not" is a different fact from "it failed", and the most
 * common cause is the student's own portal password having changed, which is
 * something they can fix and would want to know about.
 */
export type ActivityStatus = "done" | "attention" | "failed";

export type ActivityKindSpec = {
  key: ActivityKind;
  /** Singular, sentence case. It heads a row, not a section. */
  label: string;
  /** The filter chip, which is plural because it names a set. */
  plural: string;
  /** Which access switch turns this kind of work off, or null where the work
   *  needs no Google scope at all. See the rule above. */
  access: string | null;
};

export const ACTIVITY_KINDS: ActivityKindSpec[] = [
  {
    key: "deadline",
    label: "Deadline found",
    plural: "Deadlines",
    access: "gmailRead",
  },
  {
    key: "calendar",
    label: "Added to your calendar",
    plural: "Calendar",
    access: "calendar",
  },
  {
    // Draft, never sent. See the rule at the top of this file before adding a
    // sibling kind here.
    key: "draft",
    label: "Reply drafted",
    plural: "Drafts",
    access: "gmailDrafts",
  },
  {
    key: "doc",
    label: "Outline started",
    plural: "Outlines",
    access: "docs",
  },
  {
    key: "portal",
    label: "Checked your portal",
    plural: "Portal checks",
    // The portal is signed into with the sealed password, not with the Google
    // grant, so no access switch reaches it. Turning every Google switch off
    // does not stop this, and the settings page has to say so.
    access: null,
  },
  {
    key: "text",
    label: "Texted you",
    plural: "Texts",
    access: null,
  },
  {
    key: "call",
    label: "Called you",
    plural: "Calls",
    access: null,
  },
];

export function activityKind(key: string): ActivityKindSpec | undefined {
  return ACTIVITY_KINDS.find((k) => k.key === key);
}

/** One row of the history, as the UI wants it. The Firestore shape it is read
 *  from lives in lib/activity.ts, which is the only thing that should know it. */
export type ActivityEntry = {
  id: string;
  kind: ActivityKind;
  status: ActivityStatus;
  /** One line, written by whatever did the work. "Found: CHEM 261 lab report,
   *  due Friday" rather than "deadline_extracted". */
  title: string;
  /** Optional second line with the specifics. */
  detail: string | null;
  /** Where to go and see the thing itself: a Google Calendar event, a draft, a
   *  Doc. Absent for work with nowhere to point at, like a portal check. */
  href: string | null;
  /** Milliseconds since the epoch. A number rather than a Date so it survives
   *  the server-to-client boundary without a serialisation dance. */
  at: number;
};

/* ---------------------------------------------------------------------------
   Formatting. Pure functions over an entry, kept here rather than in
   lib/activity.ts because the feed filters in the browser and has to regroup
   after every chip press. lib/activity.ts is "server-only", which is a build
   error to import from a client component -- deliberately, and correctly, since
   everything else in it touches Firestore.
--------------------------------------------------------------------------- */

/**
 * Groups rows under a day heading, preserving the newest-first order.
 *
 * A flat list of forty rows each stamped with a time and no date is unreadable,
 * and a date on every single row is noise. The heading is the compromise.
 *
 * `timezone` is the student's own, from their notification preferences, because
 * which day something happened on has a different answer in Vancouver than in
 * St. John's, and the server's own answer is neither.
 */
export function groupByDay(
  entries: ActivityEntry[],
  timezone: string,
): { day: string; entries: ActivityEntry[] }[] {
  const groups: { day: string; entries: ActivityEntry[] }[] = [];

  for (const entry of entries) {
    const day = formatDay(entry.at, timezone);
    const last = groups[groups.length - 1];
    if (last && last.day === day) last.entries.push(entry);
    else groups.push({ day, entries: [entry] });
  }

  return groups;
}

/**
 * "Today", "Yesterday", or a date.
 *
 * Compared as formatted day strings rather than by subtracting milliseconds:
 * "yesterday" is a calendar fact, not a 24 hour interval, and at 00:30 the
 * arithmetic version calls something from 23:00 last night "today".
 */
function formatDay(ms: number, timezone: string): string {
  const opts: Intl.DateTimeFormatOptions = {
    timeZone: timezone,
    year: "numeric",
    month: "short",
    day: "numeric",
  };

  const stamp = new Date(ms);
  const now = new Date();
  const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);

  const key = (d: Date) => {
    try {
      return d.toLocaleDateString("en-CA", opts);
    } catch {
      // An unrecognised IANA zone. Falls back to the local one rather than
      // throwing: a bad timezone string should cost a wrong heading, not the
      // whole page.
      return d.toLocaleDateString("en-CA", { ...opts, timeZone: undefined });
    }
  };

  const label = key(stamp);
  if (label === key(now)) return "Today";
  if (label === key(yesterday)) return "Yesterday";
  return label;
}

/** "9:40 p.m.", in the student's zone. Same fallback reasoning as above. */
export function formatTime(ms: number, timezone: string): string {
  const opts: Intl.DateTimeFormatOptions = {
    hour: "numeric",
    minute: "2-digit",
    timeZone: timezone,
  };
  try {
    return new Date(ms).toLocaleTimeString("en-CA", opts);
  } catch {
    return new Date(ms).toLocaleTimeString("en-CA", { ...opts, timeZone: undefined });
  }
}
