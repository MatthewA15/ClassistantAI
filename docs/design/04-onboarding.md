# 04. Onboarding

Sources: [`app/onboarding/`](../../src/frontend/app/onboarding/),
[`components/onboarding/`](../../src/frontend/components/onboarding/)

> **Partly superseded.** The portal password step described below left
> onboarding on 2026-09-03 (issue #54). It is asked for at `/portal-login`
> when Classy first needs it, and [23](23-portal-login-handoff.md) has the
> reasoning. The order of the remaining screens is number, Google, switches;
> [15](15-firebase-auth.md) covers why the number moved to the front. The
> rest of this document still describes the shape of the flow.

## Four screens, down from six

The school is chosen in the hero and arrives as `?school=`, so onboarding starts
at the sign-in hand-off and inherits the school's theme.

| # | Step | Why here |
| --- | --- | --- |
| 1 | Connect your school account | Familiar. Google's own consent screen, on the school's own login page. |
| 2 | Let it work while you sleep | The portal password. Lands right after Google demonstrated a normal consent flow, which is the best moment to ask for something less normal. |
| 3 | Check your details | Name and email come back from Google, so this is confirmation, not typing. Terms and marketing consent sit here. |
| 4 | Where should it text you? | Behind the Finish button. |

## Four screens, but three phases

Those four screens were once shown as a numbered rail down the side, each with a
title and a blurb, plus a "Step 1 of 4" label above the heading. Counting the
school picker that came before them, the flow announced itself as five things to
get through before anything happened, which is the opposite of what it is.

It is now a progress bar over three milestones:

| Phase | Screens |
| --- | --- |
| Pick your school | the hero picker |
| Log in | connect, then the portal password |
| Your details | confirm, then the phone number |

The two sign-in screens are one job with a technical seam in the middle, and so
are the last two. Grouping them is honest about the work rather than about the
routing.

Two things this fixed:

- **The school picker now counts.** It was unnumbered, so a student who had
  already chosen a school arrived at the next screen and was told they were at
  step one of four. The bar fills by phases *finished*, so picking a school is
  worth a third before the sign-in screen is drawn.
- **The current phase is the loudest label.** Finished phases were brand green
  and the current one was plain ink, and green beat black: on the sign-in screen
  the eye landed on "Pick your school" and the page read as if that were still
  where you were. Finished recedes to grey now, the bar carries the progress,
  and only the current label is dark and bold.

It follows that the last phase reads two thirds while you are working through
it. Only a finished screen would be full.

## Landing the student on their own school's login page

Two OAuth parameters do the work, and they drove the UI:

- **`hd=<school domain>`** pins the consent screen to the school's Workspace
  tenancy, so a personal gmail cannot be connected by accident. This one is
  non-negotiable: without it a student can onboard successfully and get an
  assistant that finds nothing.
- **`login_hint=<user>@<domain>`** carries a full address. Where a school
  federates Google to its own IdP, which the schools we support do, a full
  address lets Google skip its account chooser and redirect straight to the
  university login page.

`hd` alone still stops at Google's screen first. That is why step 1 asks for
just the username and appends the domain itself: one short field buys a direct
hand-off to the school's page.

## Why the portal password still exists

Signing in with Google authorises **mail, calendar, and Drive**. It does **not**
create a session on the school's LMS, and posted grades and course files live
there. Classistant crawls the portal overnight, when the student is asleep and
cannot approve anything, so it has to be able to sign in on its own.

That is the entire justification, and step 2 says it in those words rather than
asking for a password and hoping nobody wonders why.

> **The password rule.** In
> [`actions.ts`](../../src/frontend/app/onboarding/actions.ts) the password is
> read into a local, length-checked, and dropped. Never logged, never echoed
> into a response, never in an error message, never in a trace. When the backend
> lands it goes straight from `formData` into the credential store and nowhere
> else.

## The phone number is last

It sits behind the Finish button. It is the one field with no upside for the
student until everything else is agreed, and asking for it early is what makes a
form feel like a lead-capture page.

## Details step

The email is shown as retrieved, not as an empty input. **Name is a required
field** and always open: it used to be a collapsed "Change nickname" escape
hatch defaulting to the local part of the address, which was fine while nothing
read it and became "Hey jokafor3" the moment the agent started greeting people.
See [21 User properties and schools](21-user-properties-and-schools.md).

While Google is stubbed, the name is placeholder text and the UI says so rather
than pretending it came from the registrar.

## Validation is split

- **Client**: presence and shape checks that gate each Continue. No round trip.
- **Server**, in `completeOnboarding`: the real validation, including that the
  email domain matches the chosen school. The client is not a trust boundary.

Errors come back keyed by field name so the wizard can highlight the offending
input without a shared schema library.

## Consent is a legal artifact

`acceptTerms` and `consentSms` are CASL consent records and A2P 10DLC
registration evidence. Persist the **timestamp, the IP, and the exact wording
shown**, not a boolean. `acceptMarketing` is separate and optional, and must
stay separate: bundling product email into the terms checkbox would invalidate
both.

## A trap that cost a runtime 500

`actions.ts` carries `"use server"`, and such a module **may only export async
functions**. Exporting a scopes array from it builds cleanly and then throws
`A "use server" file can only export async functions, found object` on every
request. Constants belong in a plain module. This is invisible to `tsc` and to
`next build`, and was only caught by driving the flow in a browser.
