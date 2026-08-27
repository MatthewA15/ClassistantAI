# ADR-0004: Credential storage moves to Firestore + KMS envelope encryption; OAuth login moves to the frontend

- **Status:** accepted
- **Date:** 2026-08-26
- **Deciders:** Matthew, Richard (frontend), Chim, Obalua

## Context
ADR-0002 put per-user refresh tokens in Secret Manager, one secret per user. Two things changed since then (issue #12):

1. **Cost scales with users.** Secret Manager bills per secret (plus per access). At real user counts — not hackathon-demo counts — one secret per user turns into a per-user cost line, on top of the storage this app already needs in Firestore (`users`, and now credentials) for the frontend and agent.
2. **Login belongs with the frontend.** The Next.js app already needs to run its own auth for its own session; having the connector service *also* run a separate OAuth flow (`/auth/login`, `/auth/callback`) duplicated that logic and gave the agent two different identity systems to reconcile (Google `sub` from this service vs. Firebase UID everywhere else the frontend/agent already operate).

Also unlike ADR-0002 — which explicitly scoped itself to (A) Google account access and deferred (B) school-portal passwords — this decision has to hold for **both** credential types from day one, since they now share one Firestore collection.

## Decision
- Login moves entirely to the frontend. It runs the authorization-code exchange in its own callback; this service never receives an authorization code and no longer has `/login` or `/callback` endpoints.
- Per-user credentials move to a Firestore collection, `user_credentials`, one doc per `(user_id, credential_type)` pair — `user_id` is now the Firebase UID, not a Google `sub`.
- Each doc is envelope-encrypted: the frontend generates a random AES-256-GCM data key (`dkey`) and IV, encrypts the credential locally, then wraps `dkey` with a **Cloud KMS symmetric key** and stores `encrypted_credential` / `encrypted_dkey` / `iv`, all base64.
- IAM enforces a one-way split on each KMS key: the frontend's service account holds `cloudkms.cryptoKeyEncrypterDecrypter`'s encrypt half only; this service holds decrypt only. Plaintext credentials and unwrapped data keys never reach the frontend from this side, and this service can never *originate* a credential, only read one the frontend already wrote.
- There are **two separate KMS keys**, one per `credential_type` (`google_refresh_token`, `school_password`). This service is granted `roles/cloudkms.cryptoKeyDecrypter` on the refresh-token key **only**. It is structurally incapable of decrypting a `school_password` doc even if it queried for one — not by convention, by a missing IAM grant. (Reading a `school_password` doc at all remains something this service's code should never do; the missing key access is the backstop, not the plan.)
- The refresh-token grant against Google's token endpoint still requires client authentication for a web-application client, so `google_client_id`/`google_client_secret` stay in this service's config — they now must be the frontend's OAuth client, since a refresh token is only valid against the client that issued it.

## Alternatives considered
- **Keep Secret Manager, one secret per user** — status quo; the cost driver above doesn't go away, and it still requires this service to run its own OAuth flow duplicate to the frontend's.
- **One shared KMS key for both credential types** — simpler IAM setup, but collapses the least-privilege boundary this ADR exists to establish: any service with decrypt rights on "the" key could read school passwords too. Two keys make the separation an IAM fact, not a code-review-enforced convention.
- **Firestore with no envelope encryption (rely on Firestore's at-rest encryption alone)** — no per-service, per-credential-type IAM boundary; anything that can read the Firestore doc can read the plaintext credential. Envelope encryption keeps a compromised Firestore read from being a compromised credential.

## Consequences
- Cost no longer scales per-secret; Firestore + KMS billing is per-operation, not per-stored-credential.
- This service is stateless as before: every request still does Firestore query → KMS decrypt → AES-GCM decrypt → token exchange, cached per user until expiry.
- This service is now structurally unable to read `school_password` credentials — it holds no decrypt grant on that key. That is the actual security guarantee, not "we don't write code that queries for it."
- New failure mode this service didn't have before: the frontend's encrypt path and this service's decrypt path must agree byte-for-byte on IV encoding, dkey encoding inside the KMS plaintext, GCM tag placement, and (if used) AAD. A mismatch fails closed with a `500` (`CredentialFormatError`), not silent corruption — see API_CONTRACT.md v0.4. Several of these (KMS key location/region, whether AAD is used, dkey encoding) were still unconfirmed with the team at the time of this migration; the code makes each one a configurable setting with a `TODO(matthew)` rather than guessing a value.
- ADR-0002 is **superseded by this ADR** for the parts it covered — refresh-token storage and the login flow. Its scope note deferring school-password storage (part B) is carried forward here rather than resolved: this ADR only establishes that this service must never be able to decrypt that credential type, not how the password vault/injector itself works.
