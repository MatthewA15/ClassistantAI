/**
 * Publishes the verified catalogue into the `schools` collection.
 *
 *   npm run seed:schools              # dry run, prints what would change
 *   npm run seed:schools -- --commit  # actually writes
 *
 * Issue #36 made Firestore the source of truth for schools so they can be added
 * without a deploy. This is how the collection is created in the first place,
 * and how a change made in scripts/schools.seed.ts reaches it afterwards.
 *
 * ## Three deliberate properties
 *
 * **It is a dry run by default.** This is one of the few scripts in the repo
 * meant to be pointed at the real project, so the safe direction is for a bare
 * invocation to tell you what it would do and change nothing.
 *
 * **It never deletes.** A school in Firestore that is absent from the seed file
 * is reported and left alone. Deleting would make this script the thing that
 * silently reverts a correction somebody made in the console, which is exactly
 * the failure the "Firestore owns it" decision was supposed to allow.
 *
 * **It merges, and stamps `created_at` only on insert**, through the same
 * `setStampedRef` the user documents use. A re-seed must not reset the date a
 * school was added.
 */
import { revalidateTag } from "next/cache";

import { SCHOOLS_COLLECTION, SCHOOLS_TAG, readSchools, writeSchool } from "@/lib/schools";
import { firestore } from "@/lib/firebaseAdmin";
import { setStampedRef } from "@/lib/users";
import { SEED_SCHOOLS } from "@/scripts/schools.seed";

const commit = process.argv.includes("--commit");

const target = process.env.FIRESTORE_EMULATOR_HOST
  ? `the emulator at ${process.env.FIRESTORE_EMULATOR_HOST}`
  : `the REAL project ${process.env.GOOGLE_CLOUD_PROJECT ?? "(GOOGLE_CLOUD_PROJECT unset)"}`;

console.log(`\nseed:schools -> ${target}`);
console.log(commit ? "mode: COMMIT, this writes\n" : "mode: dry run, nothing will be written\n");

// Read before writing, so the report can say inserted vs updated rather than
// just "wrote 18 documents", which tells you nothing about what changed.
// `readSchools` throws rather than returning [] on a failed read, which is what
// this wants: seeding on top of a database we could not read would report every
// school as an insert and hide whatever is actually wrong.
const existing = await readSchools();
const existingIds = new Set(existing.map((s) => s.id));

const inserts = SEED_SCHOOLS.filter((s) => !existingIds.has(s.id));
const updates = SEED_SCHOOLS.filter((s) => existingIds.has(s.id));

const seedIds = new Set(SEED_SCHOOLS.map((s) => s.id));
const orphans = existing.filter((s) => !seedIds.has(s.id));

for (const school of inserts) console.log(`  insert  ${school.id.padEnd(14)} ${school.name}`);
for (const school of updates) console.log(`  update  ${school.id.padEnd(14)} ${school.name}`);

if (orphans.length > 0) {
  // Not an error. Somebody may have added a campus in the console, which is a
  // supported way to work now. It is reported because the other possibility is
  // a school that was renamed in the seed file and left its old document
  // behind, and only a human can tell those two apart.
  console.log(
    `\n  ${orphans.length} school(s) in Firestore are not in the seed file. ` +
      "Left untouched -- add them to scripts/schools.seed.ts, or delete them by hand:",
  );
  for (const school of orphans) console.log(`    orphan  ${school.id.padEnd(14)} ${school.name}`);
}

if (!commit) {
  console.log(
    `\n${inserts.length} insert(s), ${updates.length} update(s) pending. ` +
      "Re-run with --commit to apply.\n",
  );
  process.exit(0);
}

const collection = firestore().collection(SCHOOLS_COLLECTION);
for (const school of SEED_SCHOOLS) {
  await setStampedRef(collection.doc(school.id), writeSchool(school));
}

console.log(`\nwrote ${SEED_SCHOOLS.length} school(s).`);

// Drop the hour-long cache in lib/schools.ts, so a school added here is visible
// on the next request instead of whenever the window happens to expire.
// Outside a request scope this is a no-op rather than an error, which is the
// case when the script runs against the emulator from a terminal.
try {
  revalidateTag(SCHOOLS_TAG);
  console.log(`revalidated tag "${SCHOOLS_TAG}".\n`);
} catch {
  console.log(
    `could not revalidate tag "${SCHOOLS_TAG}" from outside a request. ` +
      "A deployed instance will pick the change up within the hour.\n",
  );
}
