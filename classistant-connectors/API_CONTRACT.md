# Classistant AI Connector API — Contract v0.1 (handoff for ADK tools)

Base URL: `https://<cloud-run-url>` (local: `http://localhost:8080`). All responses JSON.
`{user_id}` = Google `sub` returned by `/auth/callback`. Endpoint names and shapes below are **frozen for the Aug 22 build** — build your ADK dummy tools against these; only response fields may be *added*.

## Auth (P0)
| Method | Path | In | Out |
|---|---|---|---|
| GET | `/auth/login` | — | `{auth_url, state}` — redirect user to `auth_url` |
| GET | `/auth/callback?code=...` | Google redirect | `{user_id, email, status:"connected"}` |

## Gmail
| Method | Path | In | Out |
|---|---|---|---|
| GET | `/users/{user_id}/emails?max_results=10&q=` | optional Gmail query string | `{emails:[{id, thread_id, from, subject, date, snippet, labels}], count}` (P1) |
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
| POST | `/users/{user_id}/docs` | `{title, content}` | `{doc_id, url, status:"created"}` |

## Errors
- `404` `{detail}` — user has no stored credentials (send them through `/auth/login`)
- `400` — bad OAuth callback / validation errors (FastAPI standard shape)

## Meta
- `GET /health` → `{status:"ok"}` — use as the ADK tool liveness check.
