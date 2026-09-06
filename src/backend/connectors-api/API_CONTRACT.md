# Classistant AI Connector API — Contract v0.9 (handoff for ADK tools)

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
| GET | `/users/{user_id}/calendar/events?time_min&time_max&max_results` | RFC3339 times | `{events:[{id, summary, description, start, end, location, html_link}], count}` (P1) |
| POST | `/users/{user_id}/calendar/events` | `{summary, start, end, description?, location?, timezone?, recurrence?}` | `{event_id, html_link, status:"created"}` (P1; `recurrence` added v0.9) |
| PATCH | `/users/{user_id}/calendar/events/{event_id}` | `{expected_summary, user_confirmation, summary?, start?, end?, description?, location?, timezone?, recurrence?}` | `{event_id, html_link, status:"updated", changed_fields:[...], is_recurring_instance, is_series_master, recurring_event_id}` — partial update; `409` on a stale `expected_summary` (v0.9) |
| DELETE | `/users/{user_id}/calendar/events/{event_id}` | `{expected_summary, user_confirmation}` **in the JSON body** | `{status:"deleted", deleted_event:{id, summary, start, end, location, is_recurring_instance, is_series_master, recurring_event_id}}` — irreversible; `409` on a stale `expected_summary` (v0.9) |

### Calendar writes — the guardrail dance (v0.9)

`PATCH /calendar/events/{event_id}` edits an event the student already has and `DELETE /calendar/events/{event_id}` removes one for good, so both carry the same two-part guardrail as `POST /emails/drafts/{draft_id}/send`:

- **`expected_summary`** (required) — the event's summary *as the agent currently believes it to be*. The endpoint fetches the event first and compares. A difference means the agent is acting on a stale read, so nothing is written and the call is a **`409`** with the same mismatch shape Gmail uses: `{detail: {detail, mismatches:[{field, expected, got}]}}`, where `expected` is what Google holds and `got` is what the request sent. `field` is `"summary"`. The fix is to re-read the event and re-confirm with the student — never to retry.
- **`user_confirmation`** (required, non-empty) — what the student said when they approved this specific write. Blank or whitespace-only is a **`400`**, raised *before* any Google call.

Two further guards, both `400` and both before the write:

- **one event per call** — an `event_id` containing a comma or whitespace is rejected. There is no bulk edit or bulk delete path by design.
- **at least one editable field** (`PATCH` only) — a request that changes nothing is an error rather than a silent no-op the agent would report as success. `timezone` is not an editable field on its own: it sets the `timeZone` on `start`/`end` and changes nothing when sent alone.

`PATCH` is a **true partial update**: only the fields present in the request body are sent to Google, so a field the agent never mentioned is never blanked out. `start`/`end` are RFC3339 and are wrapped as `{dateTime, timeZone}` (`timezone`, default `America/Toronto`). `changed_fields` echoes the field names actually sent, for the agent to relay to the student.

The mismatch models (`FieldMismatch`, the `MismatchResponse` base) live in `app/routers/_guardrails.py` and are shared with Gmail. Gmail's `409` body is byte-for-byte what it was in v0.7.

`DELETE` carries its guardrail **in the JSON body**, not as query params — an unusual but valid DELETE, and ADK tool code has to send a body. It takes no editable fields (there is nothing to edit) and is **irreversible**: this service has no undo, and a deleted series master takes every occurrence with it. In exchange it returns `deleted_event` — the event exactly as it was immediately before removal, captured on the read that precedes the delete. That object is the only record of what was cancelled, so the agent is expected to relay it to the student.

### Calendar — recurring events (v0.9)

`recurrence` is a list of Google-format RRULE strings, e.g. `["RRULE:FREQ=WEEKLY;BYDAY=TU,TH;UNTIL=20261215T000000Z"]`. It is **additive on `POST /calendar/events`** — omit it and the request is byte-for-byte the pre-v0.9 one, with no `recurrence` key sent at all. On create, `start`/`end` describe the first occurrence and the RRULEs make it a series. On `PATCH` it is only meaningful against a series master.

**Instance vs. series — the thing an ADK tool must get right.** `GET /calendar/events` passes `singleEvents=True`, so it expands series and the `id`s it returns are usually *instance* ids (`seriesid_20260908T140000Z`), not the series. That id is what makes an edit or delete apply to one occurrence or to all of them:

| The id you send | What PATCH/DELETE affects |
|---|---|
| the instance id from `list` (`series-1_20260908T140000Z`) | that ONE occurrence |
| the bare series id (`series-1`) | EVERY occurrence — the whole term |

The request cannot express which the student meant, so the agent has to ask ("just this Tuesday, or every week?") before calling. Both endpoints therefore report what was actually touched:

- `is_recurring_instance` — the id acted on was one occurrence of a series.
- `is_series_master` — the id acted on was the series itself.
- `recurring_event_id` — the series id, when an instance was acted on (`null` otherwise). This is the id to use for the whole-series version of the same action.

All three are declared fields on the response models, so they survive `response_model` filtering.

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
- v0.9: Calendar gains `DELETE /calendar/events/{event_id}` (guardrail in the JSON body, returning `deleted_event` as the record of what was removed), `recurrence` (RRULE list) on create and edit — **additive** on `POST /calendar/events`, which sends no `recurrence` key when it is omitted — and reports `is_recurring_instance` / `is_series_master` / `recurring_event_id` so a caller can tell whether it touched one occurrence or the whole series. Calendar also gains `PATCH /calendar/events/{event_id}` — a partial-update edit endpoint behind the `expected_summary` + `user_confirmation` guardrail, answering `409` with Gmail's mismatch shape when the agent's read is stale. Additive: `GET`/`POST` on `/calendar/events` are unchanged, and Gmail's `409` body is unchanged (its models simply moved to a shared `app/routers/_guardrails.py`).
