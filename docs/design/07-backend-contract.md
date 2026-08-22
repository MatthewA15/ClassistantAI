# 07. Backend contract

What the frontend hands over, and what it deliberately leaves undone. Written for
whoever wires up Cloud Run, Firestore, Twilio, Call-E, and the ADK agent.

## Scope boundary

This is a **frontend-only** deliverable. There is no database, no auth session,
no API client, and no provider SDK anywhere in `src/frontend`. That is deliberate,
not unfinished: the backend stack was already chosen, and stubbing it here would
have meant guessing at interfaces you are about to define properly.

Everything that needs a backend is a server action with a `TODO(backend)` naming
the exact integration.

## The three server actions

All in [`app/onboarding/actions.ts`](../../src/frontend/app/onboarding/actions.ts).
They already do full server-side validation and return
`{ ok, message, errors? }`. The UI is finished against that shape, so filling in
the bodies should not require touching any component.

### `buildGoogleAuthUrl(schoolId, username)` and `connectGoogle(prev, formData)`

`buildGoogleAuthUrl` already assembles the authorisation URL with the right
scopes, `hd`, and `login_hint`. Add `client_id`, `redirect_uri`, `state`,
`code_challenge`, and `access_type=offline` + `prompt=consent` for a refresh
token, then `redirect()`.

- **`hd` is non-negotiable.** Without it a student can connect a personal Gmail,
  onboard successfully, and get an assistant that finds nothing.
- `login_hint` is what makes the hand-off land on the school's own IdP rather
  than Google's account chooser. Step 1 collects the username for this reason.

`connectGoogle` currently stands in for the callback and returns a simulated
identity so the rest of the flow is walkable. Replace it with the real code
exchange; read `email` and `name` from the ID token.

**Constants may not be exported from this file.** It is a `"use server"` module,
so a non-function export throws at runtime on every request while still building
cleanly. Put shared constants in a plain module.

### `completeOnboarding(prev, formData)`

Fields: `schoolId`, `email`, `name`, `nickname`, `serviceEmail` (optional
alternate Google account), `portalUser`, `portalPassword`, `phone` (digits),
`acceptTerms`, `acceptMarketing`, `consentSms` (checkboxes are `"on"` or empty).

`portalPassword` is still collected, and deliberately so: OAuth authorises mail,
calendar, and Drive but gives no session on the school's LMS, and the overnight
crawl has to sign in without the student present. See
[04](04-onboarding.md).

On success it should: write the profile to Firestore, put the credential in the
encrypted store, send the Twilio verification SMS, and enqueue the first portal
crawl.

> **The password rule.** `portalPassword` must go straight from `formData` into
> the credential store call and nowhere else. Never logged, never returned in a
> response, never in an error message, never in a trace. The current code holds
> it in a local, length-checks it, and drops it. Keep that property.

### `joinWaitlist(prev, formData)`

Receives `email` and `schoolId`. Append to a waitlist collection.

## Consent is a legal artifact, not a UI state

`consentSms` gates express consent under CASL, and it is also what a carrier will
ask about during A2P 10DLC registration. When you persist it, **store the
timestamp, the IP, and the exact consent wording shown**, not just a boolean. The
wording currently lives in the `Choice` component on step 3 of the wizard.

The same applies to `callsEnabled`. Voice calls are a separate consent from
texts, which is why they are separate controls.

## Keyword handling

The site promises four keywords in copy, in the privacy policy, and in the terms.
They have to work on the Twilio inbound webhook or the legal documents are wrong:

| Keyword | Effect |
| --- | --- |
| `STOP` | End everything |
| `STOP CALLS` | Keep texts, end voice calls |
| `HELP` | Support info |
| `DELETE` | Close account, erase data, destroy the stored credential |

## Schools data ownership

[`data/schools.ts`](../../src/frontend/data/schools.ts) is currently a static
file, which is right for six schools. If it moves to Firestore, keep the
`status` and `source` fields and keep the rule that nothing ships as `live`
without a source URL. See [05](05-schools-data.md).

## What is left for the frontend

- Swap `PlaceholderShot` for real screenshots.
- Build the dashboard at `/dashboard` (referenced in copy, not built).
- Session-aware header, once auth exists, so a signed-in student sees their name
  instead of "Sign in".
- OG image. `metadataBase` is set, the image is not made.
- Replace the placeholders in [`data/legal.ts`](../../src/frontend/data/legal.ts).
