import "server-only";

import { getApps, initializeApp, applicationDefault } from "firebase-admin/app";
import { getFirestore, type Firestore } from "firebase-admin/firestore";

/**
 * Firestore admin handle.
 *
 * On App Hosting there are no credentials to configure: the runtime exposes the
 * firebase-app-hosting-compute service account through ADC, and that account
 * holds roles/datastore.user on the project. Locally, `gcloud auth
 * application-default login` provides the same thing.
 *
 * GOOGLE_APPLICATION_CREDENTIALS (a key file path) is honoured if present, but
 * nothing in this repo sets it and nothing should: exported SA keys are the
 * single most common way a project's data ends up in someone else's hands.
 */

let db: Firestore | undefined;

export function firestore(): Firestore {
  if (db) return db;

  if (getApps().length === 0) {
    const projectId =
      process.env.GOOGLE_CLOUD_PROJECT ??
      process.env.GCLOUD_PROJECT ??
      process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;

    initializeApp({ credential: applicationDefault(), projectId });
  }

  db = getFirestore();
  // Firestore rejects undefined values by default, which turns an optional
  // field the wizard did not collect into a runtime throw halfway through
  // onboarding. Dropping them is the behaviour every write here wants.
  db.settings({ ignoreUndefinedProperties: true });
  return db;
}

// Re-exported so callers do not each import from firebase-admin directly.
export { FieldValue, Timestamp } from "firebase-admin/firestore";
