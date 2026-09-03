# Classistant AI Connector API — Contract v0.7 (handoff for ADK tools)

Base URL: `https://<cloud-run-url>` (local: `http://localhost:8080`). All responses JSON.
`{user_id}` in every path below is the **Firebase UID** — the same identifier the frontend's session already carries and the `users` collection is keyed by. There is no other identifier this service accepts; a Google `sub` is never a valid `{user_id}`.

## Auth

This service has no auth endpoints. Login, the OAuth authorization-code exchange, and encrypting the resulting refresh token all happen in the frontend (see [`docs/ENCRYPTION_CONTRACT.md`](../../../docs/ENCRYPTION_CONTRACT.md)) — this service only ever reads and decrypts the credential the frontend already wrote to Firestore.

`/auth/login` and `/auth/callback` are both **removed**. (v0.5 briefly restored `/auth/callback` — that was a mistake, corrected before this version shipped; see [`docs/adr/0004`](../../../docs/adr/0004-firestore-kms-credentials-and-frontend-login.md)'s second amendment. There was never a version of this API where either endpoint was the intended long-term shape.)

## Gmail
| Method | Path | In | Out |
|---|---|---|---|
| GET | `/users/{user_id}/emails?max_results=10&q=` | optional Gmail query string | `{emails:[{id, thread_id, from, subject, date, snippet, labels}], count}` (P1) |
| GET | `/users/{user_id}/emails/{email_id}` | — | `{id, thread_id, from, to, subject, date, labels, snippet, body}` — `body` is decoded text/plain, falls back to text/html; `404` if not found (P1) |
| POST | `/users/{user_id}/emails/drafts` | `{to, subject, body}` | `{draft_id, status:"draft_created"}` (P2 — no send endpoint by design) |

## Calendar
| Method | Path | In | Out |
|---|---|---|---|
| GET | `/users/{user_id}/calendar/calendars` | — | `{calendars:[{id, summary, primary, access_role}], count}` — every calendar the student can read, primary first. `403` when the grant predates the `calendar.calendarlist.readonly` scope; the student reconnects from the frontend's `/dashboard/access` (v0.7) |
| GET | `/users/{user_id}/calendar/events?time_min&time_max&max_results&calendar_id=primary&all_calendars=false` | RFC3339 times. `calendar_id` is an id from `/calendars`, default `primary`. `all_calendars=true` reads every readable calendar, merges by start, caps at `max_results`, and ignores `calendar_id` | `{events:[{id, summary, description, start, end, location, html_link, calendar_id, calendar_summary}], count}` (P1) |
| POST | `/users/{user_id}/calendar/events` | `{summary, start, end, description?, location?, timezone?, calendar_id?}` — `calendar_id` defaults to `primary`; `403` if the student cannot write to the one named | `{event_id, html_link, status:"created"}` (P1) |

## Drive / Docs (P2)
| Method | Path | In | Out |
|---|---|---|---|
| GET | `/users/{user_id}/drive/files?q=&max_results=` | optional Drive query | `{files:[{id, name, mimeType, modifiedTime, webViewLink}], count}` |
| GET | `/users/{user_id}/drive/files/{file_id}/download` | — | **Raw file bytes (not JSON)** with `Content-Type` + `Content-Disposition: attachment; filename=...`. Google-native files are auto-exported (Docs→txt, Sheets→csv, Slides→pdf); other google-apps types → `415`. `404` not found, `403` no access / needs re-consent. ADK tool code must handle a binary response. |
| POST | `/users/{user_id}/docs` | `{title, content, markdown?}` | `{doc_id, url, status:"created", formatting_applied}` |

### `POST /docs` — markdown rendering (v0.6)

`markdown` is optional and defaults to `false`. **`false` (or absent) is the pre-v0.6 behaviour exactly**: `content` is inserted verbatim as plain text, markdown syntax and all. Existing callers need no change.

Send `markdown: true` to have `content` parsed as markdown and rendered with real Docs formatting:

| Markdown | Becomes |
|---|---|
| `#`, `##`, `###` | `HEADING_1`, `HEADING_2`, `HEADING_3` |
| `**bold**`, `*italic*` | bold / italic text runs |
| `[text](url)` | a clickable link on `text`, styled Docs blue (#1155cc) and underlined |
| `- item` | a disc-bulleted list |
| `1. item` | a decimal-numbered list |

Anything outside that set — tables, code fences, block quotes, images, nested list indentation, `####` and deeper headings — is **never dropped**. Its text is inserted unstyled, because a student seeing an unstyled paragraph is far better than a student missing one. Nested list items are flattened to a single level.

The response is `DocCreatedResponse` — `doc_id`, `url`, `status` (unchanged since v0.3) plus `formatting_applied`, which is always present and defaults to `true`.

`formatting_applied` is `false` **only** when `markdown: true` was requested *and* the conversion failed — in which case the Doc was still created, with `content` inserted as unformatted plain text. A malformed heading never costs the student the document, so treat `false` as "the Doc is fine, but it reads as raw markdown", not as an error. It is `true` when markdown rendered successfully, and `true` when `markdown` was false or absent (nothing was requested, so nothing failed).

## Errors

Every `/users/{user_id}/...` endpoint reads through `app/services/firestore_creds.py`. Two credential-specific error shapes on top of FastAPI's standard validation `422`:

- **`404`** `{detail}` — `CredentialNotFound`. No `google_refresh_token` document at `users/{user_id}/credentials/google_refresh_token` in Firestore. Means either the user hasn't completed Google onboarding via the frontend, or the wrong `{user_id}` was sent (it must be the Firebase UID). Not retryable without the user reconnecting Google through the frontend's onboarding flow.
- **`500`** `{detail}` — `CredentialFormatError`. The stored credential document doesn't match [`docs/ENCRYPTION_CONTRACT.md`](../../../docs/ENCRYPTION_CONTRACT.md)'s byte format: a missing field, invalid base64, a KMS decrypt failure (including an AAD mismatch), or an AES-GCM authentication failure. `detail` names which check failed but never includes any decrypted or intermediate plaintext — treat a `500` here as "the frontend's write and this service's read have drifted," not as a value to retry blindly.
- **`400`** — FastAPI's standard validation error shape for malformed query/path params.

## Meta
- `GET /health` → `{status:"ok"}` — use as the ADK tool liveness check.

## Changelog
- v0.2: added GET /emails/{email_id}
- v0.3: added Drive file download; drive.readonly scope added — re-consent required.
- v0.4 (**breaking**): `/auth/login` and `/auth/callback` removed — login moved to the frontend (issue #12). `{user_id}` in path params is now a Firebase UID, not a Google `sub`. Credential storage moved from Secret Manager to Firestore + KMS envelope encryption; new `500` error semantics for malformed stored credentials (see Errors).
- v0.5 (**breaking**): corrects a false start within this same version — `/auth/callback` was briefly restored (client secret handling was mistakenly believed to require it) and then removed again for good once [`docs/ENCRYPTION_CONTRACT.md`](../../../docs/ENCRYPTION_CONTRACT.md) settled the frontend as owning the full write side, encrypt included. This service now has **zero** auth endpoints, **zero** KMS encrypt capability, and no code path that can name or touch a `school_password` credential. The `google_sub` fallback lookup on the read path is also removed — `{user_id}` is the Firebase UID with no alternate-identifier tolerance, anywhere. Credential documents are now read from `users/{user_id}/credentials/google_refresh_token` (a direct document get) rather than a queried top-level `user_credentials` collection.
- v0.6: `POST /docs` accepts an optional `markdown` flag (default `false`), and its response gains `formatting_applied` (default `true`). Both are **additive** — no existing field changed shape or name, and `markdown: false` sends byte-for-byte the request v0.5 sent. `formatting_applied` is a declared field on `DocCreatedResponse`, so it survives the endpoint's `response_model` filtering.
- v0.7: Calendar reaches past `primary` (issue #49). New `GET /calendar/calendars`. `GET /calendar/events` gains `calendar_id` and `all_calendars`, and every event now carries `calendar_id` and `calendar_summary`. `POST /calendar/events` accepts `calendar_id`. All **additive**: a request with none of the new params gets the v0.6 behaviour plus two new fields per event. Depends on the `calendar.calendarlist.readonly` scope, added to the frontend's `GOOGLE_SCOPES` in the same change — **re-consent required** for anyone who granted before it; until they do, `/calendars` and `all_calendars=true` return `403` and the single-calendar reads keep working. See `docs/design/24-every-calendar.md`.
