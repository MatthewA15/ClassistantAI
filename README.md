# ClassyAI

## Classistant AI Connectors

FastAPI service exposing Gmail / Calendar / Drive / Docs as HTTP tools for the Classistant AI ADK agent. See `API_CONTRACT.md` (frozen contract for the agent side) and `docs/adr/` for why decisions were made.

## Local dev

```bash
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env   # fill in values from GCP setup below
# Secret Manager auth for local dev:
gcloud auth application-default login
uvicorn app.main:app --reload --port 8080
```

Open http://localhost:8080/docs for interactive Swagger. Test flow: `GET /auth/login` → open `auth_url` in a browser → callback returns `{user_id}` → `GET /users/{user_id}/emails`.

## GCP setup (one-time, ~20 min)

1. Create project → note `PROJECT_ID`. Add teammates as **Editor** (IAM) so Richard can grab the OAuth client ID for the onboarding page.
2. Enable APIs: `gcloud services enable gmail.googleapis.com calendar-json.googleapis.com drive.googleapis.com docs.googleapis.com secretmanager.googleapis.com run.googleapis.com`
3. **OAuth consent screen** (APIs & Services): External → app name Classistant AI → add all teammates as **test users** (unverified apps only allow test users — fine for the demo).
4. **Credentials → Create OAuth client ID → Web application**. Authorized redirect URIs: `http://localhost:8080/auth/callback` now; add the Cloud Run URL after first deploy. Copy client ID/secret into `.env`. Share the client ID with Richard for the Next.js login button.
5. Grant the Cloud Run service account `roles/secretmanager.admin` on the project (it creates per-user secrets).

## Deploy to Cloud Run

```bash
gcloud run deploy classistant-connectors --source . --region us-central1 \
  --set-env-vars GCP_PROJECT_ID=...,GOOGLE_CLIENT_ID=...,GOOGLE_CLIENT_SECRET=...,OAUTH_REDIRECT_URI=https://<service-url>/auth/callback \
  --allow-unauthenticated
```

Then add the deployed `/auth/callback` URL to the OAuth client's redirect URIs. (Hackathon note: `--allow-unauthenticated` keeps the demo simple; locking this behind an API key or IAM for the agent is on the post-Saturday list.)

## Status vs Saturday scope

| Feature | Priority | Status |
|---|---|---|
| OAuth login + Secret Manager tokens | P0 | code complete, needs GCP config |
| Read emails | P1 | code complete |
| Get calendar events | P1 | code complete |
| Add calendar events | P1 | code complete |
| List Drive files | P2 | code complete |
| Create email drafts (no send) | P2 | code complete |
| Create Google Docs | P2 | code complete |
