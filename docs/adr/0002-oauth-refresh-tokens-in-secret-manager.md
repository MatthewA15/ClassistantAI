# ADR-0002: OAuth refresh tokens in Google Secret Manager; no passwords stored

- **Status:** accepted
- **Date:** 2026-08-19
- **Deciders:** Matthew, team

## Context
Students must trust us with account access. Credential storage is **two separate problems**: (A) Google account access for API connectors, (B) school-portal passwords for the browser agent. This ADR covers (A) only; (B) is future work (vault + injector pattern — plaintext never exposed to the LLM; the injector service types it into the sandboxed browser and the agent receives only a session).

## Decision
Per-user OAuth 2.0 (`access_type=offline`, `prompt=consent`) — we store **only the refresh token**, one Secret Manager secret per user (`user-{sub}-refresh-token`). Access tokens are minted per request; the service is stateless. All scopes (including P2: drafts, Drive, Docs) are requested at first consent so shipping P2 features later doesn't force re-consent.

## Alternatives considered
- **Store passwords / roll our own AES** — more code, worse security posture, no audit trail.
- **Tokens in Firestore** — no KMS-by-default, no per-secret IAM, weaker compliance story.
- **Agent Identity** — promising unified credential option; exploring post-Saturday.

## Consequences
Secret Manager gives KMS encryption, IAM scoping, and audit-logged access "for free" — direct evidence for the hackathon's governance/observability criteria (Fortified Enterprise Fleet track). Cost per secret is negligible at hackathon scale. Broad upfront scopes make the consent screen longer; acceptable trade-off.
