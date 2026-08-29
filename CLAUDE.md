# CLAUDE.md

## What this is

The **ClassistantAI** monorepo (remote `classistantai.git`) — a school assistant
students talk to over SMS. The directory is named `classistant-connectors` for
historical reasons; the connector service is one part of it. Rationale lives in
[docs/adr/](docs/adr/) (corrections are dated amendments in place, never edits
to the original decision) and [docs/design/](docs/design/) — read the relevant
one before changing something that looks arbitrary. Most of it is not.

## Architecture

| Piece | Path | Owns |
|---|---|---|
| Frontend — Next.js 15 App Router | [src/frontend/](src/frontend/) | Login, the OAuth authorization-code exchange, and envelope-encrypting credentials into Firestore. The **entire write side**. |
| Connectors — FastAPI on Cloud Run | [src/backend/connectors-api/](src/backend/connectors-api/) | Decrypts those credentials and calls Gmail / Calendar / Drive / Docs. **Decrypt-only**: no auth endpoints, no KMS encrypt call, no code path that names `school_password`. |
| Agent "Classy" — Google ADK | [src/agent/](src/agent/) | Gemini Flash; its tools call the other services over HTTP with Google-signed ID tokens. |
| Twilio SMS — Firebase Functions | [src/backend/twilio/](src/backend/twilio/) | Inbound webhook (signature-verified) and outbound send. |

That read/write split is enforced by IAM, not convention, and the byte-exact
authority is [docs/ENCRYPTION_CONTRACT.md](docs/ENCRYPTION_CONTRACT.md) — where
it and the code disagree, the contract wins. Why, plus two corrections:
[ADR-0004](docs/adr/0004-firestore-kms-credentials-and-frontend-login.md).

**`{user_id}` is always the Firebase UID** — in paths, Firestore documents, and
agent payloads, never a Google `sub`. The fallback lookup was deliberately
removed ([ENCRYPTION_CONTRACT §9](docs/ENCRYPTION_CONTRACT.md)); don't add one.

## Connectors conventions

Contract: [API_CONTRACT.md](src/backend/connectors-api/API_CONTRACT.md).

- Endpoints are **sync `def`** — the Google API client blocks, and FastAPI
  threadpools sync handlers.
- Each endpoint declares its own pydantic `response_model` and returns that
  model, not a dict — undeclared keys are dropped silently
  ([docs_service.py](src/backend/connectors-api/app/routers/docs_service.py)).
- Routers never touch Firestore or KMS. Credentials arrive only through
  `service_for_user()` ([google_creds.py](src/backend/connectors-api/app/services/google_creds.py));
  envelope handling stays in
  [firestore_creds.py](src/backend/connectors-api/app/services/firestore_creds.py).
- Credential failures propagate as `CredentialNotFound` / `CredentialFormatError`
  and become 404 / 500 via the exception handlers in
  [main.py](src/backend/connectors-api/app/main.py). Routers don't catch them.
- `scopes` in [config.py](src/backend/connectors-api/app/config.py) and
  `GOOGLE_SCOPES` in [googleOAuth.ts](src/frontend/lib/googleOAuth.ts) must stay
  byte-identical; change both in one commit.

## Agent tool conventions

Pattern to copy: `send_text` in [tools.py](src/agent/app/tools.py).

- Errors return a structured dict from `_error_response` (`code` / `message` /
  `retryable`) — never a raised exception or bare string; the model reasons over
  those fields. Forward 4xx bodies as-is, wrap 5xx as retryable.
- Call services with `httpx` and an explicit timeout.
- Service-to-service auth is a Google-signed ID token from `get_id_token`
  ([util.py](src/agent/app/util.py)), audience = the target service URL.
- Local dev substitutes `TEST_USER_ID` for the real user id when `DEBUG` is set.

## Hard rules

- **Never change the Gemini model** in [agent.py](src/agent/app/agent.py).
- **Never widen or rename a contract shape** without bumping the version and
  adding a changelog entry in `API_CONTRACT.md`, same commit. Adding a field
  with a default is the safe move; anything else is breaking.
- Never add a KMS encrypt call, an auth endpoint, or a `school_password` read to
  the connector service.
- Deploying (`gcloud run deploy`, `agents-cli deploy`) needs explicit approval.

## Commands (Windows PowerShell)

**Never join commands with `&&`** — a parser error in this shell. Separate
lines, or `;`.

- Connectors, from `src/backend/connectors-api/`: `pytest` (from the repo root
  it collects nothing) and `uvicorn app.main:app --reload --port 8080`. Deploys
  use that directory as the build context, not the repo root.
- Frontend, from `src/frontend/`: `npm run typecheck`, `npm test`.
- Agent, from `src/agent/`: `uv run pytest tests/unit tests/integration`.

## Git

Conventional commits scoped to the area (`feat(docs):`, `fix(frontend):`).
Rebase over merge. Branches are `matthew/short-topic` or `fix/short-topic`.
