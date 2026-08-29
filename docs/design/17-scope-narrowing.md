# 17. Taking deletion out of the grant

The consent screen used to ask a student for the right to permanently delete
their calendars and to delete files in their Drive. Neither power was ever used.
This is the pass that removed everything from the grant that can destroy a
student's data, and the record of the one place Google would not let us.

## What the code actually calls

Before changing a scope it is worth reading the connector, because the scope
list had drifted ahead of it. Every Google call the service makes:

| Router | Calls | Needs |
| --- | --- | --- |
| `calendar.py` | `events().list`, `events().insert` on `primary` | read, create |
| `gmail.py` | `messages().list/get`, `drafts().create` | read, draft |
| `drive.py` | `files().list/get`, `export_media`, `get_media` | read |
| `docs_service.py` | `documents().create`, `documents().batchUpdate` | create, edit |

There is no `delete`, no `trash`, and no `remove` anywhere in the service. The
grant was broader than the code for no reason other than that nobody had gone
back to trim it.

## The three scopes that could delete

**`drive.file` is gone.** It was the only scope in the set that could delete a
file, and it turned out to be buying nothing: `documents.create` makes the Doc
by itself, and `drive.readonly` already covers reading anything back. It was
presumably added on the assumption that creating a Doc needs a Drive scope. It
does not.

**`calendar` became `calendar.events` + `calendar.events.owned`.** The full scope
carried the right to delete whole calendars and to rewrite their sharing, which
is a large thing to hold in order to add an exam date. What replaced it cannot
touch a calendar at all, only the events on one.

**`gmail.compose` stays, because there is no alternative.** It is the only scope
Google publishes that can create a draft, so removing it removes drafting. Worth
knowing what it includes, since the comment above it in `googleOAuth.ts` is
narrower than the scope really is: `gmail.compose` can also delete drafts and,
on paper, send. The product's promise that a human sends the mail is enforced by
the connector never calling `send`, not by the scope. That is a real gap between
the copy and the grant, and it should be closed by an app-level guarantee rather
than by pretending the scope is smaller than it is.

## The exception Google forces, and why the consent screen still reads oddly

There is no create-without-delete scope for calendar events. Every writable
events scope bundles delete, and the only real choice is how much of the
student's calendar the bundle covers:

| Scope | Reach | Consent screen says |
| --- | --- | --- |
| `calendar` | everything, including whole calendars | See, edit, share, and permanently delete all the calendars you can access |
| `calendar.events` | events on any calendar they can access | View and edit events on all your calendars |
| `calendar.events.owned` | events on calendars they own | See, create, change, and delete events on Google calendars you own |
| `calendar.app.created` | only a calendar this app made | Make secondary calendars, and see, create, change and delete events on them |

Read that middle column against the right one, because they do not line up.
`calendar.events` has **more** reach than `calendar.events.owned` and permits
`events().delete` just as fully, yet it is the one whose wording never says
"delete". The strings are Google's marketing of its own scopes, not a capability
list, and the narrower scope drew the harsher sentence.

We request both. The pair is what the consent screen shows, and the softer
sentence is the one a student reads first, which matters for a product asking
teenagers for their school mailbox and for the Google app review that gates it.
It should be recorded plainly that this is a copy decision: `calendar.events`
does not reduce what the token can do, and on its own it slightly widens it.

`calendar.app.created` is the only option that genuinely cannot delete a
student's real events, and it buys that by refusing to write to `primary` at
all: deadlines would land on a separate Classistant overlay calendar instead of
alongside everything else the student already looks at. That is a product
change, not a permissions change, so it was not taken.

What actually holds the line, in the absence of a scope that can, is the
connector. `calendar.py` exposes `list` and `insert` and nothing else, and the
service has no delete path anywhere. Adding one is the change that would make
this document a lie, so it is the one to argue about in review.

## Two files, one commit

`GOOGLE_SCOPES` in `src/frontend/lib/googleOAuth.ts` builds the consent URL.
`scopes` in `src/backend/connectors-api/app/config.py` rebuilds the Credentials
object. They are hand synced and nothing enforces it, so they change together or
not at all. `data/access.ts` carries the same list a third time as a
cross-reference on each student-facing switch, and it is stale the moment the
other two move.

## Existing students do not have to re-consent

Narrowing is the safe direction. `google-auth` raises only on a scope it asked
for and did not get, so a token granted under the old, wider set still refreshes
against the new, smaller list. Nobody is signed out and nothing breaks. Widening
is the direction that needs everyone back through consent, which is what the
`drive.readonly` note in `config.py` is still warning about from v0.3.

**The one thing to watch on the first new grant.** That same check is why asking
for a scope and its own subset is worth a look in the logs. `google-auth`
compares the scopes it requested against the scopes the token response says were
granted, and raises `Not all requested scopes were granted` on any difference.
If Google decides `calendar.events.owned` is redundant beside `calendar.events`
and echoes back only the broader one, every refresh throws. This is the same
family of bug as the `include_granted_scopes` note in `googleOAuth.ts`, which
this codebase has already been bitten by once, from the opposite direction. The
fix, if it happens, is to drop `calendar.events.owned` from the two lists; it
grants nothing that would be lost.
