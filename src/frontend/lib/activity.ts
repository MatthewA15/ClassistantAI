import "server-only";

import { Timestamp, firestore } from "@/lib/firebaseAdmin";
import {
  activityKind,
  type ActivityEntry,
  type ActivityKind,
  type ActivityStatus,
} from "@/data/activity";

/**
 * The task history, read out of `users/{uid}/activity`.
 *
 * ## Nothing in this repo writes to that collection yet
 *
 * The agent does the work, so the agent records it, and the agent is not in
 * this codebase. This module is the read side and the shape contract, written
 * first on purpose: the dashboard needs somewhere honest to point, and the
 * writer needs a documented shape to write to rather than inventing one and
 * having the two discovered to disagree in front of a student.
 *
 * The consequence is that today this returns an empty list for everybody, and
 * the page renders its empty state. That is the correct behaviour and it must
 * not be "fixed" with sample rows. A history is a record of things that
 * happened to a real person's real account; seeded demo entries in it are a
 * false statement about what the product did with their school email, which is
 * the single worst place in this product to be caught being decorative.
 *
 * ## The document shape the writer must produce
 *
 *   users/{uid}/activity/{autoId}
 *     kind      string, one of data/activity.ts ACTIVITY_KINDS keys
 *     status    "done" | "attention" | "failed"
 *     title     string, one line, already written for a student to read
 *     detail    string, optional second line
 *     href      string, optional link to the artefact itself
 *     at        Firestore Timestamp, server time
 *
 * A subcollection rather than a top-level `activity` collection keyed by uid,
 * for the same two reasons as credentials: deleting a student is one recursive
 * delete, and reading their history is an ordered query inside one document's
 * subtree instead of a composite index on `(user_id, at)`.
 */

/** Documents per read. Deliberately not "all of them": a student who has been
 *  on this for two terms has thousands of rows and no interest in scrolling
 *  them, and an unbounded query is the kind of thing that is fine until the
 *  day it is not. The page says so when it truncates. */
export const ACTIVITY_PAGE_SIZE = 60;

const STATUSES = new Set<ActivityStatus>(["done", "attention", "failed"]);

/**
 * Turns one document into a row, or null if it is not one.
 *
 * Anything unrecognised is dropped rather than rendered as a placeholder. This
 * collection is written by a different codebase on a different deploy cadence,
 * so it WILL at some point contain a kind this build has never heard of. A row
 * reading "unknown activity" tells a student nothing and looks like a bug in
 * their account; leaving it out until the frontend catches up is quieter and
 * truer.
 */
function toEntry(
  snap: FirebaseFirestore.QueryDocumentSnapshot,
): ActivityEntry | null {
  const data = snap.data();

  const kind = typeof data.kind === "string" ? data.kind : "";
  if (!activityKind(kind)) return null;

  const at = data.at;
  if (!(at instanceof Timestamp)) return null;

  const title = typeof data.title === "string" ? data.title.trim() : "";
  if (!title) return null;

  const status = STATUSES.has(data.status as ActivityStatus)
    ? (data.status as ActivityStatus)
    : "done";

  return {
    id: snap.id,
    kind: kind as ActivityKind,
    status,
    title,
    detail: typeof data.detail === "string" && data.detail.trim() ? data.detail.trim() : null,
    // Only http(s). The value comes from another service, and a `javascript:`
    // or `data:` URL rendered into an href on a page the student is signed in
    // to is the whole of that vulnerability.
    href: safeHref(data.href),
    at: at.toMillis(),
  };
}

function safeHref(raw: unknown): string | null {
  if (typeof raw !== "string" || !raw) return null;
  try {
    const url = new URL(raw);
    return url.protocol === "https:" || url.protocol === "http:" ? url.toString() : null;
  } catch {
    return null;
  }
}

/**
 * The student's history, newest first.
 *
 * Returns an empty array rather than throwing when the collection does not
 * exist, which is what Firestore does anyway for a query over a missing
 * subcollection. It also swallows a genuine read failure, and that is
 * deliberate: this is one card on a page whose other cards are the ones a
 * student came for, and a Firestore hiccup should degrade the history to "no
 * history" rather than take the account settings down with it.
 */
export async function getActivity(
  uid: string,
  limit: number = ACTIVITY_PAGE_SIZE,
): Promise<ActivityEntry[]> {
  try {
    const snap = await firestore()
      .collection("users")
      .doc(uid)
      .collection("activity")
      .orderBy("at", "desc")
      .limit(limit)
      .get();

    return snap.docs.map(toEntry).filter((entry): entry is ActivityEntry => entry !== null);
  } catch (err) {
    console.error("getActivity failed", {
      uid,
      error: err instanceof Error ? err.message : "unknown",
    });
    return [];
  }
}

/*
 * The grouping and the "Today"/"Yesterday" formatting used to live here and are
 * now in data/activity.ts, beside the types they operate on.
 *
 * They had to move. They are pure functions over an ActivityEntry, and the
 * component that needs them filters the list in the browser, which means the
 * grouping has to be redone after every filter change. A "server-only" module
 * cannot be imported from a client component at all -- the package exists
 * precisely to make that a build error -- so leaving them here would have meant
 * either a second copy in the component or shipping the feed unfiltered.
 */
