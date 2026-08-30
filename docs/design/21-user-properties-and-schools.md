# 21. User properties the agent reads, and the schools collection

Sources: [`lib/schools.ts`](../../src/frontend/lib/schools.ts),
[`lib/timeZone.ts`](../../src/frontend/lib/timeZone.ts),
[`scripts/schools.seed.ts`](../../src/frontend/scripts/schools.seed.ts)

Settles [issue #36](https://github.com/MatthewA15/ClassistantAI/issues/36).

## What changed and why now

Until the agent landed, the frontend was the only thing that read a user
document, and it read it to render a dashboard. Three fields were shaped by
that: `name` was whatever looked reasonable in a heading, the timezone lived
wherever the settings form put it, and the school was a `school_id` string that
only meant something to code holding a copy of `data/schools.ts`.

Then [`webhook.py`](../../src/backend/twilio/functions/webhook.py) started
looking students up by `phone_number` and handing Agent Engine a `user_id`. The
agent now greets students, schedules reminders, and knows which campus it is
talking about, so those three fields stopped being display concerns and became
a contract with another service.

This doc is what that cost.

## `name` is now asked for, and it is required

It used to be an optional nickname behind a "Change nickname" link, defaulting
to the local part of the school address. Nothing read it, so a default nobody
chose was free.

It is not free now. The default produced **"Hey jokafor3"**, which is worse than
no greeting: it is the product demonstrating, in the first text it ever sends,
that it does not know who it is talking to. So the field is a real question on
the summary step, always open, and the Finish button gates on it alongside the
two consents.

### Why not take it from Google

The issue asked for it, and it was rejected on cost.

A real name needs the `profile` scope, and
[`config.py`](../../src/backend/connectors-api/app/config.py) requires its scope
list to stay byte-identical to
[`GOOGLE_SCOPES`](../../src/frontend/lib/googleOAuth.ts). Adding one there
breaks every grant that already exists: `google-auth` raises on
`requested - granted`, so the connector would ask for a scope an existing
refresh token never received and fail on refresh, silently, per student, until
each of them reconnected.

There is a safe version -- add it to the frontend only, since `exchangeCode`
never validates the returned scope set and a granted superset refreshes fine --
but it buys a name the student may not want to be called anyway, at the price of
inverting an invariant two files state in bold. Asking is one field on a screen
they are already on. [docs/design/12](12-onboarding-persistence.md) said a real
registrar name would cost more than it is worth; that is still true, and this is
the cheaper half of it delivered.

## `time_zone` is top level, and there is exactly one of it

It already existed as `notifications.timezone`. Two things were wrong with that.

**It was almost never written.** The only writer was the settings form, so the
field the agent needs in order to schedule anything at all was absent for every
student who never opened that page, which is most of them. Onboarding captures
it now, from `Intl.DateTimeFormat().resolvedOptions().timeZone`.

**It was in the wrong place.** A reader that has to reach into a preferences map
to find out what "9am tomorrow" means will eventually not bother, and then there
are two timezones on one document. That is a bug with a clock on it: they drift,
and the half that loses is the one deciding whether 3am counts as quiet hours.

So `time_zone` sits at the top level beside `school_id`, and
`NotificationPrefs.timezone` is passed in rather than stored.
`readNotifications` still reads the old `data.timezone` key, but only **below**
the top-level field. A first pass dropped it outright, reasoning that letting
the stale copy win would defeat the migration; that reasoning did not survive
the function's own control flow, which already overwrites the default with the
top-level value before the fallback is reached. So the top-level field wins
wherever it exists, and the only documents the old key can decide are the ones
with no top-level field at all -- which is every account that set a zone before
this change. Dropping it would have reset all of them to Toronto without anyone
touching a control, moving a Vancouver student's quiet hours by three hours.

The old key stays until those documents are backfilled. Each account also
self-heals the first time its owner saves the settings form.

### It is validated, not trusted

It arrives as a hidden input on a server action, which is a public HTTP
endpoint, and it decides when a student's phone is allowed to ring.
`resolveTimeZone` asks `Intl` whether the zone resolves rather than matching a
pattern -- a regex over `Region/City` admits `Foo/Bar` and rejects `UTC`, and
the question that matters is whether the thing doing arithmetic later can use
it.

It stores the **canonical** spelling `Intl` resolves to, never the submitted
string, and that is not tidiness. `Intl` is more forgiving than the consumer:
it accepts `america/toronto`, `EST5EDT`, and `utc`. The agent is Python, and
`zoneinfo.ZoneInfo("america/toronto")` raises `ZoneInfoNotFoundError` because
the tzdata lookup is case sensitive. Returning the input verbatim would have
stored a value this side called valid and the other side cannot resolve, and it
would have surfaced as a reminder that never fires, in a different codebase, at
3am.

The fallback chain is `submitted -> the school's campus zone -> America/Toronto`,
and the middle link is the useful one. A fixed default would put a UBC student
three hours out and a Memorial student three and a half.

## The `schools` collection

`data/schools.ts` was a TypeScript constant. It is now `schools/{id}` in
Firestore, read by `lib/schools.ts` and seeded from `scripts/schools.seed.ts`.

Two reasons, both from the issue: a school can be added without a deploy, and
the agent can turn a `school_id` into a name, a city, and a timezone without
carrying its own copy of the list.

### What it cost

Ground rule #4 says nothing factual ships unverified, and the enforcement
mechanism was that school names lived in a reviewed file. A console-editable
collection gives that up. The seed file keeps the rules, the source URLs, and
the August re-verification note, and an edit made in the console should be
brought back to it in the same week or the next seed run will quietly revert it.

### Two fields were added

`city` and `timeZone`, both for the agent. A province is too coarse to say
anything useful to a student, and `timeZone` is stored per school rather than
derived from the province code because **Newfoundland is UTC-3:30** -- any
two-letter mapping puts every Memorial reminder half an hour out.

### There is no fallback to the seed array, on purpose

The obvious safety net is to serve the hardcoded list when Firestore is empty or
unreachable. That net is a second copy of the data, free to disagree with the
first, silently, on exactly the day somebody is debugging why a school vanished.
`listSchools` returns `[]` instead and the picker says it could not load the
list, which is a visible failure. A wrong list is not.

### The catch sits outside the cache, and that placement is load-bearing

`listSchools` is called from the root layout, so it is cached for an hour and
tagged. `readSchools` **throws** on a failed read, and the `try/catch` that
turns that into `[]` wraps the cached function rather than living inside it.

Catching one level down looks identical and is a deployment hazard:
`unstable_cache` stores whatever it is handed, so a cold instance that could not
reach Firestore for one second would bake an empty list in for the next hour and
take the landing page's campus row and the whole picker with it. A thrown error
is not cached, so the next request retries.

### One read for the whole app

Five client components need the list -- the picker, the hero, the start nudge,
the wizard, and the theme provider. The alternative to one context is five prop
chains through layouts with no interest in schools, so `SchoolThemeProvider`
carries it: it was already mounted once at the root and already existed to
answer "which school" for the whole tree. `useSchools()` is the read.

`data/schools.ts` keeps the type and five pure functions that take a list. They
are pure because onboarding runs them on the server and the hero runs them in
the browser, and neither can afford that module to reach for a database.

## Deploying this

1. `npm run seed:schools` -- dry run, prints what it would change.
2. `npm run seed:schools -- --commit` -- writes.
3. Seed **before** deploying where you can. It is a performance concern now
   rather than a correctness one, for the reason below.

### Why an unseeded build is no longer a broken site

It very nearly was. `/` is prerendered and the root layout wraps it, and
`lib/firebaseAdmin.ts` notes that the *runtime* service account is the one
holding `datastore.user` -- so a build container without ADC reads nothing and
would have baked a hero with no campus chips. Not cosmetic: the Get started CTA
is gated on a school being picked, so a chipless hero has no working path into
onboarding at all, and ISR would have held it that way for an hour with no way
to flush it, since the seeder's `revalidateTag` is a no-op from a terminal.

The root layout calls `connection()` when the list comes back empty, which opts
that render out of prerendering. An unseeded or unreachable build serves every
route dynamically and re-reads on the next request instead of freezing a broken
page. Once a build can see a seeded collection, `/` goes back to static with a
1h revalidate. The cost is paid only where static generation would have been
wrong.

The seeder never deletes. A school in Firestore that is absent from the seed
file is reported as an orphan and left alone, because the alternative is a
script that silently reverts the console edits this whole change exists to
allow.

## Still open

- **The rules block is inert.** `firestore.rules` now has a `schools` match with
  `write: if false`, sitting under a catch-all that grants read and write on
  everything until 2026-09-21. Firestore grants if *any* rule allows, so a
  narrower rule cannot take permission back. That wildcard has to go before it
  expires and locks the project out of its own client SDK.
- **Nothing reads `time_zone` yet.** The agent's prompt carries no student
  context at all, so the frontend now writes three fields the agent side still
  has to pick up. Note that `POST /users/{user_id}/calendar/events` still
  defaults `timezone` to `America/Toronto` when the caller omits it
  (`connectors-api/app/routers/calendar.py`), which is wrong for anyone west of
  Ontario -- the caller should pass the student's `time_zone`.
- **Pre-#36 accounts have no top-level `time_zone`.** They read through the
  compatibility fallback above and fix themselves on the next settings save. A
  backfill would close it properly.
- **The dashboard degrades quietly when the catalogue is unreachable.** The
  settings page distinguishes "Not set" from "Could not load", but the overview,
  access, and layout surfaces just render without a school name, and the layout
  loses the school theme.
