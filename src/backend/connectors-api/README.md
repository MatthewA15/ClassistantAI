# Classistant AI Connectors

FastAPI service exposing Gmail / Calendar / Drive / Docs as HTTP tools for the Classistant AI ADK agent. See [`API_CONTRACT.md`](API_CONTRACT.md) (frozen contract for the agent side) and [`docs/adr/`](../../../docs/adr/) for why decisions were made.

This service lives at `src/backend/connectors-api/` inside the ClassyAI monorepo. **Every command below is run from this directory**, not the repo root. Paths written as `docs/...` mean the repo's shared `docs/` three levels up — the encryption contract and the ADRs are shared with the frontend, so they are not owned by this service.

## Local dev

```bash
cd src/backend/connectors-api
python -m venv .venv && source .venv/bin/activate
pip install -r requirements-dev.txt   # requirements.txt is enough for running, not testing
cp .env.example .env   # fill in values from GCP setup below
# Firestore + KMS auth for local dev:
gcloud auth application-default login
uvicorn app.main:app --reload --port 8080
```

Open http://localhost:8080/docs for interactive Swagger. This service no longer runs login — a `user_id` (Firebase UID) comes from the frontend's own login flow, which writes the encrypted `google_refresh_token` credential to Firestore. Test flow once that user exists: `GET /users/{user_id}/emails`.

Run tests: `pytest` from this directory (mocks Firestore/KMS, no live GCP access needed — see [`docs/adr/0004-firestore-kms-credentials-and-frontend-login.md`](../../../docs/adr/0004-firestore-kms-credentials-and-frontend-login.md)). `tests/conftest.py` finds `app/` by walking up from its own file, so there is no `pytest.ini` and no rootdir to configure; running it from the repo root instead will not collect.

## GCP setup (one-time, ~20 min)

1. Create project → note `PROJECT_ID` (`classisstant`, double-s — see the repo-root [`.firebaserc`](../../../.firebaserc)). Add teammates as **Editor** (IAM).
2. Enable APIs: `gcloud services enable gmail.googleapis.com calendar-json.googleapis.com drive.googleapis.com docs.googleapis.com firestore.googleapis.com cloudkms.googleapis.com run.googleapis.com`
3. **OAuth consent screen** (APIs & Services): External → app name Classistant AI → add all teammates as **test users** (unverified apps only allow test users — fine for the demo). The OAuth **client** itself now belongs to the frontend (Richard) — this service only needs its client_id/secret in `.env` to authenticate the refresh-token grant.
4. **KMS**: create keyring `classistant-keyring` and key `classistant-key` (region: TODO(matthew) — not yet confirmed, see `.env.example`). Grant this service's SA `roles/cloudkms.cryptoKeyDecrypter` on the refresh-token key only — never on the school-password key.
5. **Firestore**: `users/{uid}/credentials/{credential_type}` subcollection (frontend writes it during login/onboarding). This service only needs read access, and only ever reads the `google_refresh_token` document.

## Deploy to Cloud Run

**The build context is this directory, not the repo root.** `Dockerfile` does
`COPY app ./app`, resolved against whatever `--source` points at — so deploying
from the repo root produces an image with no application in it: the build
succeeds and the container then fails at boot with `ModuleNotFoundError: app`.
Either `cd` here first:

```bash
cd src/backend/connectors-api
gcloud run deploy classistant-connectors \
    --source . \
    --region us-central1 \
    --set-env-vars GOOGLE_CLIENT_ID=...,GOOGLE_CLIENT_SECRET=...,KMS_LOCATION=...,KMS_KEYRING=classistant-keyring,KMS_KEY=classistant-key \
```

Same rule for a plain `docker build src/backend/connectors-api`. The
`Dockerfile` itself needs no change; only the context does.

## What the frontend writes to Firestore

The connector reads credentials it never writes. The authority on the byte
format is [`docs/ENCRYPTION_CONTRACT.md`](../../../docs/ENCRYPTION_CONTRACT.md);
what follows is a map so that reading `app/services/firestore_creds.py` does
not require a trip through the Next.js app. If the two disagree, the contract
wins.

```
users/{firebase_uid}                                     <- profile, consent, access switches
users/{firebase_uid}/credentials/google_refresh_token     <- the only document this service reads
users/{firebase_uid}/credentials/school_password          <- exists; this service must never touch it
```

`{firebase_uid}` is the **Firebase Auth uid**, and it is the same `{user_id}`
that every `/users/{user_id}/...` endpoint takes. Not the Google `sub` — that
ambiguity is settled in ENCRYPTION_CONTRACT.md §9. It is also the `users`
document id, so a single identifier addresses the profile, the subcollection
and this API.

Fields on a `credentials/{credential_type}` document:

| Field | Meaning |
|---|---|
| `user_id` | the Firebase uid again, denormalised (the path already carries it) |
| `credential_type` | `google_refresh_token` or `school_password`; matches the document id |
| `encrypted_credential` | base64 of AES-256-GCM(dkey, iv, credential) with the **16-byte tag appended** to the ciphertext |
| `encrypted_dkey` | base64 of the KMS ciphertext wrapping `dkey`. The KMS plaintext is the base64 *text* of the raw 32 bytes, not the bytes |
| `iv` | base64 of the 12 raw IV bytes, generated fresh on every write |
| `created_at` / `updated_at` | server timestamps; `created_at` on insert only |

AAD on the KMS wrap is `utf8_bytes(uid)`, replayed on decrypt
(`KMS_AAD_SOURCE=user_id`). It has to match on both sides or KMS fails closed;
`KMS_AAD_SOURCE=none` is the all-or-nothing alternative.

The parent `users/{uid}` document is written by the frontend's
`src/frontend/lib/users.ts` and carries `email`, `name`, `phone_number`,
`school_id`, `google_sub`, `service_email`, `google_connected_at`,
`onboarding_complete`, `onboarding_completed_at`, `created_at`/`updated_at`,
plus two maps: `consent` (`terms`/`sms`/`marketing`, each
`{granted, at, ip, wording}`, kept as CASL and A2P evidence) and `access`.

`access` maps `gmail_read` / `gmail_drafts` / `calendar` / `drive_read` /
`docs` to booleans — the switches the student actually set. The Google grant is
one token covering the whole scope set, so these are enforced on our side or
not at all. **This service does not currently read `access`**; see the
`TODO(matthew)` in `app/services/firestore_creds.py`.

## Status vs Saturday scope

| Feature | Priority | Status |
|---|---|---|
| Firestore + KMS credential storage | P0 | code complete, needs live login flow + KMS region to verify end-to-end |
| Read emails | P1 | code complete |
| Get calendar events | P1 | code complete |
| Add calendar events | P1 | code complete |
| List Drive files | P2 | code complete |
| Create email drafts (no send) | P2 | code complete |
| Create Google Docs | P2 | code complete |
