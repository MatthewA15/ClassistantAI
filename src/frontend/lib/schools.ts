import "server-only";

import { unstable_cache } from "next/cache";

import type { School, SchoolStatus } from "@/data/schools";
import { SEED_SCHOOLS } from "@/data/schools.seed";
import { firestore } from "@/lib/firebaseAdmin";

/**
 * The `schools` collection, which is the source of truth for what campuses
 * exist.
 *
 * Issue #36 moved this out of a TypeScript constant so that a school can be
 * added or corrected without a deploy, and so the agent can turn the
 * `school_id` on a user document into a real name, city, and timezone. The
 * catalogue is seeded from data/schools.seed.ts by `npm run seed:schools`.
 *
 * ## The seed catalogue is the floor, and the fallthrough is loud
 *
 * When the collection comes back empty or unreadable, `listSchools` serves
 * `SEED_SCHOOLS` from data/schools.seed.ts rather than an empty list.
 *
 * The first version of this refused to, on the grounds that a second copy of
 * the data can silently disagree with the first. That is a real cost and it is
 * the wrong one to optimise for: an empty list is not a neutral failure here,
 * it is a school picker with nothing in it and a Get started button that cannot
 * be pressed, so a Firestore hiccup turns into lost signups (@obaodelana on
 * PR #42). Stale beats absent when absent means the product does not work.
 *
 * The disagreement is made loud instead of prevented: every fallthrough logs an
 * error naming what happened. Nothing silently serves the catalogue.
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

/** The seed catalogue, sorted the same way a Firestore read would be, so the
 *  fallback and the real thing are indistinguishable to every caller except in
 *  how fresh they are. */
const SEEDED: School[] = [...SEED_SCHOOLS].sort(
  (a, b) => STATUS_RANK[a.status] - STATUS_RANK[b.status] || a.name.localeCompare(b.name),
);

/**
 * Every school, cached. This is what the app should call.
 *
 * Safe from a server component, a server action, or a route handler, and it is
 * the only reader any of them need: the list is eighteen documents, so
 * filtering it in memory costs less than the indexed queries the alternatives
 * would need.
 *
 * Never returns an empty array. See the header for why stale beats absent.
 *
 * ## The catch is OUTSIDE the cache, and that placement is the point
 *
 * `readSchools` throws rather than returning a fallback, and this function
 * handles the throw after `unstable_cache` has already declined to store it.
 * Catching one level down instead -- inside the cached function -- looks
 * identical and is a deployment hazard: `unstable_cache` stores whatever it is
 * handed, so a cold instance that could not reach Firestore for one second
 * would pin the seeded list in place for the next hour, long after Firestore
 * came back and started disagreeing with it. A thrown error is not cached, so
 * the next request reads for real.
 *
 * Neither branch rethrows, because this runs in the root layout: a Firestore
 * hiccup propagating from here would take down the legal pages and the
 * dashboard along with the picker, none of which need this list at all.
 */
export async function listSchools(): Promise<School[]> {
  try {
    const schools = await cachedSchools();
    if (schools.length > 0) return schools;
    // A successful read of an empty collection, which means nobody has run
    // `npm run seed:schools -- --commit` against this project yet.
    console.error(
      "schools: the collection is empty, serving the seeded catalogue. " +
        "Run `npm run seed:schools -- --commit` to populate it.",
    );
  } catch (err) {
    console.error("schools: read failed, serving the seeded catalogue", {
      error: err instanceof Error ? err.message : "unknown",
    });
  }
  return SEEDED;
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
