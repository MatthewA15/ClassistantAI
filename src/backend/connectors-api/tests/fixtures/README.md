# Frozen credential fixtures

One file belongs here: `google_refresh_token.json`, a credential document
captured verbatim from a Firestore emulator run of the **frontend's** write
path. `tests/test_firestore_creds.py::test_decrypts_frozen_document_captured_from_the_emulator`
reads it, mocks only the KMS unwrap, and runs the real read path over it.

It is the one test that can catch the failure that actually matters: the
frontend's encrypter drifting from
[`docs/ENCRYPTION_CONTRACT.md`](../../../../../docs/ENCRYPTION_CONTRACT.md).
The round-trip test next to it builds its own ciphertext, so it can only ever
prove this service is self-consistent.

The file is absent until captured, and the test skips while it is. That is
deliberate — it keeps the suite green without pretending the coverage exists.

## TODO(matthew): capture it

**Encrypt a throwaway string, never a live refresh token.** The fixture has to
carry the dkey in cleartext to be decryptable without a KMS call, so whatever
was encrypted is readable by anyone with the repo. Onboard against the
emulator with a stub credential value, or temporarily feed the frontend's
encrypt helper a known string.

1. Start the Firestore emulator and run the frontend's onboarding write path
   against it, with the credential value set to something disposable —
   `fixture-not-a-real-token` does fine.
2. Log the raw 32-byte `dkey` from the frontend's encrypt helper before it is
   wrapped, base64'd. This is the only value not already in the document, and
   the reason the capture needs a one-off code change on the frontend side.
   Remove that logging afterwards.
3. Read the document back out of the emulator and copy the three encrypted
   fields verbatim. `encrypted_dkey` stays as the frontend wrote it: it is a
   real KMS ciphertext, is never decrypted by the test, and only exists in the
   fixture so a change in how it is encoded still shows up in review.

```json
{
  "captured_at": "YYYY-MM-DD",
  "captured_from": "firestore emulator, frontend onboarding write path",
  "user_id": "<the Firebase uid the document was written under>",
  "plaintext": "fixture-not-a-real-token",
  "dkey_b64": "<base64 of the raw 32-byte dkey>",
  "aad_source": "user_id",
  "document": {
    "encrypted_credential": "<verbatim from Firestore>",
    "encrypted_dkey": "<verbatim from Firestore>",
    "iv": "<verbatim from Firestore>"
  }
}
```

`aad_source` records whether the frontend passed AAD on the KMS encrypt call.
Set it to `"none"` only if the frontend omits AAD — and if it does, that is a
contract decision (ENCRYPTION_CONTRACT.md §5, "all-or-nothing on both sides"),
not a fixture detail.
