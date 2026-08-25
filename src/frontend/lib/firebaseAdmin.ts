import "server-only";

import { getApps, initializeApp, applicationDefault, type App } from "firebase-admin/app";
import { getAuth, type Auth } from "firebase-admin/auth";
import { getFirestore, type Firestore } from "firebase-admin/firestore";

/**
 * Firestore and Auth admin handles.
 *
 * On App Hosting there are no credentials to configure: the runtime exposes the
 * firebase-app-hosting-compute service account through ADC, and that account
 * holds roles/datastore.user on the project. Locally, `gcloud auth
 * application-default login` provides the same thing.
 *
 * Auth needs one thing Firestore does not. Minting a session cookie calls
 * Identity Toolkit's `:createSessionCookie`, which signs a JWT *as* the runtime
 * service account, so that account needs roles/iam.serviceAccountTokenCreator
 * on itself as well as roles/firebaseauth.admin. Without it every sign-in fails
 * at the last step with a permission error from the IAM signBlob API, long
 * after the student has already been through Google. See docs/design/15.
 *
 * GOOGLE_APPLICATION_CREDENTIALS (a key file path) is honoured if present, but
 * nothing in this repo sets it and nothing should: exported SA keys are the
 * single most common way a project's data ends up in someone else's hands.
 */

function adminApp(): App {
  const existing = getApps();
  if (existing.length > 0) return existing[0]!;

  const projectId =
    process.env.GOOGLE_CLOUD_PROJECT ??
    process.env.GCLOUD_PROJECT ??
    process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;

  return initializeApp({ credential: applicationDefault(), projectId });
}

let auth: Auth | undefined;

/** Verifies ID tokens and session cookies. See lib/authSession.ts, which is the
 *  only place that should be calling it. */
export function adminAuth(): Auth {
  if (!auth) auth = getAuth(adminApp());
  return auth;
}

let db: Firestore | undefined;

export function firestore(): Firestore {
  if (db) return db;

  db = getFirestore(adminApp());
  // Firestore rejects undefined values by default, which turns an optional
  // field the wizard did not collect into a runtime throw halfway through
  // onboarding. Dropping them is the behaviour every write here wants.
  db.settings({ ignoreUndefinedProperties: true });
  return db;
}

// Re-exported so callers do not each import from firebase-admin directly.
export { FieldValue, Timestamp } from "firebase-admin/firestore";
