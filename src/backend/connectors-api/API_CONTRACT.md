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
| POST | `/users/{user_id}/emails/drafts` | `{to, subject, body}` | `{draft_id, status:"draft_created"}` (P2) |
| PATCH | `/users/{user_id}/emails/drafts/{draft_id}` | `{user_confirmation, to?, subject?, body?}` | `{draft_id, status:"draft_updated", changed_fields:[...]}` — omitted fields are preserved; `404` if the draft is gone (v0.9) |
| POST | `/users/{user_id}/emails/{email_id}/triage` | `{action, label?}` | `{email_id, action, label, labels_before, labels_after, status:"triaged"}` — requires `gmail.modify`, which this branch does not add — the scope change is tracked separately (see `richard/scope-expansion`). These endpoints return 403 from Google until that ships and the account re-consents (v0.9) |
| POST | `/users/{user_id}/emails/drafts/{draft_id}/send` | `{to, subject, body, user_confirmation}` | `{message_id, thread_id, sent_at, status:"sent"}` — `to`/`subject`/`body` must match the stored draft exactly; `409` on any mismatch, `400` on a blank `user_confirmation` (P2) |

### `POST /emails/{email_id}/triage` — explicit verbs only (v0.9)

`action` is one of five, and nothing else parses: `mark_read`, `mark_unread`, `archive`, `add_label`, `remove_label`. The first three map to a single Gmail `messages.modify` each — `UNREAD` off, `UNREAD` on, `INBOX` off.

`label` is a label **name**, not an id. It is required for `add_label`/`remove_label` and **rejected with a `400` on the other three** rather than ignored, so a request cannot quietly mean something other than it says. Names match case-insensitively; `add_label` creates the label if the student has no such label, while `remove_label` on an unknown name is a `404` (there is nothing to remove, and creating a label in order to remove it does nothing).

**Gmail's own labels are unreachable through `label`**: `INBOX`, `UNREAD`, `SPAM`, `TRASH`, `SENT`, `DRAFT`, `STARRED`, `IMPORTANT` and the `CATEGORY_*` set are all a `400`, refused on the name before any lookup. The three verbs are the only route to inbox and read state, which leaves **no path from this endpoint to trash, spam or deletion** — `archive` removes the email from the inbox and nothing more; the mail stays in All Mail.

No confirmation dance, unlike sending a draft or deleting an event: every action here is reversible in one click in Gmail. `labels_before`/`labels_after` report the label ids either side of the change. One `email_id` per call — commas or whitespace in the id are a `400`, the same anti-bulk rule the calendar write endpoints use.

### `PATCH /emails/drafts/{draft_id}` — fetch, merge, rebuild (v0.9)

Gmail has **no partial draft update**: `users.drafts.update` replaces the entire message. So this endpoint fetches the draft, merges the fields the caller sent over what is already there, rebuilds the whole MIME message and replaces the draft with it. The caller sees a partial edit; Gmail always sees a full one.

The practical contract for a caller: **send only what changes**. Omitting `subject` keeps the draft's subject; it does not clear it. `changed_fields` echoes the field names that were provided, and everything absent from that list is exactly as it was.

It takes `user_confirmation` (required, non-empty — `400` before any Google call, same as send) and rejects a request naming none of `to`/`subject`/`body` with a `400`, so an edit that changes nothing cannot read back as a successful edit.

There is deliberately **no `expected_*` echo-back** here, unlike `PATCH`/`DELETE` on calendar events: editing a draft destroys nothing and is fully reversible, and the student still reads the draft before anything is sent. This endpoint sends nothing.

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
| GET | `/users/{user_id}/drive/files/{file_id}/download` | — | `{mime_type, content_size, filename, data}` — JSON, with `data` holding the file content **base64-encoded**. Google-native files are auto-exported (Docs→txt, Sheets→csv, Slides→pdf) and `mime_type`/`filename` describe the exported form; other google-apps types → `415`. `404` not found, `403` no access / needs re-consent. |
| POST | `/users/{user_id}/drive/files` | `{filename, mime_type, data}` (`data` base64) | `{file_id, name, web_view_link, folder:"Classistant", size, status:"uploaded"}` — `400` bad/empty base64, `413` over 10 MB; requires `drive.file`, which this branch does not add — the scope change is tracked separately (see `richard/scope-expansion`). These endpoints return 403 from Google until that ships and the account re-consents (v0.9) |
| POST | `/users/{user_id}/docs` | `{title, content, markdown?}` | `{doc_id, url, status:"created", formatting_applied}` |
| PATCH | `/users/{user_id}/docs/{doc_id}` | `{content, mode, markdown?, user_confirmation?}` | `{doc_id, url, mode, status:"updated", formatting_applied}` — `mode` is `append` or `replace`; `replace` requires `user_confirmation` (v0.9) |

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

### `PATCH /docs/{doc_id}` — append or replace (v0.9)

`mode` is **required and has no default**, because the two modes are not interchangeable:

| `mode` | What happens | Confirmation |
|---|---|---|
| `append` | `content` is written at the end of the document. Nothing already there is touched. | none — it removes nothing |
| `replace` | The document's entire current contents are **discarded** and `content` written in their place. Not undoable through this service. | `user_confirmation`, non-empty |

A blank or absent `user_confirmation` on `replace` is a **`400` raised before any Google call** — the same treatment `DELETE /calendar/events/{event_id}` gets, and for the same reason. `append` deliberately requires none. Content that should begin its own paragraph rather than continue the last one must start with a newline; the endpoint adds no separator of its own.

`markdown` and `formatting_applied` behave exactly as they do on `POST /docs`, including the failure semantics: if `markdown: true` and the conversion fails, the edit still lands as unformatted text and `formatting_applied` comes back `false`. **`markdown` currently defaults to `false` here because that is what `POST /docs` defaults to on this branch** — if the markdown-default change lands, both defaults move together.

`404` if the document doesn't exist; `403` carries the same re-consent message the Drive download endpoint uses.

**Indices are UTF-16 code units.** The insertion point comes from the document's own `endIndex` as Google reports it, and is never recomputed from the text: one emoji is a single Python character but *two* Docs indices, so an index worked out with `len()` lands mid-character and corrupts the edit silently. `replace` deletes from index 1 to `endIndex - 1`, leaving the body's final newline, which Docs will not allow to be deleted; a document with nothing in it yet has nothing to delete, so the delete request is omitted rather than sent as an empty range.

### `POST /drive/files` — one app-owned folder (v0.9)

The request mirrors what `GET /drive/files/{file_id}/download` returns — `filename`, `mime_type`, base64 `data` — so a file read out of Drive can be written back without re-encoding. `data` that is not valid base64, or is empty, is a `400`; content over **10 MB** decoded is a `413`. Both are raised before any Google call. The filename is sanitised the same way the download endpoint sanitises the one it suggests.

Everything is uploaded into a single folder named **"Classistant"** at the root of the student's Drive, found (or created on first use) by the connector. This is a consequence of the `drive.file` scope rather than a filing preference: under `drive.file` the app can only see files and folders **it created itself**, so a folder the student made — even one with exactly this name — is invisible to the lookup, and a file written anywhere else is a file this connector could never find again. The same scope is what makes the rest of the student's Drive unreachable from here: it cannot be read, changed or removed, and this service has no delete endpoint at all.

Uploads over ~1 MB use Drive's resumable protocol. `size` comes back from Drive (as an int, though Drive reports a string).

## Errors

Every `/users/{user_id}/...` endpoint reads through `app/services/firestore_creds.py`. Two credential-specific error shapes on top of FastAPI's standard validation `422`:

- **`404`** `{detail}` — `CredentialNotFound`. No `google_refresh_token` document at `users/{user_id}/credentials/google_refresh_token` in Firestore. Means either the user hasn't completed Google onboarding via the frontend, or the wrong `{user_id}` was sent (it must be the Firebase UID). Not retryable without the user reconnecting Google through the frontend's onboarding flow.
- **`500`** `{detail}` — `CredentialFormatError`. The stored credential document doesn't match [`docs/ENCRYPTION_CONTRACT.md`](../../../docs/ENCRYPTION_CONTRACT.md)'s byte format: a missing field, invalid base64, a KMS decrypt failure (including an AAD mismatch), or an AES-GCM authentication failure. `detail` names which check failed but never includes any decrypted or intermediate plaintext — treat a `500` here as "the frontend's write and this service's read have drifted," not as a value to retry blindly.
- **`404`** `{detail}` — also returned when the named resource itself is absent: an email, draft, event, document, or a label named in `remove_label`. `detail` names what was not found, which is what distinguishes it from `CredentialNotFound` above.
- **`400`** `{detail}` — a request this service refused **before calling Google**, naming which guard fired: a blank `user_confirmation`, a patch naming no editable field, an `event_id`/`email_id` carrying commas or whitespace, a Gmail system label in `label`, `label` sent with a verb action, invalid or empty base64. This is *not* FastAPI's validation shape.
- **`409`** `{detail: {detail, mismatches:[{field, expected, got}]}}` — the echo-back guardrail on `POST /emails/drafts/{draft_id}/send` and the calendar `PATCH`/`DELETE`. The write did not happen. Re-read and re-confirm with the student; never retry the same body.
- **`413`** `{detail}` — `POST /drive/files` over the 10 MB decoded cap.
- **`415`** `{detail}` — `GET /drive/files/{file_id}/download` on a Google-native type with no export mapping.
- **`422`** — FastAPI's own validation error, for a missing required field or a value outside its schema: no `mode` on `PATCH /docs/{doc_id}`, an `action` that is not one of the five, a malformed query or path param.

## Meta
- `GET /health` → `{status:"ok"}` — use as the ADK tool liveness check.

## Changelog

v0.7 and v0.8 are absent from this branch by arrangement, not omission: v0.7 is the in-flight calls PR and v0.8 is the markdown-default PR (#47). Both land on their own branches and bring their own entries; this branch is v0.9 and does not renumber around them.

- v0.2: added GET /emails/{email_id}
- v0.3: added Drive file download; drive.readonly scope added — re-consent required.
- v0.4 (**breaking**): `/auth/login` and `/auth/callback` removed — login moved to the frontend (issue #12). `{user_id}` in path params is now a Firebase UID, not a Google `sub`. Credential storage moved from Secret Manager to Firestore + KMS envelope encryption; new `500` error semantics for malformed stored credentials (see Errors).
- v0.5 (**breaking**): corrects a false start within this same version — `/auth/callback` was briefly restored (client secret handling was mistakenly believed to require it) and then removed again for good once [`docs/ENCRYPTION_CONTRACT.md`](../../../docs/ENCRYPTION_CONTRACT.md) settled the frontend as owning the full write side, encrypt included. This service now has **zero** auth endpoints, **zero** KMS encrypt capability, and no code path that can name or touch a `school_password` credential. The `google_sub` fallback lookup on the read path is also removed — `{user_id}` is the Firebase UID with no alternate-identifier tolerance, anywhere. Credential documents are now read from `users/{user_id}/credentials/google_refresh_token` (a direct document get) rather than a queried top-level `user_credentials` collection.
- v0.6: `POST /docs` accepts an optional `markdown` flag (default `false`), and its response gains `formatting_applied` (default `true`). Both are **additive** — no existing field changed shape or name, and `markdown: false` sends byte-for-byte the request v0.5 sent. `formatting_applied` is a declared field on `DocCreatedResponse`, so it survives the endpoint's `response_model` filtering.
- v0.9 (doc correction): the Gmail table's `POST /emails/drafts` row claimed "no send endpoint by design", which stopped being true when `POST /emails/drafts/{draft_id}/send` shipped. The send endpoint is now listed with its actual guardrail (exact `to`/`subject`/`body` match against the stored draft, plus a non-empty `user_confirmation`); no endpoint behaviour changed with this line, only the document. The same audit corrected two more stale claims: the Drive download row described raw bytes with a `Content-Disposition` header, when that endpoint returns JSON carrying base64 (it has done since v0.3), and the Errors section called `400` "FastAPI's standard validation error shape", when FastAPI raises `422` and `400` is this service refusing a request at a guard. `409`, `413` and `415` are now listed there too.
- v0.9: Docs gains `PATCH /docs/{doc_id}` — `append` adds to the end and removes nothing, `replace` discards the document's contents and therefore requires `user_confirmation`, mirroring the calendar writes. `markdown`/`formatting_applied` carry `POST /docs`' behaviour and its current `false` default unchanged. Drive gains `POST /drive/files` — base64 upload into one app-created "Classistant" folder, capped at 10 MB, with `400`/`413` raised before any Google call. It needs the `drive.file` scope, which this branch does not add — that change is tracked separately (see `richard/scope-expansion`) — so it returns Google's 403 until that ships and the account re-consents; `drive.file` also means the app can see only what it created, which is why there is a single app-owned folder. Gmail gains `POST /emails/{email_id}/triage` — mark read/unread, archive, and add/remove labels by name, with system labels refused so the endpoint has no route to trash or deletion. It needs the `gmail.modify` scope, which this branch does not add — that change is tracked separately (see `richard/scope-expansion`) — so it returns Google's 403 until that ships and the account re-consents. Gmail also gains `PATCH /emails/drafts/{draft_id}` — an edit-in-place for drafts that fetches, merges and rebuilds the message, because `drafts.update` has no partial mode and would otherwise blank whatever the caller omitted. It requires `user_confirmation` and at least one of `to`/`subject`/`body`, and carries no `expected_*` echo-back by design (a draft edit is reversible and sends nothing). Calendar gains `DELETE /calendar/events/{event_id}` (guardrail in the JSON body, returning `deleted_event` as the record of what was removed), `recurrence` (RRULE list) on create and edit — **additive** on `POST /calendar/events`, which sends no `recurrence` key when it is omitted — and reports `is_recurring_instance` / `is_series_master` / `recurring_event_id` so a caller can tell whether it touched one occurrence or the whole series. Calendar also gains `PATCH /calendar/events/{event_id}` — a partial-update edit endpoint behind the `expected_summary` + `user_confirmation` guardrail, answering `409` with Gmail's mismatch shape when the agent's read is stale. Additive: `GET`/`POST` on `/calendar/events` are unchanged, and Gmail's `409` body is unchanged (its models simply moved to a shared `app/routers/_guardrails.py`).
