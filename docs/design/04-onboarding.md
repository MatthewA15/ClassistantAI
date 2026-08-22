# 04. Onboarding

Sources: [`app/onboarding/`](../../src/frontend/app/onboarding/),
[`components/onboarding/`](../../src/frontend/components/onboarding/)

## Step order, and why it is this order

| # | Step | Why here |
| --- | --- | --- |
| 1 | School | Cheapest possible question, and it is the one that can disqualify. Asking it first means an unsupported student burns ten seconds, not four minutes. |
| 2 | Google sign in | Familiar and low-anxiety. Establishes we work through Google's consent screen before we ask for anything ourselves. |
| 3 | Name, email, phone, SMS consent | Ordinary contact details. Momentum builder. |
| 4 | Portal login | The hard ask. It lands fourth, after three steps of sunk cost and immediately after Google demonstrated a normal consent flow. |
| 5 | Preferences | Deliberately after the hard ask. Choosing quiet hours and pushiness returns a sense of control right when the student is feeling most exposed. |
| 6 | Confirm | Shows everything back, including "Password: stored encrypted, never shown again". |

The single most important sequencing decision is **the portal password is step 4,
not step 1.** Asking a stranger for their university password on the first screen
loses most of the funnel, and deserves to.

## Unsupported schools are visible, not hidden

`SchoolPicker` lists `pending` schools greyed out with a "Not yet" tag rather
than filtering them out. A student searching "Brock" and getting an empty box
cannot tell whether they misspelled it or whether it is unsupported. Showing it
answers the question and routes into the waitlist branch.

## Validation is split on purpose

- **Client**, in `canAdvance`: cheap presence and shape checks that gate the
  Continue button. Instant feedback, no round trip.
- **Server**, in `completeOnboarding`: the real validation. Re-checks everything,
  including that the school email domain matches the chosen school, because the
  client is not a trust boundary.

The server action returns `errors` keyed by field name so the wizard can
highlight the offending input without any shared schema library.

## The password handling rule

In [`actions.ts`](../../src/frontend/app/onboarding/actions.ts), the portal
password is read into a local, length-checked, and never touched again. It is
never logged, never echoed into a response, never included in an error message.

This is written as a comment in the file and repeated here because it is the kind
of rule that gets broken by someone adding a debug log during an incident. When
the backend lands, the password should go straight from `formData` into the
credential store call and nowhere else.

## Server actions, and what they do not do

All three actions are real server actions with real validation, and none of them
persist anything. Each carries a `TODO(backend)` naming the specific integration
that belongs there. The client is finished: wiring the backend should not require
touching any component.

- `startGoogleSignIn` builds toward an OAuth redirect. Note the `hd` parameter in
  the TODO, which pins the consent screen to the school's domain so a student
  cannot connect a personal Gmail by accident.
- `completeOnboarding` validates the whole payload.
- `joinWaitlist` records interest in a pending school.

## Small things that matter

- Phone input formats to `(604) 555-0123` as you type, and only ever submits
  digits.
- `autoComplete="new-password"` on the portal field, so browsers do not offer to
  fill a saved password from an unrelated site.
- A Show/Hide toggle, because people mistype passwords they are already nervous
  about entering.
- `robots: { index: false }` on the onboarding page. It is a funnel step, not a
  landing page, and should not compete in search.
- The step rail's progress bar is driven off `step / (STEPS.length - 1)`, so
  adding a step does not require touching the rail.
