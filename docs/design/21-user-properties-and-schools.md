# 21. User properties the agent reads, and the schools collection

Sources: [`lib/schools.ts`](../../src/frontend/lib/schools.ts),
[`lib/timeZone.ts`](../../src/frontend/lib/timeZone.ts),
[`data/schools.seed.ts`](../../src/frontend/data/schools.seed.ts)

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

The issue asked for it. It was not taken, and the honest reason is narrower
than the one first written here.

**The technical objection turned out not to exist.** An earlier draft of this
doc argued that a real name needs the `profile` scope, that `config.py` pins a
scope list which must stay byte-identical to
[`GOOGLE_SCOPES`](../../src/frontend/lib/googleOAuth.ts), and that widening it
would break refresh for every existing grant. @obaodelana pointed out on PR #42
that `config.py` has not carried scopes since `ebfa577`, and checking the code
it is worse than that for the argument: `firestore_creds.py` builds
`Credentials(...)` with **no `scopes=` argument at all**, so `self._scopes` is
`None` and google-auth's `requested - granted` check never runs. Nothing would
break. The only surviving copy of the list on the Python side is
`scripts/seed_credential.py`, a dev script.

So what is left is a product judgement, not a constraint:

- The field is editable either way, and a good number of students would change
  a registrar name to something shorter the first time they saw it.
- It widens the consent screen for a value one text input already gets.

That is a real reason but a weaker one, and it should be recorded as such. **If
the agent later wants the legal name specifically -- for a registrar lookup, or
to match a name on a portal -- adding `profile` to `GOOGLE_SCOPES` is now cheap
and this decision should be revisited rather than cited.**

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
Firestore, read by `lib/schools.ts` and seeded from `data/schools.seed.ts`.

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

### The seed catalogue is the floor

When the collection comes back empty or unreadable, `listSchools` serves
`SEED_SCHOOLS` from `data/schools.seed.ts` rather than an empty list.

The first version refused to, arguing that a second copy of the data can
silently disagree with the first and that an empty list is at least a *visible*
failure. @obaodelana rejected that on PR #42, and was right: an empty list is
not a neutral failure here. The school picker has nothing in it, the Get started
CTA is gated on a school being picked, and a Firestore hiccup becomes lost
signups. Stale beats absent when absent means the product does not work.

The disagreement is made loud rather than prevented. Every fallthrough logs an
error naming which case it hit -- an empty collection tells you to run the
seeder, a failed read prints the error. Nothing serves the catalogue silently.

This is also what lets `/` stay a prerendered static page. An earlier revision
called `connection()` in the root layout to opt out of prerendering whenever the
list came back empty, because a build container has no application default
credentials and would otherwise have baked a hero with no campus chips into a
static page for an hour. The fallback removes the condition that guard existed
for, so the guard is gone.

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

### Why an unseeded build is not a broken site

`/` is prerendered and the root layout wraps it, and `lib/firebaseAdmin.ts`
notes that the *runtime* service account is the one holding `datastore.user`.
So a build container without ADC reads nothing -- and bakes the seeded
catalogue, which is correct enough to start on, rather than an empty hero with
no path into onboarding.

What that costs: a school added in the console is invisible on the static
landing page until the 1h revalidate turns, and the seeder's `revalidateTag` is
a no-op from a terminal so there is no way to flush it early. Seeding before a
deploy avoids the window entirely.

The seeder never deletes. A school in Firestore that is absent from the seed
file is reported as an orphan and left alone, because the alternative is a
script that silently reverts the console edits this whole change exists to
allow.

## Still open

- ~~The rules block is inert.~~ **Fixed in this PR**, at @obaodelana's request.
  The `match /{document=**}` that granted read and write on everything until
  2026-09-21 is now `if false`, with `schools` open for reading above it. Safe
  because nothing reads Firestore from a browser: every server reads through the
  admin SDK, which bypasses rules, and `lib/firebaseClient.ts` loads
  `firebase/app` and `firebase/auth` only. It also removes an expiry three weeks
  out that would have failed closed with no warning.
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
