# 24. Every calendar, not just the main one

Classy could only see a student's primary calendar. A student whose course
deadlines live on a second calendar of their own, or on one a TA shares with
the class, looked like a student with an empty term. This is issue #49, and it
turned out to be two problems wearing one symptom.

## The scope was not the whole story

The issue asked for a wider Google Calendar scope. The grant already had
`calendar.events`, which reads and writes events on *any* calendar the student
can access, so on paper the reach was there. What it lacked is smaller and
easier to miss: `calendar.events` cannot call `calendarList.list`. It can read
events from a calendar whose id you already know, and it cannot tell you what
calendars exist. So the connector's `calendar.py` did the only thing it could
and hardcoded `calendarId="primary"` on every call.

Two changes, then, and neither is sufficient alone.

## The scope: one read-only line

`https://www.googleapis.com/auth/calendar.calendarlist.readonly` is added to
`GOOGLE_SCOPES`. Google's consent screen renders it as "See the list of Google
calendars you're subscribed to". It names calendars and does nothing else.

Two broader scopes would also have listed them and were not taken:

| Scope | Also grants | Why not |
| --- | --- | --- |
| `calendar` | delete calendars, rewrite sharing | the delete-everything scope [17](17-scope-narrowing.md) removed |
| `calendar.readonly` | read every event, settings, ACLs | none of it needed to learn a calendar exists |

This keeps the rule [17](17-scope-narrowing.md) set: nothing in the grant can
destroy a student's data beyond the calendar-events exception Google forces.

## The connector: three additive changes

`src/backend/connectors-api/app/routers/calendar.py`, API contract v0.7.

- **`GET /calendars`** is new. Every calendar the student can at least read,
  primary first, with `id`, `summary`, `primary` and `access_role`.
- **`GET /events`** gains `calendar_id` (default `primary`) and `all_calendars`
  (default `false`). With `all_calendars=true` it reads every calendar from the
  list, merges by start time, and caps at `max_results`. Every event now
  carries `calendar_id` and `calendar_summary`, including on the default read,
  so a merged result stays attributable and a caller can write back to the
  right calendar.
- **`POST /events`** accepts `calendar_id`, default `primary`.

A request that sends none of the new parameters gets the v0.6 behaviour plus
two new fields per event. Nothing existing changed shape or name.

The merge sorts on parsed datetimes rather than strings. Google returns a
`dateTime` for timed events and a bare `date` for all-day ones, and events from
different calendars carry different offsets, so the RFC3339 strings do not sort
as strings. An all-day date becomes midnight UTC, which puts it ahead of the
timed events of the same day; anything unparseable sorts last rather than
raising.

In a merged read, a calendar that was unshared between the list call and the
events call is skipped rather than failing the whole response. Asked for by
name, the same 403 or 404 is the caller's to hear.

This half is backend work and it is in a frontend PR. It is small, additive,
and the scope change is inert without it, so it seemed better to ship the whole
fix and have Matthew review the Python than to ship half a fix and file a
follow-up.

## Who has to reconsent, and what they see until they do

Widening the grant is the direction that needs re-consent
([17](17-scope-narrowing.md) covers why narrowing does not). A refresh token
minted before 2026-09-03 does not carry the new scope, and Google answers
`calendarList.list` with 403 for it.

The connector surfaces that as a 403 saying the student needs to re-consent,
the same shape `drive.py` uses. Single-calendar reads of `primary` keep working
on the old token, so nobody's existing deadlines disappear; only the new reach
is gated. The Reconnect button on `/dashboard/access` is the way through, and
because `buildAuthUrl` sets `prompt=consent`, pressing it shows the full
consent screen again with the new line on it.

## The sync rule changed underneath this

`googleOAuth.ts`, [12](12-onboarding-persistence.md), [17](17-scope-narrowing.md)
and `ENCRYPTION_CONTRACT.md` §7 all said `GOOGLE_SCOPES` had to stay
byte-identical to a `scopes` list in the connector's `app/config.py`, because
the connector rebuilt a `Credentials` object from its own copy and google-auth
compared the two sets.

That list does not exist any more. Since contract v0.5 the connector builds
`Credentials` from a bare access token (`app/services/firestore_creds.py`) and
compares nothing, so the frontend is the sole owner of the scope list and there
is nothing on the connector side to drift. The comments and §7 now say so. Two
hand-kept mirrors remain and were updated here:

- `scripts/seed_credential.py` in the connector, which had drifted badly: it
  still asked for the full `calendar` scope and for `drive.file`, both of which
  [17](17-scope-narrowing.md) removed, so a token seeded from it could do things
  a real student's token cannot.
- The `scopes` cross-reference on the calendar row of `data/access.ts`.

## One thing still to do outside the repo

If the OAuth app is ever verified, the new scope has to be declared on the
consent screen in the Cloud Console. In testing mode, which is where the app
is, any scope works for test users and nothing needs changing there.
