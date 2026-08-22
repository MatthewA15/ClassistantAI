# 04. Onboarding

Sources: [`app/onboarding/`](../../src/frontend/app/onboarding/),
[`components/onboarding/`](../../src/frontend/components/onboarding/)

## Four screens, down from six

The school is chosen in the hero and arrives as `?school=`, so onboarding starts
at the sign-in hand-off and inherits the school's theme.

| # | Step | Why here |
| --- | --- | --- |
| 1 | Connect your school account | Familiar. Google's own consent screen, on the school's own login page. |
| 2 | Let it work while you sleep | The portal password. Lands right after Google demonstrated a normal consent flow, which is the best moment to ask for something less normal. |
| 3 | Check your details | Name and email come back from Google, so this is confirmation, not typing. Terms and marketing consent sit here. |
| 4 | Where should it text you? | Behind the Finish button. |

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

Name and email are shown as retrieved, not as empty inputs. Two escape hatches:
**Change nickname** for what the agent calls you, and **Different email for
Google Drive, Calendar, and email?** for the case where coursework lives in
another account. Both are collapsed until clicked, so the default path is
reading two lines and moving on.

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
