/**
 * The student's IANA timezone: validating it, and choosing what to store when
 * the browser will not say.
 *
 * ## Why this is a field of its own
 *
 * `time_zone` sits at the top level of the user document, beside `school_id`
 * and `phone_number`, because issue #36 asked for it there: the agent schedules
 * every reminder against it, and a reader that has to reach into a preferences
 * map to find out what "9am tomorrow" means will eventually forget to.
 *
 * It used to live only inside the `notifications` map, and only got written if
 * a student opened the settings page and pressed save. So the field the agent
 * needs most was absent for every student who never visited that page, which is
 * most of them. Onboarding writes it now.
 *
 * There is exactly one copy. `NotificationPrefs` reads this field rather than
 * keeping its own, because two timezones on one document is a bug with a clock
 * on it: they drift, and the half that loses is the one deciding whether 3am
 * counts as quiet hours.
 *
 * ## Why it is validated
 *
 * It arrives as a hidden input on a server action, which is a public HTTP
 * endpoint. Anything the browser sends is a claim, and this particular claim is
 * fed to `Intl` and to whatever the agent uses to turn a local hour into an
 * instant. An unrecognised zone is not a hostile act as often as it is an old
 * browser, but either way storing it means storing something no reader can act
 * on.
 */

/** The last-resort zone, and the same one `defaultNotifications` used before
 *  this file existed. Reached only when the browser gave nothing usable AND the
 *  student has no school on their document yet, which in practice means a
 *  half-finished onboarding. */
export const FALLBACK_TIME_ZONE = "America/Toronto";

/**
 * The canonical IANA spelling of a zone, or null if it is not one.
 *
 * Asks `Intl` rather than matching a pattern. A regex over `Region/City` admits
 * `Foo/Bar` and rejects `UTC`, and the question that actually matters is not
 * whether the string looks like a zone but whether the thing that will later do
 * arithmetic with it can resolve it.
 *
 * ## Why it returns the resolved name rather than a boolean
 *
 * Because `Intl` is more forgiving than the consumer. It accepts input this
 * field must never store:
 *
 *   "america/toronto"  ->  America/Toronto
 *   "EST5EDT"          ->  America/New_York
 *   "utc"              ->  UTC
 *
 * A validator that only said "yes" would have written `america/toronto`
 * verbatim, and the agent is Python: `zoneinfo.ZoneInfo("america/toronto")`
 * raises `ZoneInfoNotFoundError`, because the tzdata lookup is case sensitive.
 * That is a value this side called valid and the other side cannot resolve, and
 * it surfaces as a reminder that never fires, in a different codebase, at 3am.
 *
 * Reachable by hand and not just by an exotic browser: the zone arrives as a
 * hidden input on a server action, which is a public endpoint.
 */
export function canonicalTimeZone(value: string): string | null {
  if (!value) return null;
  try {
    // Throws RangeError on an unrecognised zone. `resolvedOptions` is what
    // turns an accepted alias or a lowercased id into the spelling tzdata uses.
    return new Intl.DateTimeFormat("en-CA", { timeZone: value }).resolvedOptions().timeZone;
  } catch {
    return null;
  }
}

/** Whether `Intl` recognises this as a zone at all. Prefer `canonicalTimeZone`
 *  anywhere the value is about to be stored. */
export function isValidTimeZone(value: string): boolean {
  return canonicalTimeZone(value) !== null;
}

/**
 * Turns whatever the form sent into a zone worth storing.
 *
 * The fallback chain is deliberate, and the middle link is the useful one: a
 * student's campus is a far better guess than a fixed default, and the two
 * disagree by four and a half hours between Memorial and Vancouver Island. A
 * fixed `America/Toronto` for everyone would have quietly put a UBC student's
 * quiet hours three hours off.
 */
export function resolveTimeZone(
  submitted: FormDataEntryValue | null | undefined,
  schoolTimeZone?: string,
): string {
  const value = String(submitted ?? "").trim();

  // The canonical spelling, never the submitted one. See canonicalTimeZone.
  const canonical = canonicalTimeZone(value);
  if (canonical) return canonical;

  if (value) {
    // Worth a line in the log. A browser that reports a zone `Intl` then
    // refuses is rare enough to be interesting, and the alternative is a
    // student silently filed under the wrong clock.
    console.warn("timeZone: rejected an unrecognised zone", { value });
  }

  // Canonicalised too. These come from data/schools.seed.ts, which is
  // reviewed, but a school edited in the Firestore console is not.
  const campus = schoolTimeZone ? canonicalTimeZone(schoolTimeZone) : null;
  return campus ?? FALLBACK_TIME_ZONE;
}
