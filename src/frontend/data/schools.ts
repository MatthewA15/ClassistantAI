/**
 * The shape of a school, and the pure functions over a list of them.
 *
 * ## Where the list itself went
 *
 * It used to be a `SCHOOLS` constant in this file, and it is now the `schools`
 * collection in Firestore, read by lib/schools.ts and seeded from
 * data/schools.seed.ts. Issue #36 moved it so that a school can be added
 * without a deploy, and so the agent can resolve a `school_id` into a real name
 * and location without a copy of this list on its side.
 *
 * What is left here is everything that does NOT need to know where the data
 * came from: the type, and five functions that take a list and return an answer
 * about it. They are pure on purpose. Onboarding runs them on the server, the
 * hero and the picker run them in the browser against a list that arrived as a
 * prop, and neither can afford this module to reach for a database.
 *
 * So the rule is: this file holds no schools, and nothing in it imports
 * data/schools.seed.ts. The eligibility rules that govern which schools may
 * exist at all live with the data, in the seed file's header and in
 * docs/design/05-schools-data.md.
 */

export type SchoolStatus = "live" | "soon" | "pending";

/**
 * A school's own brand colours, used to re-skin the whole site when a student
 * picks their school in the hero.
 *
 * Every value is taken from the school's published brand guidelines, with
 * `source` recorded. Students know their own school's colours on sight, so a
 * guessed hex is immediately visible as wrong. `accent` is only a second
 * official colour where the school publishes one.
 */
export type SchoolBrand = {
  primary: string;
  /** Only set where the school publishes a real second colour. Otherwise the
   *  theme derives a tint of `primary`, rather than inventing one. */
  accent?: string;
  source: string;
};

export type School = {
  id: string;
  name: string;
  /** Short form used in tight UI, falls back to `name`. */
  short?: string;
  province: string;
  /** Main campus city. Part of the "location" the agent asked for in #36: a
   *  province is too coarse to say anything useful to a student with it. */
  city: string;
  /**
   * IANA zone of the main campus.
   *
   * The fallback a reminder is scheduled in when a student's own `time_zone` is
   * missing. Deliberately stored per school rather than derived from
   * `province`, because Newfoundland is UTC-3:30 and any mapping from a
   * two-letter province code would put every Memorial reminder half an hour out.
   */
  timeZone: string;
  /** Student mail domain, shown so a student can confirm it is their address. */
  emailDomain: string;
  status: SchoolStatus;
  /** Where the platform was confirmed. Required for `live`. */
  source?: string;
  /** Caveats worth surfacing during onboarding. */
  note?: string;
  /** Required on `live` schools, which are the ones offered as themes. */
  brand?: SchoolBrand;
  /**
   * Path to the school's real logo, once we have written permission to use it.
   * University logos are trademarks: they cannot be redrawn, approximated, or
   * shipped without a licence from the institution. Until one exists, the UI
   * falls back to a brand-coloured monogram, which claims nothing.
   */
  logo?: string;
};

/** "Memorial University of Newfoundland" -> "MUN". Used for the crest fallback. */
export function schoolInitials(name: string): string {
  const skip = new Set(["of", "the", "and"]);
  return name
    .split(/\s+/)
    .filter((w) => !skip.has(w.toLowerCase()))
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("")
    .slice(0, 3);
}

/**
 * The schools we actually run at, which is the only set marketing may name.
 *
 * A function over a list rather than the `LIVE_SCHOOLS` constant it replaced.
 * The constant could be computed once at module load because the list was a
 * literal in this file; now the list arrives at runtime and differs between a
 * seeded database and an empty one, so the filter has to run where it is used.
 */
export function liveSchools(schools: School[]): School[] {
  return schools.filter((s) => s.status === "live");
}

export function searchSchools(schools: School[], query: string): School[] {
  const q = query.trim().toLowerCase();
  if (!q) return schools;
  return schools.filter((s) =>
    [s.name, s.short ?? "", s.emailDomain, s.province, s.city].some((field) =>
      field.toLowerCase().includes(q),
    ),
  );
}

export function getSchool(schools: School[], id: string): School | undefined {
  return schools.find((s) => s.id === id);
}

/**
 * Matches a typed address to a school by its mail domain, so the waitlist can
 * answer with the school's name instead of echoing a raw domain back.
 *
 * Matches across a subdomain in both directions on purpose. York's student mail
 * is `my.yorku.ca`, but a York student typing their address from memory writes
 * `@yorku.ca` about as often. A `pending` school matches too: we do not know
 * what their mail runs on, but we do know what the school is called.
 */
export function findSchoolByEmail(schools: School[], email: string): School | undefined {
  const domain = email.trim().toLowerCase().split("@")[1]?.replace(/[>\s]+$/, "");
  // A bare TLD would `endsWith`-match half the list, so require a real domain.
  if (!domain || !domain.includes(".")) return undefined;

  return schools.find(
    (s) =>
      domain === s.emailDomain ||
      domain.endsWith(`.${s.emailDomain}`) ||
      s.emailDomain.endsWith(`.${domain}`),
  );
}
