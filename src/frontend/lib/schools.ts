import "server-only";

import { unstable_cache } from "next/cache";

import type { School, SchoolStatus } from "@/data/schools";
import { firestore } from "@/lib/firebaseAdmin";

/**
 * The `schools` collection, which is the source of truth for what campuses
 * exist.
 *
 * Issue #36 moved this out of a TypeScript constant so that a school can be
 * added or corrected without a deploy, and so the agent can turn the
 * `school_id` on a user document into a real name, city, and timezone. The
 * catalogue is seeded from scripts/schools.seed.ts by `npm run seed:schools`.
 *
 * ## Why there is no fallback to the seed array
 *
 * There deliberately is not one. A hardcoded list that stands in when Firestore
 * is empty or unreachable is a second copy of the data that disagrees with the
 * first, silently, on exactly the days someone is debugging why a school
 * vanished. An empty list is a visible failure and a wrong list is not, so this
 * returns `[]` and the surfaces above it say they could not load the schools.
 *
 * ## Why it is cached
 *
 * `readSchools` is called from the root layout, so without a cache every route
 * in the app -- including three static legal pages -- would pay a Firestore
 * round trip on every render. The collection changes a few times a term at
 * most, so it is cached for an hour and tagged, and a seed run can drop the
 * cache immediately with `revalidateTag(SCHOOLS_TAG)`.
 */

export const SCHOOLS_COLLECTION = "schools";

/** Passed to `revalidateTag` to drop the cache the moment a seed run finishes,
 *  rather than leaving a new school invisible for up to an hour. */
export const SCHOOLS_TAG = "schools";

const ONE_HOUR = 3600;

/** Live first, then confirmed, then unchecked. The picker renders in list order
 *  and a student's own school being buried under sixteen it cannot serve is the
 *  one ordering that must not happen. */
const STATUS_RANK: Record<SchoolStatus, number> = { live: 0, soon: 1, pending: 2 };

function isStatus(value: unknown): value is SchoolStatus {
  return value === "live" || value === "soon" || value === "pending";
}

/** Reads one document, or null if it is missing anything a caller assumes is
 *  there. A half-written school is worse than an absent one: it reaches the
 *  picker, gets chosen, and fails at the domain check with nothing on screen
 *  explaining why. */
function toSchool(snap: FirebaseFirestore.QueryDocumentSnapshot): School | null {
  const data = snap.data();
  const str = (key: string): string | undefined =>
    typeof data[key] === "string" && data[key].trim() ? (data[key] as string) : undefined;

  const name = str("name");
  const province = str("province");
  const city = str("city");
  const timeZone = str("time_zone");
  const emailDomain = str("email_domain");

  if (!name || !province || !city || !timeZone || !emailDomain || !isStatus(data.status)) {
    console.error("schools: skipping malformed document", { id: snap.id });
    return null;
  }

  const rawBrand = data.brand;
  const brand =
    rawBrand && typeof rawBrand === "object" && typeof rawBrand.primary === "string"
      ? {
          primary: rawBrand.primary as string,
          accent: typeof rawBrand.accent === "string" ? (rawBrand.accent as string) : undefined,
          source: typeof rawBrand.source === "string" ? (rawBrand.source as string) : "",
        }
      : undefined;

  return {
    id: snap.id,
    name,
    short: str("short_name"),
    province,
    city,
    timeZone,
    emailDomain,
    status: data.status,
    source: str("source"),
    note: str("note"),
    brand,
    logo: str("logo"),
  };
}

/**
 * The uncached read, which throws if Firestore will not answer.
 *
 * Exported for the seeder, which must see what it just wrote rather than an
 * hour-old cache entry, and which wants a failure to be loud.
 */
export async function readSchools(): Promise<School[]> {
  const snap = await firestore().collection(SCHOOLS_COLLECTION).get();
  return snap.docs
    .map(toSchool)
    .filter((s): s is School => s !== null)
    .sort((a, b) => STATUS_RANK[a.status] - STATUS_RANK[b.status] || a.name.localeCompare(b.name));
}

const cachedSchools = unstable_cache(readSchools, ["schools-list"], {
  revalidate: ONE_HOUR,
  tags: [SCHOOLS_TAG],
});

/**
 * Every school, cached. This is what the app should call.
 *
 * Safe from a server component, a server action, or a route handler, and it is
 * the only reader any of them need: the list is eighteen documents, so
 * filtering it in memory costs less than the indexed queries the alternatives
 * would need.
 *
 * ## The catch is OUTSIDE the cache, and that placement is the point
 *
 * `readSchools` throws rather than returning `[]`, and this function turns the
 * throw into `[]` after `unstable_cache` has already declined to store it.
 * Catching one level down instead -- inside the cached function -- looks
 * identical and is a deployment hazard: `unstable_cache` stores whatever it is
 * handed, so a build machine or a cold instance that could not reach Firestore
 * for one second would bake an empty school list in for the next hour and take
 * the landing page's campus list and the whole picker with it. A thrown error
 * is not cached, so the next request simply tries again.
 *
 * `[]` rather than a rethrow, because this runs in the root layout: a Firestore
 * hiccup propagating from here would take down the legal pages and the
 * dashboard along with the picker, none of which need this list to be useful.
 * The surfaces that do need it check for empty and say so.
 */
export async function listSchools(): Promise<School[]> {
  try {
    return await cachedSchools();
  } catch (err) {
    console.error("schools: read failed", {
      error: err instanceof Error ? err.message : "unknown",
    });
    return [];
  }
}

/**
 * The Firestore shape, written by the seeder.
 *
 * Kept beside `toSchool` above for the same reason `writeNotifications` sits
 * beside `readNotifications`: the two field-name lists are the contract, and
 * splitting them across files is how one of them silently stops matching.
 *
 * Snake case, matching the `users` documents, because the agent and the Twilio
 * functions read both and a collection that alone used camelCase would be a
 * trap for exactly one afternoon and then a permanent irritation.
 */
export function writeSchool(school: School): Record<string, unknown> {
  return {
    id: school.id,
    name: school.name,
    short_name: school.short ?? null,
    province: school.province,
    city: school.city,
    time_zone: school.timeZone,
    email_domain: school.emailDomain,
    status: school.status,
    source: school.source ?? null,
    note: school.note ?? null,
    brand: school.brand
      ? {
          primary: school.brand.primary,
          accent: school.brand.accent ?? null,
          source: school.brand.source,
        }
      : null,
    logo: school.logo ?? null,
  };
}
