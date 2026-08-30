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
| POST | `/users/{user_id}/emails/drafts` | `{to, subject, body}` | `{draft_id, status:"draft_created"}` (P2) |
| POST | `/users/{user_id}/emails/drafts/{draft_id}/send` | `{to, subject, body, user_confirmation}` | `{message_id, thread_id, sent_at, status:"sent"}`. `409` `{detail, mismatches:[{field, expected, got}]}` if any of `to`/`subject`/`body` differs from the stored draft; `400` if `user_confirmation` is empty; `404` unknown draft (P2) |

Sending is **confirmation-gated**, not absent. The draft endpoint remains the
default path -- the agent writes, the student sends -- but a draft can be sent
through the second endpoint above, and only on terms that make an accidental
send hard: the request must repeat the draft's `to`, `subject` and `body`
back byte-for-byte, and carry a non-empty `user_confirmation` recording that
the student said yes. Any drift between the request and the stored draft is a
`409` naming each field that differs, and nothing is sent.

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

## Calls (v0.7 — CALL-E)

A real outbound phone call, placed through CALL-E's hosted MCP server and reported back once it ends. Backed by `app/services/calle_mcp.py`; the router is `app/routers/calls.py`.

**v0 only ever dials the student's own number.** It is read from `phone_number` on the `users/{user_id}` document, where it was written by Firebase phone sign-in — an SMS round trip the student completed themselves, so the handset is verified. **No request body accepts a phone number**, and one sent anyway is ignored rather than honoured. No country code is ever inferred or repaired: a guessed prefix is a call to a real person who consented to nothing. Calling someone else — a registrar, a landlord — is a different feature with a different consent story, not a parameter on this one.

The number is masked everywhere it appears, in responses and in logs: the `+` and the last four digits survive (`+•••••••0123`). CALL-E's own payload carries much more than this API returns — the unmasked number at `result.extracted.to_phones`, and the student's name inside `display_goal` and `result.extracted.goal` — so responses are built by whitelisting fields out of that payload rather than passing it through. There is deliberately no `raw` passthrough field, and CALL-E's payload is never stored verbatim.

| Method | Path | In | Out |
|---|---|---|---|
| POST | `/users/{user_id}/calls` | `{goal, language?, region?}` — `goal` is required, min 8 chars | `{run_id, status:"started", to_phone_masked, persisted}` — `201` |
| GET | `/users/{user_id}/calls/{run_id}?cursor=&limit=` | `limit` 1..100 | `CallRunResponse` (below) |
| GET | `/users/{user_id}/calls?max_results=10` | `max_results` ≤ 50 | `{calls:[{run_id, goal, status, to_phone_masked}], count}` — most recent first |

`POST` can take **around 150 seconds**: CALL-E plans the call before it accepts the run, so the ADK tool calling this needs a client timeout well above its default. A `201` means the run was *submitted*, not that the call happened — the phone rings asynchronously, and `GET /calls/{run_id}` is where the outcome arrives.

### `persisted` — the call happened, the bookkeeping may not have

`persisted` is `true` in the normal case and can be ignored. It is `false` when the call was placed but this service could not write its own `users/{user_id}/call_runs/{run_id}` record.

By the time that write happens the phone has already rung and the CALL-E credits are already spent, so a failure there is not allowed to fail the request: the `run_id` is the only handle that exists for a call the student is living through, and a `500` would throw it away. So the endpoint still answers `201` with the `run_id`, and says what did not happen.

The consequence, accepted deliberately: an unpersisted run has no document here, so **`GET /calls/{run_id}` will `404` for it and it will not appear in `GET /calls`** — ownership is checked against Firestore, and a run this service cannot prove belongs to the student must not be readable by them. A caller that sees `persisted: false` should hold onto the `run_id` itself. Treat it as "the call is happening, but we lost our copy of the paperwork", never as a failure to call.

The failure is logged at `ERROR` with the traceback and the masked number, because the cause is usually IAM rather than a bug — see the Firestore access note below.

`goal` should carry every concrete fact the call needs — names, dates, course codes, reference numbers, and what a good outcome looks like. CALL-E cannot come back and ask, so "ask about my registration" produces a materially worse call than "ask whether the late-add petition for CHEM 204, submitted Aug 24 under student number 30112233, has been approved".

### `CallRunResponse`

Every field below `in_progress` is `null` or empty while the call is still running, and fills in when it ends. Poll while `in_progress` is `true`, waiting `poll_after_seconds` between requests.

| Field | Type | Notes |
|---|---|---|
| `run_id` | string | CALL-E's run id, the same one `POST` returned |
| `status` | string | CALL-E's own uppercase state: `PREPARING`, `COMPLETED`, ... |
| `in_progress` | bool | Derived here, not sent by CALL-E: true while it asks to be polled again |
| `poll_after_seconds` | int? | How long CALL-E asks us to wait before the next poll |
| `message` | string? | CALL-E's human-readable status line |
| `summary` | string? | What the call achieved, in prose |
| `task_completed` | bool? | CALL-E's own judgement of whether the goal was met |
| `confidence` | float? | 0..1, CALL-E's confidence in `task_completed` |
| `evidence` | string[] | Quotes or facts supporting the outcome; `[]` until the call ends |
| `transcript` | string? | Plain-text transcript |
| `duration_seconds` | int? | How long the call lasted |
| `activity` | object[] | Timeline, each entry projected to `{ts, level, kind, message}` and nothing else |
| `next_cursor` | string? | Pass as `cursor` to page further through `activity` |

`{status, summary, task_completed, duration_seconds, last_checked_at}` are also merged onto this service's own `users/{user_id}/call_runs/{run_id}` document on every poll, so the dashboard can render a finished call without going back to CALL-E.

### Errors specific to calling

On top of the shared shapes in [Errors](#errors) below:

- **`403`** — calling is switched off for this student (`access.calls === false` on their user document). Absent, or any other value, means allowed. Not retryable: the student turns it back on from the dashboard.
- **`404`** — no `users/{user_id}` document (same wording and cause as elsewhere: `{user_id}` must be the Firebase UID), or, on `GET /calls/{run_id}`, no such run *for this student*. A run belonging to someone else is indistinguishable from one that never existed, and CALL-E is not consulted before that check.
- **`409`** — the student has no `phone_number`, so there is nothing to dial. Set during the phone sign-in step of onboarding.
- **`502`** — `CalleUpstreamError`. CALL-E failed or answered in a shape this service cannot read. The call may or may not have been placed; check `GET /calls/{run_id}` before retrying a `POST`.
- **`503`** — `CalleNotConfigured` or `CalleAuthError`. `CALLE_ACCESS_TOKEN` is unset, or CALL-E rejected it with a 401/403. **This is always an operator action, never a user error**: the token is minted by a brokered browser login and it expires, so someone must run `python scripts/calle_login.py` and rotate the environment variable. Retrying without that will not help. It is deliberately not surfaced as a `401`/`403`, which would blame the caller for a token they do not control.

### Firestore access this section requires

**Calling is the first write path this service has ever had.** Everything before it — Gmail, Calendar, Drive, Docs — only ever *read* Firestore, to fetch the encrypted credential. So a service account with `roles/datastore.viewer` was sufficient, and that is what was deployed.

The calls endpoints write `users/{user_id}/call_runs/{run_id}`, so the service account now needs **`roles/datastore.user`** (read + write). Without it, reads still succeed and the call is still placed — only the record fails, with `PermissionDenied: 403 Missing or insufficient permissions`, surfacing as `persisted: false` rather than an error. This is a silent-until-you-look failure by design, so check `persisted` after deploying to a new project.

The KMS grant is unchanged and still one-directional: `roles/cloudkms.cryptoKeyDecrypter` on the refresh-token key only, and nothing at all on the school-password key.

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
- v0.7: adds the **Calls** section — three endpoints wrapping CALL-E, which dial the student's own verified number and nothing else. Additive: no existing endpoint, field or status code changed. Also corrects two long-standing documentation drifts rather than any behaviour: `POST /emails/drafts/{draft_id}/send` has existed in `app/routers/gmail.py` since before v0.6 but the Gmail section still claimed there was "no send endpoint by design", and `app/main.py` still declared `version="0.5.0"`. Both now say what the code does. `POST /calls` also carries a `persisted` flag (default `true`); it is documented as part of v0.7 rather than a new version because the calls endpoints had never completed a request in any deployed environment before it existed -- the service account was read-only, so every call 500d after placing the call. No caller can have depended on the older shape.
