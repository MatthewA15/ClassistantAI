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

### `startGoogleSignIn(formData)`

Receives `schoolId`. Should build the Google OAuth consent URL and `redirect()`.

- Scopes the agent needs: `gmail.readonly`, `gmail.send`, `calendar.events`,
  `drive.readonly`.
- **Set `hd` to the selected school's `emailDomain`.** Without it a student can
  connect a personal Gmail, onboard successfully, and get an assistant that finds
  nothing. `getSchool(schoolId).emailDomain` gives you the value.
- The callback route exchanges the code and creates the Firestore user document.

### `completeOnboarding(prev, formData)`

Fields: `schoolId`, `fullName`, `schoolEmail`, `phone` (digits), `portalUser`,
`portalPassword`, `intensity` (`gentle` | `standard` | `relentless`),
`quietFrom`, `quietTo` (24h `HH:00`), `callsEnabled`, `callsForEmail`,
`consentSms` (all checkboxes are `"on"` or empty).

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
