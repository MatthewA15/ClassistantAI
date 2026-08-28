/**
 * How loud Classistant is allowed to be, as the student's own switches.
 *
 * The access switches in data/access.ts answer "what may it read". These answer
 * "when may it interrupt me", and they are a different kind of promise: access
 * is enforced by us honouring a flag on a document, whereas a quiet hours window
 * is enforced by the sender simply not sending. Nothing here needs Google's
 * cooperation, so unlike the access switches these are true in the plain sense.
 *
 * The product is delivered by text and by the occasional phone call, so this is
 * the whole surface a student has for controlling the thing they actually
 * experience. A settings page that let them narrow scopes but not stop a 3am
 * call would be answering the question nobody asked.
 *
 * ## Why hours and not "notification frequency: low / medium / high"
 *
 * Because the failure a student is trying to prevent is specific and has a
 * clock on it: do not wake me up. A three-way slider is a guess about how that
 * maps onto sends, and the student cannot check our arithmetic. A window in
 * their own timezone is a rule they can verify by looking at it.
 */

/** Stored as one map on the user document. Snake case to match every other
 *  field there; the TypeScript shape below is camel. */
export const NOTIFICATIONS_FIELD = "notifications";

export type NotificationPrefs = {
  /**
   * Local-clock hours, 0 to 23, when nothing may be sent. `null` on both means
   * no window at all.
   *
   * They are allowed to wrap past midnight, which is in fact the normal case
   * (22 to 8), so a reader must never test `hour >= start && hour < end`. See
   * `inQuietHours` below, which is the check every sender should use rather
   * than reimplementing this.
   */
  quietStart: number | null;
  quietEnd: number | null;
  /**
   * Whether Classistant may place a voice call. Texts have no switch here: they
   * are the product, and turning them off is what STOP does. A call is the one
   * escalation loud enough that a student may reasonably want the text without
   * it, which is why it is the only channel with a switch of its own.
   */
  calls: boolean;
  /** Local-clock hour for the once-a-day summary, or `null` for no digest.
   *  Independent of quiet hours: a digest scheduled inside the window is held,
   *  not cancelled, which is the reader's job and not this file's. */
  digestHour: number | null;
  /**
   * IANA zone the two clocks above are read in. Captured from the browser
   * rather than derived from the phone number: an area code says where a number
   * was issued, not where its owner is now, and a student from Toronto studying
   * in Alberta would get woken up an hour early by that inference.
   */
  timezone: string;
};

/**
 * What a student gets before touching anything.
 *
 * Quiet overnight by default, and calls ON by default, which is the pairing the
 * product argues for: the escalation is the point, and the hours are what make
 * it survivable. Defaulting calls off would quietly turn the loudest feature
 * off for everyone who never opened this page.
 *
 * The digest is off by default. It is the one item here that adds messages
 * rather than removing them, and opting a student into more texts than they
 * asked for is not ours to do.
 */
export function defaultNotifications(): NotificationPrefs {
  return {
    quietStart: 22,
    quietEnd: 8,
    calls: true,
    digestHour: null,
    timezone: "America/Toronto",
  };
}

/** The hours offered in the pickers. Every hour of the day, because a student
 *  on a night shift or a west-coast timezone is not an edge case worth denying
 *  a row in a select. */
export const HOURS: number[] = Array.from({ length: 24 }, (_, i) => i);

/** `22` -> `10 PM`. Rendered rather than stored, so the underlying value stays
 *  a comparable integer instead of a string a reader has to parse at 3am. */
export function formatHour(hour: number): string {
  const suffix = hour < 12 ? "AM" : "PM";
  const twelve = hour % 12 === 0 ? 12 : hour % 12;
  return `${twelve} ${suffix}`;
}

/**
 * Whether a given local hour falls inside the quiet window.
 *
 * Exported for the senders, and written here rather than in each of them
 * because the wrap-past-midnight case is exactly the bug that ships: 22 to 8 is
 * two ranges on a number line and one range on a clock, and the obvious
 * comparison gets it backwards, staying silent all day and calling at 3am.
 */
export function inQuietHours(prefs: NotificationPrefs, hour: number): boolean {
  const { quietStart: start, quietEnd: end } = prefs;
  if (start === null || end === null) return false;
  // Equal bounds would be a zero-length window under either reading. Treated as
  // "no window" rather than "always quiet", because a student who set both to
  // the same hour meant to switch it off, not to mute the product forever.
  if (start === end) return false;
  return start < end ? hour >= start && hour < end : hour >= start || hour < end;
}

/**
 * Reads the prefs back off a Firestore document, filling in anything absent.
 *
 * Every field is defaulted individually rather than the whole map falling back
 * at once. A student who saved before a new field existed has a partial map,
 * and treating that as "no preferences at all" would silently discard the ones
 * they did set.
 */
export function readNotifications(raw: unknown): NotificationPrefs {
  const base = defaultNotifications();
  if (typeof raw !== "object" || raw === null) return base;
  const data = raw as Record<string, unknown>;

  // `null` is a real stored value here, meaning "off", and it has to survive a
  // round trip. `?? base.x` alone would read it as absent and switch the
  // feature back on, so presence of the key is what is tested.
  const hour = (key: string, fallback: number | null) => {
    if (!(key in data)) return fallback;
    const value = data[key];
    if (value === null) return null;
    return typeof value === "number" && value >= 0 && value <= 23 ? value : fallback;
  };

  return {
    quietStart: hour("quiet_start", base.quietStart),
    quietEnd: hour("quiet_end", base.quietEnd),
    calls: typeof data.calls === "boolean" ? data.calls : base.calls,
    digestHour: hour("digest_hour", base.digestHour),
    timezone: typeof data.timezone === "string" && data.timezone ? data.timezone : base.timezone,
  };
}

/** The inverse, for the write path. Kept beside the reader so the two field
 *  name lists cannot drift apart unnoticed. */
export function writeNotifications(prefs: NotificationPrefs): Record<string, unknown> {
  return {
    quiet_start: prefs.quietStart,
    quiet_end: prefs.quietEnd,
    calls: prefs.calls,
    digest_hour: prefs.digestHour,
    timezone: prefs.timezone,
  };
}
