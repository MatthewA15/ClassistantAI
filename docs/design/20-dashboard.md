# 20. The signed-in area

Before this, the site had no signed-in state. Onboarding was the only door, and
once a student walked through it the product had nowhere to put them: the last
screen said "Back to home", which sent somebody who had just handed over a
school login and a portal password to a marketing page inviting them to get set
up.

Every control that existed was a one-time question asked during the wizard. The
access switches in particular were the promise that made the all-or-nothing
Google consent screen fair, and they were asked once, on one screen, never to be
seen again. A choice a student can make once and never revisit is a checkbox,
not a control.

This adds four pages under `/dashboard`, a way back in at `/signin`, and the two
entry points that let anybody find them.

## What is where

| Route | Owns |
| --- | --- |
| `/signin` | Phone number, six digit code, session cookie |
| `/dashboard` | Four status tiles and a five row activity preview. Nothing editable |
| `/dashboard/activity` | The task history, filterable by kind |
| `/dashboard/access` | The five access switches, the Google grant, the portal login |
| `/dashboard/settings` | Nickname, read-only identity, quiet hours, calls, digest, marketing, leaving |

The split is by the question a student arrived with, not by data model. "What is
it allowed to touch" and "when is it allowed to interrupt me" are different
questions with different answers about what is actually being promised (see
below), so they are different pages rather than two sections of one long
settings screen.

## Sign-in is a second front door, not a rewrite of the first

`components/auth/PhoneSignIn.tsx` is a separate component from the wizard's step
0, and the duplication is two form fields and a button. Everything that decides
whether a number is proven already lives outside both: `sendVerificationCode`,
`confirmCode`, `phoneErrorMessage`, and the `/api/auth/session` exchange.

Extracting the UI as well would mean threading the wizard's step index, its
verified-number banner, its school state and its "not your number?" affordance
through a shared component's props, producing something that switches on which
of its two callers is rendering it. The flows also genuinely differ: the wizard
is establishing an identity and everything after it is a step, while this is a
returning student who wants to be somewhere else within two taps and therefore
ends in a redirect, which the wizard's version cannot do.

`/api/auth/session` gained one field for this, `onboardingComplete`. Sign-in has
to choose between the dashboard and the rest of onboarding, and `connected`
cannot tell them apart: a student who finished the Google grant and abandoned
the flow before the portal password has `connected: true` and an unfinished
account.

## The gate is one check in a layout

`app/dashboard/layout.tsx` verifies the session and redirects, and every page
below it is protected by existing. A per-page guard is a rule somebody has to
remember, and the failure mode of forgetting is a student's account settings
rendering for whoever asked for the URL.

It redirects twice, not once. Signed out goes to `/signin`. Signed in but
unfinished goes to `/onboarding`, because a student who verified a number and
closed the tab holds a perfectly valid session and an account with no school, no
grant, and no portal password. Every card would be empty and several controls
would be writing preferences onto an account that does not do anything yet.

## Why it does not look like the landing page

The marketing pages argue. Section headings run to 3.1rem, sections breathe, and
the copy is the product. This is a tool somebody opens to change one setting, so
the type comes down, the density goes up, and cards do the separating that
whitespace does out front.

What is unchanged is the palette, the radii, the `ring-1 ring-line` on every
surface, the shadows, and the two type faces. Those are what keep it the same
product rather than a second one bolted on.

Two deliberate departures:

**A nav bar, not three floating pills.** `components/site/Header.tsx` explains
why the landing header is three capsules: over a hero, one wide bar reads as a
lid, and the middle capsule has to appear and vanish with the scrollspy without
leaving a hole in a container. Neither reason survives here. There is no hero,
nothing appears with scroll position, and the sections are a fixed set of four a
student moves between repeatedly. A tool needs furniture that does not move.

**Headings at 1.9rem.** A fifty pixel headline over a form asking which hours
are quiet reads as a landing page that lost its way.

## Two kinds of promise, and the pages have to keep them apart

This is the part most likely to be got wrong by somebody editing these screens.

| Control | What it actually does |
| --- | --- |
| Access switches | Binds Classistant. Google is not told anything |
| Quiet hours, calls, digest | True in the plain sense. The sender simply does not send |
| Google connection | Google's to grant. Ending it happens at myaccount.google.com |
| Portal password | Sealed under KMS. We can write it and cannot read it |

The access switches carry the same honest footnote they carry in onboarding, and
it has to stay: the grant is one token covering the whole scope set, so
narrowing it for real means sending a student back through consent with a shorter
list. A switch that looked like it revoked something at Google would be a claim
this product cannot keep.

The Google card offers a link out rather than a "revoke" button, for the same
reason. We cannot revoke it. A button here calling some endpoint of ours would
be claiming otherwise.

The sentence that earns its place most is on the portal card: **the access
switches do not reach the portal**. They cover Google scopes; the portal is a
password replayed into the school's own login page at 3am. A student who turned
all five switches off and believed the portal checks had stopped would be wrong
about the thing they most cared about getting right.

## The portal password cannot be shown, and that is the feature

`PortalLoginForm` asks for the password again rather than pre-filling it. This
app holds `cryptoKeyEncrypter` on `classistant-password-key` and decrypt on
nothing, so there is no component that could display it and no server action
that could be written to help. The agent is the only principal in the project
that can open one (`docs/ENCRYPTION_CONTRACT.md` §1, and docs/design/19).

`hasPortalPassword` therefore answers "is there one", never "does it still
work". Only the agent's next run finds that out, which is why a failed portal
sign-in is an activity row with `status: "attention"` rather than a state this
page could detect.

## Task history: the shape exists, the writer does not

`users/{uid}/activity` has no writer in this repository. The agent does the work,
so the agent records it, and the agent is a different codebase. The read side and
the document shape are in `lib/activity.ts`, written first so the writer has a
contract to write against rather than inventing one and having the two discovered
to disagree in front of a student.

    users/{uid}/activity/{autoId}
      kind      one of the ACTIVITY_KINDS keys in data/activity.ts
      status    "done" | "attention" | "failed"
      title     one line, already written for a student to read
      detail    optional second line
      href      optional link to the artefact itself
      at        Firestore Timestamp, server time

**So today this page is empty for everybody, and that is correct.** It must not
be filled with sample rows. A history is a record of what the product did with a
real person's real school email; seeded demo entries are a false statement about
that, on the one page whose entire job is to be a truthful account of what
happened. This is ground rule 4 of the design docs applied to a feed instead of
to a school name.

The kind list inherits the rule from `data/access.ts`: every kind must
correspond to something the product can do and must not suggest anything it
cannot. There is no `email_sent`, because `gmail.compose` writes drafts and is
incapable of sending. There is no deletion kind of any sort. An unreachable kind
here is worse than a misleading switch label, because a row in a history is a
claim that a thing happened.

Unrecognised kinds are dropped rather than rendered as "unknown activity". The
collection is written by another codebase on another deploy cadence, so it will
at some point contain a kind this build has not heard of, and a placeholder row
looks like a bug in the student's own account.

Filtering happens in the browser over the sixty rows the page read, so the chips
filter the page rather than the history. The footer says so when the page comes
back full. The overview's five row preview passes `filterable={false}`: a filter
is a promise that the set below it is the set being filtered, and on a preview
that is false in a way a student cannot see.

## Reading and writing the switches, and the two opposite defaults

Absence means two different things in two places, and getting either backwards
is a silent bug.

**In a submitted form, absence means off.** An unchecked checkbox submits
nothing at all, and every switch is on screen, so a key missing from the form is
one the student turned off. Reading it the other way would silently re-enable
whatever they had just switched off.

**In a stored document, absence means on.** A missing field means the student
onboarded before that switch existed, which means they were never asked, which
means the only thing known about it is where the Google grant is, and the grant
covers everything. Defaulting to off would withdraw an access the student had
already given and never asked to take back, and the only symptom would be a
feature quietly not working for the accounts that have been around longest.

`readAccess` in `data/access.ts` is the one place that translates the stored
snake-case `field` into the camel-case `key` the UI works in, so no component
has to know both names for the same switch.

## What settings deliberately refuses to edit

Three of the four facts in the profile card are read-only, and each is a refusal
rather than a missing feature:

- **The number** was proven by an SMS round trip. A text field overwriting it
  would hand a student a number nobody delivered a code to, which is the whole
  thing that round trip exists to prevent.
- **The address** was proven by the Google exchange, and it is also what
  `google_sub` is derived from and what the connector's endpoints are addressed
  by. It changes by connecting a different Google account.
- **The school** is determined by the address domain and checked against it in
  two places. A dropdown here could put a Mount Royal student on an Alberta
  theme with an Alberta portal and no error anywhere.

Each carries one line saying what would change it. A greyed-out field with no
explanation reads as broken; a value with a stated reason reads as a decision.

## Marketing consent is written twice, on purpose

`consent.marketing` stays exactly as onboarding wrote it: granted or not,
timestamped, with the wording that was on screen. It is CASL evidence, and a
record that can be edited afterwards is not a record.

What the settings toggle writes is `marketing_opt_in`, which is what the student
wants today. Anything sending marketing email reads the second one.

## Deletion is still an email

`components/legal/DeletionRequest.tsx` argues that a request erasing a semester
of coursework and a stored school credential should not be one mis-click, and
that the address it is sent from is corroboration we would otherwise need a
confirmation step to get. Having a session does not weaken that: it is an
argument about the size of the thing being destroyed, not about authentication.

What the session buys is that `/delete-my-data` can be reached from the danger
zone with one press instead of being found from the footer.

The danger zone is a ring in `--color-alert`, not a card filled with it. That
token is functional in this system, marking a step that went wrong, and nothing
on this part of the page has failed.

## Signing out revokes

`DELETE /api/auth/session` clears the httpOnly cookie and calls
`revokeRefreshTokens`, so a copy of the cookie taken from this browser is dead
too. That is why the settings button says "Sign out everywhere" and means it.
Both halves run: the client-side Firebase user is dropped as well, so a tab is
never left believing it is authenticated while the server has stopped agreeing.

Every sign-out and sign-in ends in `window.location.assign` rather than a router
push. The app router will happily serve a page out of its client-side cache from
before the cookie changed, which renders exactly the wrong side of the gate.

## Where the sign-in links went, and why only two

**The footer**, as a "Sign in" entry in the Product column and an outlined
button in the brand column. Outlined rather than the filled white of `Button`'s
`onInk` variant: the closing CTA band directly above the footer is one large
filled button on the same ink, so a second filled button a few centimetres below
competes with the page's actual ask.

**Under the onboarding card**, on the school picker and the number screen only,
via `Shell`'s `showSignIn` prop. Past that point the student has a verified
session and "sign in" would be an invitation to restart what they are three
quarters of the way through. A prop rather than something derived from `phase`,
because phase 1 covers the number, the Google grant and the portal password, and
this belongs under the first of those and nowhere near the other two.

**Not in the landing header.** It is three capsules with documented reasons for
being exactly three, and a fourth would break the 320px fit that makes the
hamburger-free design work. Somebody looking for the way back in scrolls to the
bottom or lands on `/onboarding`, and both are covered.
