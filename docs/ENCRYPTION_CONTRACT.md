# Credential Encryption Contract — v1.0

**Owner of the write path:** frontend (`@chimwopara`)
**Owner of the read path:** connector service (`@MatthewA15`)
**Scope:** what the frontend must produce so the connector can decrypt it.

This document exists because envelope encryption is only interoperable if both
sides agree on the *bytes*, not just the concept. Every field below is
byte-exact. A mismatch on any one of them produces an authentication failure
at decrypt time with no useful error message, so it is worth being tedious
here rather than debugging it live.

---

## 1. Division of responsibility

| | Frontend (Next.js) | Connector (FastAPI) | Agent backend |
|---|---|---|---|
| Runs the OAuth code exchange | **yes** | no | no |
| Encrypts credentials | **yes** | no | no |
| Decrypts `google_refresh_token` | no | **yes** | no |
| Decrypts `school_password` | no | **never** | yes (in the tool wrapper) |
| KMS role on refresh-token key | `cryptoKeyEncrypter` | `cryptoKeyDecrypter` | none |
| KMS role on password key | `cryptoKeyEncrypter` | **none** | `cryptoKeyDecrypter` |

The one-way guarantee is enforced by IAM, not by cryptography: the frontend
can lock things and cannot open them; the connector can open refresh tokens
and nothing else.

### The client secret is a deliberate exception

Both the frontend and the connector need the OAuth `client_secret`:

- the **frontend** needs it to exchange the authorization code for a refresh
  token (`authorization_code` grant);
- the **connector** needs it to exchange a refresh token for an access token
  (`refresh_token` grant). Google requires client authentication on that call
  for a web-application client — there is no way around it.

This is not a break in credential separation. The client secret identifies
*the application*; the refresh token identifies *a student*. Only the second
is per-user and only the second is what the envelope protects.

Both must use the **same OAuth client**. A refresh token issued by one client
cannot be redeemed by another — it fails with `invalid_client`.

---

## 2. Where the document lives

Subcollection, as proposed:

```
users/{uid}/credentials/{credential_type}
```

- `{uid}` is the Firebase Auth UID (which is also the `users` document id).
- `{credential_type}` is literally `google_refresh_token` or `school_password`.

Chosen over a composite id because it makes "delete this student" a single
recursive delete for the delete-my-data page, and because it turns the
connector's read into a direct document get with no index and no query.

## 3. Document fields

| Field | Type | Contents |
|---|---|---|
| `user_id` | string | the Firebase UID (denormalised; the doc path already has it) |
| `credential_type` | string | `"google_refresh_token"` \| `"school_password"` |
| `encrypted_credential` | string | base64 — see §4 |
| `encrypted_dkey` | string | base64 — see §5 |
| `iv` | string | base64 of the 12 raw IV bytes |
| `created_at` | timestamp | server time, on insert only |
| `updated_at` | timestamp | server time, every write |

No plaintext credential field, ever. No `secret_name` — Secret Manager is
being retired by issue #12.

---

## 4. `encrypted_credential` — the inner layer

```
algorithm        AES-256-GCM
dkey             32 bytes from a CSPRNG (crypto.randomBytes / getRandomValues)
iv               12 bytes from a CSPRNG   <- 96-bit, the GCM standard length
plaintext        the credential as UTF-8 bytes
auth tag         16 bytes
```

**The tag must be appended to the ciphertext**, i.e. the stored value is
`base64(ciphertext || tag)`.

This is the one detail most likely to go wrong, because the two Node APIs
differ:

- **Web Crypto** (`crypto.subtle.encrypt`) already returns `ciphertext || tag`
  as one buffer. Base64 that buffer directly — nothing else to do.
- **Node `crypto`** (`createCipheriv`) returns them separately. You must
  concatenate: `Buffer.concat([ciphertext, cipher.getAuthTag()])`.

Python's `AESGCM.decrypt` on the connector side expects the concatenated form,
which is why it is specified this way.

The `iv` field stores the same 12 bytes, base64'd, unencrypted. An IV is not
secret; it only has to be unique per encryption. **Generate a fresh one for
every write** — reusing an IV with the same key breaks GCM badly.

Clear the plaintext credential from memory as soon as the ciphertext exists.

---

## 5. `encrypted_dkey` — the outer layer

Wrap `dkey` with Cloud KMS:

```
project        classisstant          (double-s; permanent typo)
location       us-central1
keyring        classistant-keyring
key            classistant-key                  <- google_refresh_token
key            <name TBC by @obaodelana>        <- school_password
```

**KMS plaintext = the base64 *text* of the raw dkey bytes**, encoded UTF-8.
That is, `Buffer.from(dkey.toString("base64"), "utf8")`, not the raw 32 bytes.

This mirrors issue #12 step 2 ("decrypt `encrypted_dkey` and decode it to utf8
from base64") and is what the connector's unwrap already implements. It is one
extra hop versus sending raw bytes, but it matches the written spec both sides
have been reading, so it is not worth re-litigating now.

Store `base64(kms_ciphertext)` in the field.

### AAD

Pass **additional authenticated data** on the KMS encrypt call:

```
AAD = utf8_bytes(uid)
```

The exact same value is replayed on decrypt or KMS fails closed. This binds a
wrapped dkey to one student — an attacker with Firestore write access cannot
move user A's `encrypted_dkey` into user B's document and have it work.

If you would rather ship without AAD, say so and the connector will set
`KMS_AAD_SOURCE=none`. But it must be all-or-nothing on both sides, decided
before the first real credential is written.

---

## 6. Order of writes

Encrypt first, write second. A failure between them leaves nothing behind. A
document written before the ciphertext exists would promise the connector a
credential that isn't there, and it would fail at 3am with no way to tell why.

For re-onboarding, `set(..., {merge: true})` and stamp `created_at` only on
insert, matching the `setStamped` helper already in `lib/users.ts`.

---

## 7. Scopes must stay in lockstep

`GOOGLE_SCOPES` in `lib/googleOAuth.ts` must remain byte-identical to `scopes`
in the connector's `app/config.py` — currently nine entries including
`drive.readonly`. Google validates the granted set during the exchange; a
mismatch either drops permissions the agent needs or throws outright. Change
them in the same commit, both sides.

Keep `access_type=offline` and `prompt=consent` on the consent URL. Without
the first there is no refresh token at all; without the second a returning
student gets none on re-login.

---

## 8. What the frontend stops doing

- `lib/portalCredentials.ts` — Secret Manager write path is retired. The
  password follows the same envelope scheme as above, under the password key.
- `credentials/{uid}` with `secret_name` — replaced by §2.
- `google_sub` on the user document can be dropped; the connector is addressed
  by the Firebase UID (see §9).

## 9. Identity — settled

`/users/{user_id}/...` on the connector takes the **Firebase UID**. Not the
Google `sub`.

The `sub` is no longer something the connector hands anyone, since it no
longer runs the exchange. The UID is what the session carries, what the
`users` document is keyed by, and what the agent will send. One identifier
end to end.

`API_CONTRACT.md` will be updated to say so (v0.5, breaking).

---

## 10. Verification before the demo

A single onboarding run proves the whole chain:

1. Onboard one real student through the wizard.
2. Confirm `users/{uid}/credentials/google_refresh_token` exists with all
   three encrypted fields populated and no plaintext anywhere.
3. `GET {connector}/users/{uid}/emails?max_results=1` returns real mail.

If step 3 fails, the error identifies the layer:

| Error | Cause |
|---|---|
| `CredentialNotFound` | wrong doc path, or UID mismatch |
| KMS `PermissionDenied` | IAM roles not applied, or wrong key |
| KMS decrypt failure | AAD mismatch between the two sides |
| AES-GCM auth failure | tag not appended, or IV encoding differs |
| `invalid_client` | connector has the wrong client secret |
| `invalid_grant` | token issued by a different OAuth client |

---

## Open items

- [ ] `@obaodelana` — name of the second KMS key (school passwords), and IAM
      bindings per the table in §1.
- [ ] `@chimwopara` — confirm AAD in or out.
- [ ] `@chimwopara` — confirm the frontend has the client secret available
      server-side for the exchange.
- [ ] Both — the five remaining schema deltas from the issue thread
      (`email` → `school_email`, where `school_username` lives, etc.) are
      independent of this contract and still need answers.
