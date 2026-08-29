/**
 * The credential write path, end to end, against real Cloud KMS.
 *
 *   FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 GOOGLE_CLOUD_PROJECT=classisstant \
 *     npm run verify:credentials
 *
 * ENCRYPTION_CONTRACT.md §10 asks for one real onboarding run before the demo.
 * This is the part of that check which does not need a student, a phone, or
 * Google: it calls the same `savePortalCredentials` the wizard calls, then reads
 * the document back and checks every byte-level property the contract fixes.
 *
 * Firestore is emulated. **KMS is not**, and cannot be -- there is no emulator
 * for it, so the wrap below is a real encrypt under `classistant-password-key`
 * with the project's real IAM. That is the point: the AES layer is covered by
 * lib/envelope.test.ts against the connector's own Python, and the thing this
 * adds is proof that this principal can actually reach the *second* key. That
 * grant is separate from the refresh-token key's, was added later, and its
 * absence looks like a working app right up until a student submits step two.
 *
 * Nothing is decrypted here, because this application holds no decrypt role on
 * either key and never should (contract §1). What can be proven from this side
 * is the shape, the key identity, and the absence of the plaintext -- which is
 * every failure mode that does not announce itself.
 *
 * Safe to run repeatedly. It writes under a fixed test uid and deletes it.
 */
import assert from "node:assert/strict";

import { KeyManagementServiceClient } from "@google-cloud/kms";

import { KEY_FOR } from "@/lib/credentials";
import { firestore } from "@/lib/firebaseAdmin";
import { savePortalCredentials } from "@/lib/portalCredentials";

const UID = "verify-credential-write-uid";
const USERNAME = "s1234567";
const PASSWORD = "correct horse battery staple ünïcode";

/** Refuses to run against the real database. Every check below writes. */
if (!process.env.FIRESTORE_EMULATOR_HOST) {
  console.error(
    "FIRESTORE_EMULATOR_HOST is not set. This script writes documents, so it " +
      "will not run against the real project.\n\n" +
      "  firebase emulators:start   (in another terminal)\n" +
      "  FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 GOOGLE_CLOUD_PROJECT=classisstant \\\n" +
      "    npm run verify:credentials",
  );
  process.exit(1);
}

const b64 = (value: string) => Buffer.from(value, "base64");
const checks: string[] = [];
const ok = (label: string) => checks.push(`  ok  ${label}`);

const credRef = firestore()
  .collection("users")
  .doc(UID)
  .collection("credentials")
  .doc("school_password");

// 1 ------------------------------------------------------- the mapping
assert.equal(KEY_FOR.school_password, "classistant-password-key");
assert.equal(KEY_FOR.google_refresh_token, "classistant-key");
ok("school_password maps to classistant-password-key, refresh token to classistant-key");

// 2 ------------------------------ the real write path, emulator + real KMS
await savePortalCredentials({ userId: UID, username: USERNAME, password: PASSWORD });
ok("savePortalCredentials() completed against the emulator and real KMS");

const snap = await credRef.get();
assert.ok(snap.exists, "users/{uid}/credentials/school_password was not written");
const doc = snap.data()!;
ok("users/{uid}/credentials/school_password exists");

// 3 ------------------------------------------------ contract §3, the fields
assert.deepEqual(
  Object.keys(doc).sort(),
  [
    "created_at",
    "credential_type",
    "encrypted_credential",
    "encrypted_dkey",
    "iv",
    "updated_at",
    "user_id",
  ],
  "document fields do not match ENCRYPTION_CONTRACT.md §3 exactly",
);
assert.equal(doc.user_id, UID);
assert.equal(doc.credential_type, "school_password");
ok("fields are exactly the seven §3 names -- no plaintext field, no secret_name");

// 4 -------------------------------------------------- contract §4, the bytes
assert.equal(b64(doc.iv).length, 12, "iv must be 12 raw bytes");
assert.equal(
  b64(doc.encrypted_credential).length,
  Buffer.byteLength(PASSWORD, "utf8") + 16,
  "ciphertext must be exactly plaintext length + the 16-byte GCM tag",
);
ok("iv is 12 bytes; ciphertext is plaintext+16, so the GCM tag is appended");

assert.ok(!JSON.stringify(doc).includes(PASSWORD), "plaintext password found in the document");
assert.ok(
  !b64(doc.encrypted_credential).toString("utf8").includes(PASSWORD),
  "password recoverable from encrypted_credential without a key",
);
ok("the password appears nowhere in the stored document");

// 5 ------------------------------------------------- contract §5, the wrap
assert.ok(
  b64(doc.encrypted_dkey).length > 44,
  "encrypted_dkey is too short to be a KMS wrap -- is the dkey being stored bare?",
);
ok(`encrypted_dkey is ${b64(doc.encrypted_dkey).length} bytes of KMS ciphertext`);

// KMS names the key version it used in its response, which is the only way to
// show from this side which key the wrap actually went through.
const kms = new KeyManagementServiceClient();
const [probe] = await kms.encrypt({
  name: kms.cryptoKeyPath(
    process.env.GOOGLE_CLOUD_PROJECT!,
    "us-central1",
    "classistant-keyring",
    KEY_FOR.school_password,
  ),
  plaintext: Buffer.from("probe", "utf8"),
  additionalAuthenticatedData: Buffer.from(UID, "utf8"),
});
assert.ok(
  probe.name?.includes("/cryptoKeys/classistant-password-key/cryptoKeyVersions/"),
  `KMS used an unexpected key: ${probe.name}`,
);
ok(`KMS accepted an AAD-bound encrypt on ${probe.name}`);

// 6 --------------------------------------- the username, and where it is not
const user = await firestore().collection("users").doc(UID).get();
assert.equal(user.data()?.school_username, USERNAME);
ok("users/{uid}.school_username holds the portal username");

const retired = await firestore().collection("credentials").doc(UID).get();
assert.ok(!retired.exists, "the retired top-level credentials/{uid} document was written");
ok("nothing was written to the retired top-level credentials/{uid}");

// 7 -------------------------- re-onboarding keeps created_at, rotates the IV
const firstCreated = doc.created_at.toMillis();
await savePortalCredentials({ userId: UID, username: USERNAME, password: "a different one" });
const second = (await credRef.get()).data()!;
assert.equal(second.created_at.toMillis(), firstCreated, "created_at was reset on re-write");
assert.notEqual(second.iv, doc.iv, "IV was reused across writes -- this breaks GCM");
ok("a second write keeps created_at and generates a fresh IV");

// ------------------------------------------------------------------ teardown
await credRef.delete();
await firestore().collection("users").doc(UID).delete();

console.log(checks.join("\n"));
console.log("\nall checks passed");
