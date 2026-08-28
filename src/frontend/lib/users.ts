import "server-only";

import { FieldValue, firestore } from "@/lib/firebaseAdmin";

/**
 * Where a student is written.
 *
 *   users/{uid}                    profile, consent evidence, school identifiers
 *   users/{uid}/credentials/{type} one sealed credential per type
 *
 * `uid` is the **Firebase Auth uid**, minted by phone sign-in.
 *
 * It used to be the Google `sub`, mirroring
 * src/backend/connectors-api/API_CONTRACT.md, which freezes `{user_id}` as the
 * `sub` returned from the connector's /auth/callback. That cost more than it
 * bought and issue #12 is rewriting the connector anyway:
 *
 *  - The `sub` does not exist until the access grant completes, so there was no
 *    key to write under during the first half of onboarding, and a student who
 *    abandoned between the SMS and the grant left nothing behind at all.
 *  - The session carries a uid, never a `sub`, so every read needed an indexed
 *    query purely to translate one into the other.
 *  - Reconnecting a different Google account changes the `sub`, and with it the
 *    document id. A uid is stable for the life of the account.
 *
 * The `sub` is still kept, as `google_sub`, because the connector's endpoints
 * are addressed by it. It is a field now, not an identity. Anything calling
 * `/users/{user_id}/...` must send `google_sub`, NOT the document id.
 *
 * Nothing in this file writes a credential. There used to be a top-level
 * `credentials/{uid}` document here holding a portal username and a Secret
 * Manager pointer; ENCRYPTION_CONTRACT.md §8 retired it, and both of a
 * student's credentials are now sealed documents in the subcollection above.
 * lib/credentials.ts owns those, and it is the only module that can produce
 * one. What is left here is the identifiers that are not secret, which is why
 * `school_username` sits on the user document beside `school_id` and `email`.
 * See docs/design/19-portal-password-envelope.md.
 */

export type ConsentRecord = {
  granted: boolean;
  /** Server time, not the browser's. A client clock is not evidence. */
  at: FirebaseFirestore.FieldValue;
  ip: string | null;
  /** The exact words on screen when the box was ticked. A bare boolean does not
   *  survive a CASL or A2P challenge; the wording is the thing being consented
   *  to and it changes as copy changes. */
  wording: string;
};

export type UserProfile = {
  /** The Firebase Auth uid, which is also the document id. */
  id: string;
  email: string;
  name: string;
  phoneNumber: string;
  schoolId: string;
  /** Optional second Google account for mail/Drive/Calendar. */
  serviceEmail?: string;
  consent: {
    terms: ConsentRecord;
    sms: ConsentRecord;
    marketing: ConsentRecord;
  };
  /**
   * The student's own switches over what Classistant may touch, keyed by the
   * Firestore field names in data/access.ts.
   *
   * These are enforcement on our side, not at Google. The grant is a single
   * token covering the whole scope set, so a `false` here means Classistant
   * does not use that access, and every reader of this document is expected to
   * honour it. See the note at the top of data/access.ts.
   */
  access: Record<string, boolean>;
};

/**
 * Merge-writes a document, stamping `created_at` only when it is genuinely new.
 *
 * A plain `set({created_at: serverTimestamp()}, {merge: true})` looks like it
 * preserves the original date and does not -- merge overwrites any field it is
 * given, so every re-onboard would silently reset the signup date and destroy
 * the ordering that consent evidence depends on. The transaction is what makes
 * "insert or update" actually mean it.
 */
export async function setStampedRef(
  ref: FirebaseFirestore.DocumentReference,
  data: FirebaseFirestore.DocumentData,
  onInsert: FirebaseFirestore.DocumentData = {},
): Promise<void> {
  await firestore().runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    tx.set(
      ref,
      {
        ...data,
        updated_at: FieldValue.serverTimestamp(),
        ...(snap.exists
          ? {}
          : { ...onInsert, created_at: FieldValue.serverTimestamp() }),
      },
      { merge: true },
    );
  });
}

/** The same write, addressed the way every caller in this file wants it. The
 *  ref-taking form above exists because credential documents live in a
 *  subcollection, which a collection-and-id pair cannot name. */
async function setStamped(
  collection: string,
  id: string,
  data: FirebaseFirestore.DocumentData,
  onInsert: FirebaseFirestore.DocumentData = {},
): Promise<void> {
  await setStampedRef(firestore().collection(collection).doc(id), data, onInsert);
}

export async function upsertUser(profile: UserProfile): Promise<void> {
  await setStamped("users", profile.id, {
    id: profile.id,
    name: profile.name,
    email: profile.email,
    phone_number: profile.phoneNumber,
    school_id: profile.schoolId,
    service_email: profile.serviceEmail,
    consent: profile.consent,
    access: profile.access,
  });
}

/**
 * What onboarding needs to know about a returning student.
 *
 * The school lives here rather than in the session because a Firebase session
 * cookie carries only what Firebase put in it, and what Firebase put in it is a
 * phone number. Everything else about a student is ours to store.
 */
export type UserRecord = {
  /** The document id, which is the Firebase Auth uid. */
  userId: string;
  schoolId: string | null;
  email: string | null;
  /** The Google `sub`, once the grant has happened. This is the id the
   *  connector's endpoints are addressed by, and the only thing it is for. */
  googleSub: string | null;
  /** Whether the Gmail/Drive/Docs/Calendar grant has been completed. Distinct
   *  from being signed in: identity is a phone number and arrives first. */
  googleConnected: boolean;
  onboardingComplete: boolean;
};

function toRecord(snap: FirebaseFirestore.DocumentSnapshot): UserRecord {
  const data = snap.data() ?? {};
  return {
    userId: snap.id,
    schoolId: typeof data.school_id === "string" ? data.school_id : null,
    email: typeof data.email === "string" ? data.email : null,
    googleSub: typeof data.google_sub === "string" ? data.google_sub : null,
    googleConnected: Boolean(data.google_connected_at),
    onboardingComplete: data.onboarding_complete === true,
  };
}

/**
 * The signed-in student's document, or null if they have none yet.
 *
 * A direct document read. This replaced `getUserByAuthUid`, which had to run an
 * indexed equality query because the session's uid was not the document key.
 * Now it is, so there is nothing to look up.
 */
export async function getUser(uid: string): Promise<UserRecord | null> {
  const snap = await firestore().collection("users").doc(uid).get();
  return snap.exists ? toRecord(snap) : null;
}

/**
 * Creates the user document the moment a number is verified.
 *
 * This is the write that keying by uid makes possible at all. Under the old
 * `sub` key there was nothing to write under until the access grant completed,
 * so a student who left between the SMS and the grant left no trace, and
 * docs/design/15 had to carry that as a known gap.
 *
 * Everything here is insert-only. A returning student re-verifying their number
 * must not have their school, consent, or grant reset by signing in again.
 */
export async function ensureUser(args: {
  uid: string;
  phoneNumber: string;
}): Promise<void> {
  await setStamped(
    "users",
    args.uid,
    { id: args.uid, phone_number: args.phoneNumber },
    // Written explicitly rather than left absent so
    // `where("onboarding_complete", "==", false)` can actually find them --
    // Firestore equality never matches a missing field.
    { onboarding_complete: false },
  );
}

/**
 * Records the access grant against an already existing user document.
 *
 * Before the rekey this function created the document, because the Google `sub`
 * it was keyed by did not exist any earlier. Now the document is already there
 * from `ensureUser`, and this only adds what the grant proved: the school
 * address, and the `sub` the connector addresses its endpoints by.
 *
 * `phone_number` is not rewritten here. It was verified by an SMS round trip
 * and stored at sign-in, and re-asserting it from the session would only invite
 * the two to drift.
 */
export async function recordGoogleConnection(args: {
  uid: string;
  googleSub: string;
  email: string;
  schoolId: string;
}): Promise<void> {
  await setStamped(
    "users",
    args.uid,
    {
      id: args.uid,
      email: args.email,
      school_id: args.schoolId,
      // A field, not an identity. The connector's `/users/{user_id}/...`
      // endpoints are addressed by this, never by the document id.
      google_sub: args.googleSub,
      google_connected_at: FieldValue.serverTimestamp(),
    },
    { onboarding_complete: false },
  );
}

/**
 * The name the student signs in to their school portal with.
 *
 * On the user document rather than in the credential envelope, because it is
 * not a credential. It is an identifier the school hands out -- often the
 * student number -- and it belongs with `school_id` and `email`, where anything
 * holding `datastore.viewer` can read it without being able to open anything.
 * Sealing it would also put a field in the credential document that
 * ENCRYPTION_CONTRACT.md §3 does not list, and that document's shape is checked
 * on the far side.
 *
 * Called by savePortalCredentials in lib/portalCredentials.ts, which owns the
 * order the two halves are written in. Nothing else should call it: a username
 * with no password behind it is a user document claiming a portal login that
 * does not exist.
 */
export async function recordSchoolUsername(
  userId: string,
  username: string,
): Promise<void> {
  await setStamped("users", userId, { school_username: username });
}

export async function markOnboardingComplete(userId: string): Promise<void> {
  await setStamped("users", userId, {
    onboarding_complete: true,
    onboarding_completed_at: FieldValue.serverTimestamp(),
  });
}
