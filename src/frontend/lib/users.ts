import "server-only";

import { FieldValue, firestore } from "@/lib/firebaseAdmin";
import { secretName, storePortalPassword } from "@/lib/portalCredentials";

/**
 * The two onboarding collections.
 *
 *   users/{user_id}        profile + consent evidence
 *   credentials/{user_id}  school portal username + a pointer to the password
 *
 * Both are keyed by the Google `sub` returned from the connector's
 * /auth/callback, which is also what the ADK agent passes on every connector
 * call. One id end to end, so nothing has to join.
 *
 * There is no `password` field on `credentials`, deliberately. The password
 * lives in Secret Manager and the document holds only its resource name -- see
 * lib/portalCredentials.ts for why, and docs/design/12 for what was rejected.
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
async function setStamped(
  collection: string,
  id: string,
  data: FirebaseFirestore.DocumentData,
  onInsert: FirebaseFirestore.DocumentData = {},
): Promise<void> {
  const db = firestore();
  const ref = db.collection(collection).doc(id);

  await db.runTransaction(async (tx) => {
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
  /** The document id, which is the Google `sub`. */
  userId: string;
  schoolId: string | null;
  email: string | null;
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
    googleConnected: Boolean(data.google_connected_at),
    onboardingComplete: data.onboarding_complete === true,
  };
}

/**
 * Finds a student from their Firebase uid.
 *
 * This query is the seam created by verifying a phone before connecting Google.
 * The session knows a Firebase uid; the documents are keyed by the Google `sub`,
 * which does not exist until the grant completes. So there is no direct read
 * available, and a signed-in student with no document at all is the normal
 * state for the first half of onboarding rather than an error.
 *
 * Single-field equality, so Firestore's automatic index covers it and no
 * composite index has to be deployed alongside this.
 */
export async function getUserByAuthUid(authUid: string): Promise<UserRecord | null> {
  const found = await firestore()
    .collection("users")
    .where("auth_uid", "==", authUid)
    .limit(1)
    .get();

  const snap = found.docs[0];
  return snap ? toRecord(snap) : null;
}

/**
 * Records the access grant. This is where the user document is born.
 *
 * Called from the OAuth callback, which is the first moment a Google `sub`
 * exists at all: the student verified a phone before this, and a phone session
 * carries no `sub` to key a document by. So nothing is written during the first
 * half of onboarding, and this one write binds the two identities together.
 *
 * Creating it here also means a student who abandons the rest of the wizard
 * still has a row. Their refresh token is already in Secret Manager by this
 * point, and a token with no user record is an orphan nobody can find to delete.
 *
 * `phone_number` is carried in from the session rather than collected again. It
 * was verified by an SMS round trip, which is a stronger claim than any field on
 * a form, and re-asking would invite a student to type a different number.
 */
export async function recordGoogleConnection(args: {
  userId: string;
  email: string;
  schoolId: string;
  authUid: string;
  phoneNumber: string;
}): Promise<void> {
  await setStamped(
    "users",
    args.userId,
    {
      id: args.userId,
      email: args.email,
      school_id: args.schoolId,
      // The bridge between the two ids. Everything downstream is keyed by the
      // Google `sub`, and this is the only way back to the Firebase Auth record
      // that holds the phone -- which is what a support request or a deletion
      // request will arrive holding.
      auth_uid: args.authUid,
      phone_number: args.phoneNumber,
      google_connected_at: FieldValue.serverTimestamp(),
    },
    // Insert-only: a student who reconnects Google after finishing should not
    // be dragged back to incomplete. Written explicitly rather than left absent
    // so `where("onboarding_complete", "==", false)` can actually find them --
    // Firestore equality never matches a missing field.
    { onboarding_complete: false },
  );
}

/**
 * Writes the portal username to Firestore and the password to Secret Manager.
 *
 * Order matters: the secret is written first, so a failure leaves a stored
 * password with no document pointing at it (recoverable, and the name is
 * deterministic) rather than a document promising a credential that does not
 * exist (which the agent would fail on at 3am with no way to tell why).
 */
export async function savePortalCredentials(args: {
  userId: string;
  username: string;
  password: string;
}): Promise<void> {
  await storePortalPassword(args.userId, args.password);

  await setStamped("credentials", args.userId, {
    user_id: args.userId,
    username: args.username,
    // A pointer, not a credential. Safe to read, log, and export.
    secret_name: secretName(args.userId),
  });
}

export async function markOnboardingComplete(userId: string): Promise<void> {
  await setStamped("users", userId, {
    onboarding_complete: true,
    onboarding_completed_at: FieldValue.serverTimestamp(),
  });
}
