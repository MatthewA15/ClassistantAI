# Classistant AI Connector API — Contract v0.5 (handoff for ADK tools)

Base URL: `https://<cloud-run-url>` (local: `http://localhost:8080`). All responses JSON.
`{user_id}` in the paths below = **Firebase UID**. Endpoint names and shapes below are **frozen for the Aug 22 build** — build your ADK dummy tools against these; only response fields may be *added*.

## ⚠️ `user_id` means two different things in this document
- In every `/users/{user_id}/...` **path** below: the **Firebase UID**.
- In the `/auth/callback` **response body**: the **Google `sub`** (kept under the `user_id` key for frontend backward compatibility — see below). It is NOT the same value as the Firebase UID and NOT what you should send as `{user_id}` in path params, even though the field is spelled identically.

If you're building the ADK agent side: the frontend gives you the Firebase UID directly (it's the identity Firebase Auth already minted); don't try to derive it from this API.

## Auth
| Method | Path | In | Out |
|---|---|---|---|
| GET | `/auth/callback?code=...&uid=...` | `code` (Google authorization code), `uid` (Firebase UID) | `{user_id, email, status:"connected", firebase_uid}` — see the warning above about `user_id` here vs. in path params |

`/auth/login` is **removed** (v0.4, unchanged) — the frontend builds its own consent URL and never redirects here.

`/auth/callback` is **restored** in v0.5. It was incorrectly removed in v0.4: the frontend never holds the OAuth client secret (only this service's env does), so it cannot exchange the authorization code itself — it calls this endpoint server-to-server instead. What changed from the pre-v0.4 version: the refresh token is now envelope-encrypted and written to Firestore (issue #12), not Secret Manager, and the endpoint now requires `uid` so the write can be keyed on the Firebase UID rather than the Google `sub`. A request missing `uid` gets `400`, not `422` — this is a required *query* param handled manually so callers get one consistent error shape from this router.

`error` (Google's OAuth error param, e.g. `access_denied`) also produces `400`, and a missing/failed refresh token from Google produces `500` (unchanged from pre-v0.4 behavior).

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
- `404` `{detail}` — no `google_refresh_token` credential stored for this `user_id` in Firestore. The user hasn't completed onboarding, or the wrong `user_id` was sent. Not retryable without the user re-connecting Google via the frontend's onboarding flow. (Transitional: this service currently also retries the lookup against `google_sub` before returning `404` — see docs/adr/0004 and the `TODO(matthew)` in `app/services/firestore_creds.py` — but callers should still always send the Firebase UID; this is not a documented alternate identifier.)
- `500` `{detail}` — either a stored `/users/{user_id}/...` credential doc doesn't match the encrypted-envelope format this service expects (bad base64, KMS/AES-GCM decrypt failure), or `/auth/callback` completed the Google exchange but got no refresh token back (rare; usually means consent was skipped — retry onboarding). `detail` names the specific failure.
- `400` — validation errors (FastAPI standard shape), plus `/auth/callback`'s own `code`/`uid`/`error` handling (see Auth above).

## Meta
- `GET /health` → `{status:"ok"}` — use as the ADK tool liveness check.

## Changelog
- v0.2: added GET /emails/{email_id}
- v0.3: added Drive file download; drive.readonly scope added — re-consent required.
- v0.4 (**breaking**): `/auth/login` and `/auth/callback` removed — login moved to the frontend (issue #12). `{user_id}` in path params is now a Firebase UID, not a Google `sub`. Credential storage moved from Secret Manager to Firestore + KMS envelope encryption; new `500` error semantics for malformed stored credentials (see Errors).
- v0.5: `/auth/callback` **restored** — removing it in v0.4 was a mistake; the frontend cannot exchange the authorization code itself (no client secret) and depends on this endpoint. Now takes a required `uid` query param (Firebase UID) and writes the envelope-encrypted refresh token to Firestore itself, keyed on that UID. Response shape unchanged (`user_id` is still the Google `sub`, for frontend compatibility) plus one additive field, `firebase_uid`. `/auth/login` stays removed.
