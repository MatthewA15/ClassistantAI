# Classistant AI Connector API — Contract v0.4 (handoff for ADK tools)

Base URL: `https://<cloud-run-url>` (local: `http://localhost:8080`). All responses JSON.
`{user_id}` = **Firebase UID** (was the Google `sub` claim through v0.3 — see Changelog). Endpoint names and shapes below are **frozen for the Aug 22 build** — build your ADK dummy tools against these; only response fields may be *added*.

## Auth — REMOVED in v0.4 (breaking)
`/auth/login` and `/auth/callback` no longer exist on this service. Login now happens entirely in the Next.js frontend, which runs its own authorization-code exchange and writes the resulting refresh token to Firestore (envelope-encrypted with Cloud KMS) — this service never sees an authorization code. The frontend hands the agent the Firebase UID to use as `{user_id}` on every call below.

## Gmail
| Method | Path | In | Out |
|---|---|---|---|
| GET | `/users/{user_id}/emails?max_results=10&q=` | optional Gmail query string | `{emails:[{id, thread_id, from, subject, date, snippet, labels}], count}` (P1) |
| GET | `/users/{user_id}/emails/{email_id}` | — | `{id, thread_id, from, to, subject, date, labels, snippet, body}` — `body` is decoded text/plain, falls back to text/html; `404` if not found (P1) |
| POST | `/users/{user_id}/emails/drafts` | `{to, subject, body}` | `{draft_id, status:"draft_created"}` (P2 — no send endpoint by design) |

## Calendar
| Method | Path | In | Out |
|---|---|---|---|
| GET | `/users/{user_id}/calendar/events?time_min&time_max&max_results` | RFC3339 times | `{events:[{id, summary, description, start, end, location, html_link}], count}` (P1) |
| POST | `/users/{user_id}/calendar/events` | `{summary, start, end, description?, location?, timezone?}` | `{event_id, html_link, status:"created"}` (P1) |

## Drive / Docs (P2)
| Method | Path | In | Out |
|---|---|---|---|
| GET | `/users/{user_id}/drive/files?q=&max_results=` | optional Drive query | `{files:[{id, name, mimeType, modifiedTime, webViewLink}], count}` |
| GET | `/users/{user_id}/drive/files/{file_id}/download` | — | **Raw file bytes (not JSON)** with `Content-Type` + `Content-Disposition: attachment; filename=...`. Google-native files are auto-exported (Docs→txt, Sheets→csv, Slides→pdf); other google-apps types → `415`. `404` not found, `403` no access / needs re-consent. ADK tool code must handle a binary response. |
| POST | `/users/{user_id}/docs` | `{title, content}` | `{doc_id, url, status:"created"}` |

## Errors
- `404` `{detail}` — no `google_refresh_token` credential stored for this `user_id` in Firestore. The user hasn't completed onboarding in the frontend, or the wrong `user_id` was sent. Not retryable without the user re-connecting Google in the frontend.
- `500` `{detail}` — a stored credential doc exists but doesn't match the encrypted-envelope format this service expects (bad base64, KMS decrypt/AES-GCM decrypt failure, unexpected dkey encoding). This means the frontend's encrypt path and this service's decrypt path have drifted — an integration bug, not a per-user problem. `detail` names the specific mismatch.
- `400` — validation errors (FastAPI standard shape)

## Meta
- `GET /health` → `{status:"ok"}` — use as the ADK tool liveness check.

## Changelog
- v0.2: added GET /emails/{email_id}
- v0.3: added Drive file download; drive.readonly scope added — re-consent required.
- v0.4 (**breaking**): `/auth/login` and `/auth/callback` removed — login moved to the frontend (issue #12). `{user_id}` is now a Firebase UID, not a Google `sub`. Credential storage moved from Secret Manager to Firestore + KMS envelope encryption; new `500` error semantics for malformed stored credentials (see Errors).
