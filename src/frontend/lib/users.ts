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
  });
}

/**
 * Marks a user as having connected Google, before the rest of the wizard is
 * filled in.
 *
 * Called from the OAuth callback, where all we know is identity. The document
 * is created here so a student who abandons onboarding halfway still has a row
 * -- their refresh token is already in Secret Manager at that point, and a
 * token with no user record is an orphan nobody can find to delete.
 */
export async function recordGoogleConnection(args: {
  userId: string;
  email: string;
  schoolId: string;
}): Promise<void> {
  await setStamped(
    "users",
    args.userId,
    {
      id: args.userId,
      email: args.email,
      school_id: args.schoolId,
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
