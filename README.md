# ClassyAI

## Classistant AI Connectors

FastAPI service exposing Gmail / Calendar / Drive / Docs as HTTP tools for the Classistant AI ADK agent. See `API_CONTRACT.md` (frozen contract for the agent side) and `docs/adr/` for why decisions were made.

## Local dev

```bash
python -m venv .venv && source .venv/bin/activate
pip install -r requirements-dev.txt   # requirements.txt is enough for running, not testing
cp .env.example .env   # fill in values from GCP setup below
# Firestore + KMS auth for local dev:
gcloud auth application-default login
uvicorn app.main:app --reload --port 8080
```

Open http://localhost:8080/docs for interactive Swagger. This service no longer runs login — a `user_id` (Firebase UID) comes from the frontend's own login flow, which writes the encrypted `google_refresh_token` credential to Firestore. Test flow once that user exists: `GET /users/{user_id}/emails`.

Run tests: `pytest tests/` (mocks Firestore/KMS, no live GCP access needed — see `docs/adr/0004-firestore-kms-credentials-and-frontend-login.md`).

## GCP setup (one-time, ~20 min)

1. Create project → note `PROJECT_ID` (`classisstant`, double-s — see `.firebaserc`). Add teammates as **Editor** (IAM).
2. Enable APIs: `gcloud services enable gmail.googleapis.com calendar-json.googleapis.com drive.googleapis.com docs.googleapis.com firestore.googleapis.com cloudkms.googleapis.com run.googleapis.com`
3. **OAuth consent screen** (APIs & Services): External → app name Classistant AI → add all teammates as **test users** (unverified apps only allow test users — fine for the demo). The OAuth **client** itself now belongs to the frontend (Richard) — this service only needs its client_id/secret in `.env` to authenticate the refresh-token grant.
4. **KMS**: create keyring `classistant-keyring` and key `classistant-key` (region: TODO(matthew) — not yet confirmed, see `.env.example`). Grant this service's SA `roles/cloudkms.cryptoKeyDecrypter` on the refresh-token key only — never on the school-password key.
5. **Firestore**: `users/{uid}/credentials/{credential_type}` subcollection (frontend writes it during login/onboarding). This service only needs read access, and only ever reads the `google_refresh_token` document.

## Deploy to Cloud Run

```bash
gcloud run deploy classistant-connectors --source . --region us-central1 \
  --set-env-vars GCP_PROJECT_ID=classisstant,GOOGLE_CLIENT_ID=...,GOOGLE_CLIENT_SECRET=...,KMS_LOCATION=...,KMS_KEYRING=classistant-keyring,KMS_KEY=classistant-key \
  --allow-unauthenticated
```

(Hackathon note: `--allow-unauthenticated` keeps the demo simple; locking this behind an API key or IAM for the agent is on the post-Saturday list.)

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
