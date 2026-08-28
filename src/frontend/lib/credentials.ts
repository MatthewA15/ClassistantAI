import "server-only";

import { KeyManagementServiceClient } from "@google-cloud/kms";

import { firestore } from "@/lib/firebaseAdmin";
import {
  generateDataKey,
  generateIv,
  sealWithDataKey,
  toBase64,
} from "@/lib/envelope";
import { setStampedRef } from "@/lib/users";

/**
 * The outer layer of the credential envelope, and the write to Firestore.
 *
 * Implements §2, §5 and §6 of docs/ENCRYPTION_CONTRACT.md. The inner AES layer
 * is in lib/envelope.ts, which is isomorphic; everything here needs a service
 * account and so is server-only.
 *
 * The security property this file is responsible for is an absence: this app
 * holds `cryptoKeyEncrypter` on both keys and `cryptoKeyDecrypter` on neither,
 * so there is deliberately no `unwrapDataKey` below and no way to add one that
 * would work. The frontend can lock a credential away and cannot open it again.
 * Reading is the connector's job for refresh tokens, and the agent's for school
 * passwords, each holding decrypt on one key only (contract §1).
 */

/**
 * Which KMS key wraps which credential, and this mapping is the separation.
 *
 * Two keys rather than one is the whole reason the connector cannot read a
 * school password: it holds decrypt on `classistant-key` alone, so a password
 * wrapped under `classistant-password-key` is unreadable to it no matter what
 * bug or compromise it suffers. Sending both through one key would collapse
 * that guarantee into a code review promise.
 */
const KEY_FOR: Record<CredentialType, string> = {
  google_refresh_token: "classistant-key",
  school_password: "classistant-password-key",
};

export type CredentialType = "google_refresh_token" | "school_password";

const KMS_LOCATION = "us-central1";
const KMS_KEYRING = "classistant-keyring";

/**
 * Whether to bind each wrapped data key to one student with AAD.
 *
 * Contract §5. This must match `KMS_AAD_SOURCE` on the connector exactly: KMS
 * fails closed when the AAD replayed at decrypt differs from the one supplied
 * at encrypt, so a disagreement here is a total, silent read failure rather
 * than a degraded one. It is a constant and not configuration for that reason
 * -- an env var would let the two sides drift apart at deploy time, which is
 * the one way this can break in production and not in a test.
 *
 * On, because it costs one argument and it stops an attacker who can write
 * Firestore from moving user A's wrapped key into user B's document.
 */
const USE_AAD = true;

let kms: KeyManagementServiceClient | undefined;

function kmsClient(): KeyManagementServiceClient {
  kms ??= new KeyManagementServiceClient();
  return kms;
}

function projectId(): string {
  const id = process.env.GOOGLE_CLOUD_PROJECT ?? process.env.GCLOUD_PROJECT;
  if (!id) throw new Error("GOOGLE_CLOUD_PROJECT is not set");
  return id;
}

function keyName(type: CredentialType): string {
  return kmsClient().cryptoKeyPath(
    projectId(),
    KMS_LOCATION,
    KMS_KEYRING,
    KEY_FOR[type],
  );
}

/** What §3 says a credential document holds, minus the timestamps Firestore
 *  stamps itself. */
export type SealedCredential = {
  user_id: string;
  credential_type: CredentialType;
  encrypted_credential: string;
  encrypted_dkey: string;
  iv: string;
};

/**
 * Wraps a data key with Cloud KMS.
 *
 * Two details here are contract, not preference, and both are invisible
 * failures if got wrong:
 *
 * The plaintext handed to KMS is the base64 *text* of the key bytes, encoded
 * UTF-8 -- not the 32 raw bytes. The connector base64-decodes what it gets back
 * (issue #12 step 2), so raw bytes would unwrap to something 24 bytes long and
 * fail as an AES key length error, pointing at the wrong layer entirely.
 *
 * The AAD is the uid as UTF-8. See USE_AAD above.
 */
async function wrapDataKey(
  dkey: Uint8Array,
  uid: string,
  type: CredentialType,
): Promise<Uint8Array> {
  const [result] = await kmsClient().encrypt({
    name: keyName(type),
    plaintext: Buffer.from(toBase64(dkey), "utf8"),
    ...(USE_AAD ? { additionalAuthenticatedData: Buffer.from(uid, "utf8") } : {}),
  });

  if (!result.ciphertext) throw new Error("KMS returned no ciphertext");
  // The generated client types this as string | Uint8Array: it is bytes over
  // gRPC and base64 text over REST, and which one arrives depends on transport
  // rather than on anything this code chooses.
  return typeof result.ciphertext === "string"
    ? new Uint8Array(Buffer.from(result.ciphertext, "base64"))
    : new Uint8Array(result.ciphertext);
}

/**
 * Seals one credential into the three stored fields. No Firestore write.
 *
 * Split out from `storeCredential` so the bytes can be checked in a test
 * without a database, and so a caller that already has a ciphertext from the
 * browser -- which is where a school password should be sealed, since it is
 * typed there and need never leave in the clear -- can wrap and store without
 * going through this.
 */
export async function sealCredential(args: {
  uid: string;
  type: CredentialType;
  plaintext: string;
}): Promise<SealedCredential> {
  const dkey = generateDataKey();
  const iv = generateIv();

  // Contract §6: encrypt first, write second. Nothing is persisted until every
  // one of these has succeeded, so a failure leaves no half-written document
  // promising a credential that is not there.
  const sealed = await sealWithDataKey(args.plaintext, dkey, iv);
  const wrapped = await wrapDataKey(dkey, args.uid, args.type);

  // Best effort, and worth doing even though it is not a guarantee: V8 may
  // have copied these bytes elsewhere, but the copy this code controls should
  // not outlive the ciphertext.
  dkey.fill(0);

  return {
    user_id: args.uid,
    credential_type: args.type,
    encrypted_credential: toBase64(sealed),
    encrypted_dkey: toBase64(wrapped),
    iv: toBase64(iv),
  };
}

/** `users/{uid}/credentials/{credential_type}` -- contract §2. A subcollection,
 *  so deleting a student is one recursive delete and the connector's read is a
 *  direct document get with no query and no index. */
function credentialRef(uid: string, type: CredentialType) {
  return firestore()
    .collection("users")
    .doc(uid)
    .collection("credentials")
    .doc(type);
}

/**
 * Seals a credential and writes it. The only function onboarding should call.
 *
 * `created_at` is stamped on insert only, so a student who re-onboards or
 * changes a password keeps their original date (contract §6).
 */
export async function storeCredential(args: {
  uid: string;
  type: CredentialType;
  plaintext: string;
}): Promise<void> {
  const doc = await sealCredential(args);
  await setStampedRef(credentialRef(args.uid, args.type), doc);
}
