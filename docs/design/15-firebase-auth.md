# 15. Firebase Auth, and the two identities

Who the student is, and how that became a different question from what the agent
is allowed to touch. This closes the first of the known gaps in
[12 Onboarding persistence](12-onboarding-persistence.md): *"The session cookie
is bearer-only. No revocation, no rotation, no device binding. Firebase Auth
session cookies are the natural upgrade."*

## The shape

```
student -> Firebase Auth (phone + SMS code) -> session cookie    identity
        -> Google OAuth via the connector   -> refresh token     authorisation
        -> Gmail, Drive, Docs, Calendar
        -> portal username + password
        -> switches over what may be touched
```

Two logins, and they are not the same login. The first proves the student is a
person we can reach. The second buys the access the overnight agent needs.

## Why the login is a phone number and not Google

The obvious design is one Google sign-in that does both. Two reasons it is not.

**Firebase never exposes Google's refresh token.** `signInWithPopup` returns an
OAuth *access* token, good for about an hour, and Firebase keeps nothing that
can mint another. The agent reads a student's mail and portal at 3am, when
nobody is awake to approve anything, so an hour of access is no access at all.
Offline access needs an authorisation-code exchange with a client secret, which
is what the connector already does and what Firebase has no part in. Adding the
API scopes to a Firebase Google provider would show the student the big consent
screen and *still* not produce a refresh token.

**Access and identity should be able to fail separately.** If the Google account
were also the login, a student who revokes access at Google loses their account
along with it, and there is no address left to tell them so. The phone number is
the channel this product actually delivers on, so verifying it first verifies
the thing that has to work.

The upside of the split, which was not the reason for it: **the grant is
one-time.** A returning student signs in with a code and, if `google_connected_at`
is already set, never sees the consent screen again.

## One id, and the two that came before it

**Everything is keyed by the Firebase `uid`.** The Google `sub` is a field on
the user document, `google_sub`, and nothing else.

| | Firebase `uid` | Google `sub` |
| --- | --- | --- |
| Comes from | phone sign-in | the code exchange |
| Exists from | step 0 | step 1 |
| Keys | `users/`, `credentials/` | nothing |
| Used for | everything | addressing the connector's endpoints |

This is the reverse of how it was first built, and the reversal is worth
recording because the original reasoning was sound and still lost.

### Why it was keyed by `sub`

[API_CONTRACT.md](../../src/backend/connectors-api/API_CONTRACT.md) freezes
`{user_id}` as the `sub` returned from `/auth/callback`, and every connector
endpoint is `/users/{user_id}/...`. Keying Firestore the same way meant one id
end to end and nothing to join.

### Why that was undone

The `sub` does not exist until the access grant completes, and three things
followed from that, all of them costs:

- **Nothing could be written during the first half of onboarding.** A verified
  phone had no key to be written under, so a student who stopped between the SMS
  and the grant left no trace at all. That was carried in this document as a
  known gap for as long as the `sub` was the key.
- **Every read needed a translation.** The session carries a `uid` and never a
  `sub`, so `getUserByAuthUid` ran an indexed equality query whose entire job
  was converting one into the other.
- **The key could change.** Reconnecting a different Google account yields a
  different `sub`, and therefore a different document id, orphaning the old one.
  A `uid` is stable for the life of the account.

The argument that held it in place also expired: issue #12 rewrites the
connector's storage path outright, and moves the code exchange to this app, so
the `sub` is no longer something the connector hands us in the first place. The
contract was going to be edited regardless, and the `users` collection was still
empty, so the migration cost was zero. There would not have been a cheaper
moment.

### What that changes in the code

- **`ensureUser` creates the document when the number is verified**, from
  `POST /api/auth/session`. Insert-only, so signing in again never resets a
  returning student's school, consent, or grant.
- **`recordGoogleConnection` no longer creates anything.** It adds the school
  address and `google_sub` to a document that is already there.
- **`getUser(uid)` is a direct document read.** `getUserByAuthUid` and its query
  are gone, and so is the `auth_uid` field.
- **A signed-in student always has a document.** Absence is no longer the normal
  mid-onboarding state; what distinguishes "verified but not granted" is
  `google_connected_at` being unset, which is a fact about the student rather
  than an accident of which id existed yet.

> [!IMPORTANT]
> Anything calling the connector must send `google_sub`, **not** the document
> id. The endpoints are still addressed by the `sub`.

### An earlier version of this document was Google-keyed

Before the phone step, the session was a Firebase *Google* sign-in, and the
`sub` was pulled straight out of `firebase.identities["google.com"][0]`, which
made the uid and the `sub` the same value. That trick is gone with the provider
it depended on. It is recorded here because it is the obvious thing to reach for
if phone auth is ever swapped back out, and because `googleSub()` no longer
exists in `lib/authSession.ts`.

## What the session cookie bought

| | Old: HMAC blob | New: Firebase session cookie |
| --- | --- | --- |
| Revocation | none | `verifySessionCookie(_, true)` on every read |
| Rotation | none | Firebase-managed |
| Lifetime | 30 days | 14 days (Firebase's ceiling) |
| Verified by | our own `SESSION_SECRET` | Google's keys |

The lifetime went **down**, and that is the trade: a shorter session in exchange
for being able to end one that is already out in the world. A 30 day token
nobody can revoke is not a longer session, it is a longer window.

`checkRevoked: true` costs a network call to Firebase per verification. That is
the price of the row above it.

**The cookie name did not change.** `classistant_session` still, deliberately.
Every old HMAC cookie now fails verification, returns null, and sends the student
through sign-in. A new name would have left the stale one sitting in their
browser for another 30 days.

**`SESSION_SECRET` is still needed.** It no longer signs the session. It signs
`classistant_oauth`, which carries the CSRF `state`, the chosen school, and the
address the student claimed, across the consent redirect. None of that is
identity and Firebase has nowhere to put any of it.

## Checks, and which one actually holds

**School eligibility is checked against Google's answer, not the form.** The
student types an address on step 1 and it is checked against the school's domain
there, so they are told before being sent rather than after coming back. That
check is a courtesy: the address is still just a claim typed into a form. The one
that holds is in the callback, against the address Google returns from the code
exchange, because that is the only address in the flow that was proven.

`hd` pins the account chooser to the school's Workspace domain, but `hd` is a
parameter on a URL that lives in the browser, and the browser is the thing being
checked.

**And it must be the address they said it would be.** A difference is not
necessarily an attack: picking the wrong account from Google's chooser does it.
But it means the rest of onboarding would be about a different mailbox than the
student thinks, and silently adopting the second one is the wrong way to resolve
that.

**Phone provider only.** `sign_in_provider` must be `phone`. If another provider
is switched on in the console it must not silently become a way in: there would
be no verified number behind it, and the number is what this product delivers on.

**The number is never read from the form.** It is on the session because
Firebase delivered a code to it and the student typed the code back. Moving
phone verification to the front of the wizard was what let this field stop being
a claim, so there is deliberately no `name` on either the phone or the code
input.

## The access switches

Google's consent screen is all or nothing. A student either grants the whole
scope set or cannot use the product, and that is only a fair trade if they can
narrow it afterwards. So the last step lists everything that was granted with a
switch on each, and step 1 promises exactly that before sending them to Google.

**A switch does not revoke anything at Google, and the copy must not imply it
does.** The grant is one token covering the whole set; narrowing it for real
means sending the student back through consent with a shorter list. What the
switches do is bind Classistant, which is worth something and is not the same
thing. The step links to Google's own permissions page for the real revocation.

`data/access.ts` is the single source for the list, and it inherits the rule from
`PERMISSIONS` in `connectScenes.tsx`: every label must describe something
`lib/googleOAuth.ts` actually requests, and **the word "send" must never appear**,
because `gmail.compose` writes drafts and cannot send. Each row carries its
`scopes` purely so the next person to edit `GOOGLE_SCOPES` can see which switch
they have just made a liar.

## The scenes

`PhoneVerifyScene` in `phoneScenes.tsx`, drawn in the same 320x200 box and line
language as the connect scenes. Type a number, press the button, a notification
slides in over the top with the code in it, six boxes fill, the card goes green
and ticks, and it resets.

Three decisions in it:

- **The number is `(647) 555-0134`.** 555-01xx is the range reserved for fiction
  in the North American plan, so it cannot be a real person's phone. Same rule as
  [05](05-schools-data.md): nothing invented ships as though it were real.
- **It rests mid act two, not on the green tick.** The tick was tried first and
  is the wrong still. Parked there, a reader with reduced motion gets a trophy
  for something they have not done and learns nothing, because it shows the
  outcome and hides the mechanism. The rest beat is the frame where the text has
  arrived, the code is legible in it, and four boxes are filled, which answers
  the only question the step actually raises. Same reasoning as
  [13](13-connect-scenes.md), and the same cost: reduced motion never sees the
  tick.
- **The pointer waits beside the code row rather than inside the cell being
  filled.** A pointer in an empty box says the box is being clicked, and nobody
  enters a code with a mouse.

Two layout traps this cost, both invisible in the source:

- The notification lands across the top of the card, and at act one's heading
  height it covered the words rather than overlaying them, which read as a
  layout bug instead of as a text arriving. Act two's text sits lower than act
  one's on purpose.
- The green wash is `var(--color-ok)`, the palette's functional green, not a
  brand colour. The three brand colours stay blue and white
  ([02](02-design-system.md)); `--color-ok` exists for exactly this, marking a
  step that passed.

**`SealedPasswordScene` moved to the portal step**, which resolves the concern
[13](13-connect-scenes.md) raises about itself. The sealed envelope is a
simplification of the Google grant and very nearly literal about the portal
password, so it now sits on the step it is accurate on and argues for.

## Setup this depends on

None of it is code, and all of it is required. Firebase Auth had never been
provisioned on `classisstant` when this was written: the Identity Toolkit admin
API returned `CONFIGURATION_NOT_FOUND`. **It has since been done**, and what
follows is the record of what it took, because none of it is discoverable from
the failure messages.

1. **Firebase Authentication is initialised** and **Phone** is enabled.
   Provisioned through `identityPlatform:initializeAuth` on the Identity Toolkit
   v2 admin API rather than the console; the console's "Get started" does the
   same thing.
2. **Authorised domains** are `localhost`, `127.0.0.1`,
   `classisstant.firebaseapp.com`, `classisstant.web.app`, and
   `classistant--classisstant.us-central1.hosted.app`. Missing here surfaces as
   `auth/unauthorized-domain`.
3. **The SMS region allowlist starts empty, and empty means nothing is
   allowed.** A fresh config carries `smsRegionConfig.allowlistOnly: {}`, which
   silently refuses every send. It is set to `["CA"]`. This is invisible in the
   console until looked for and is the single least obvious item on this list.
4. **Blaze is required and is enabled.** SMS is billed per message.
5. **IAM needs nothing extra.** An earlier version of this document claimed the
   runtime service account required `roles/iam.serviceAccountTokenCreator` on
   itself plus `roles/firebaseauth.admin`. It does not:
   `createSessionCookie` is a plain Identity Toolkit call, not a local JWT
   signing operation, and `firebase-app-hosting-compute@` already holds
   `firebaseauth.users.createSession` through
   `roles/firebase.sdkAdminServiceAgent`. The `serviceAccountTokenCreator`
   requirement is real for `createCustomToken`, which this app does not call.
6. **Local development needs Application Default Credentials.**
   `gcloud auth application-default login`, then
   `gcloud auth application-default set-quota-project classisstant`. This is
   separate from `gcloud auth login`; having one does not give the other, and
   `lib/firebaseAdmin.ts` reads only the second. Without it every server-side
   step after the code is accepted fails.

> [!WARNING]
> **Test numbers must be removed before launch.** A number in
> `signIn.phoneNumber.testPhoneNumbers` signs in with a fixed code and **no
> SMS** — an auth bypass on a real number if one is left there. `+1 647 555-0134`
> / `123456` is the fictional one the scene is drawn around and is safe to keep
> in development. Clear the map with:
>
> ```
> PATCH .../v2/projects/classisstant/config?updateMask=signIn.phoneNumber
> {"signIn":{"phoneNumber":{"enabled":true,"testPhoneNumbers":{}}}}
> ```

`lib/firebaseClient.ts` maps `auth/configuration-not-found`,
`auth/operation-not-allowed`, `auth/invalid-app-credential` and
`auth/billing-not-enabled` to their own messages, and logs the raw error for
anything unmapped, so a half-configured project fails loudly during setup rather
than looking like an ordinary sign-in failure.

### Anti-abuse throttling looks like a configuration error

A run of failed sends trips Google's per-number abuse protection, after which
`sendVerificationCode` returns `TOO_MANY_ATTEMPTS_TRY_LATER` and the browser
gets `auth/invalid-app-credential` — *even when the reCAPTCHA challenge was
solved correctly*. It reads exactly like a broken project and is not one.

It is time-based, there is no API to clear it, and **every retry re-arms it**.
The way through is a different number, or waiting. Worth knowing before spending
an afternoon on the config, which is how this note came to exist.

### `localhost` cannot send real SMS at all, by policy

Google's auth backend **refuses `sendVerificationCode` for real numbers from
`localhost`**, and the refusal is — again — `auth/invalid-app-credential`
([firebase-js-sdk #8387](https://github.com/firebase/firebase-js-sdk/issues/8387),
confirmed by the Auth team, not fixed, not going to be). No client change and no
console setting clears it. Developing against it:

- **The fictional test number** `+1 647 555-0134` / code `123456` signs in with
  no SMS and skips every check below. This is Google's own recommendation, and
  it is why a passing test-number run proves nothing about real numbers.
- **`http://127.0.0.1:3000`** instead of `http://localhost:3000` for a real
  number on a dev build. `127.0.0.1` is a different hostname to the policy and
  is already in the project's authorized domains.
- The deployed domain, for the test that actually counts.

An evening was spent on exactly this (2026-08-26): every real-number send from
`localhost` failed as `invalid-app-credential`, which read as a reCAPTCHA
misconfiguration, was not one, and was reproducible with **provably genuine
tokens** — three fresh reCAPTCHA Enterprise tokens that the Enterprise
assessment API itself judged `valid: true` were still turned down.

### reCAPTCHA Enterprise SMS defense is on, in AUDIT

Since 2026-08-27 the project runs Identity Platform's SMS toll-fraud protection:
`phoneEnforcementState: AUDIT`, `useSmsTollFraudProtection: true`, a managed
rule of `BLOCK` above score `0.5` (higher = more likely fraud). What that means
in practice, from Google's own docs and the SDK source:

- **In AUDIT nothing is ever hard-blocked for SDK clients.** The SDK sends an
  Enterprise token first; if the server turns it down
  (`auth/invalid-app-credential` / `auth/missing-recaptcha-token`), the SDK
  silently retries through the classic v2 verifier — the one this app mounts.
  AUDIT exists to produce metrics, not protection.
- **ENFORCE removes that fallback.** Do not flip it until the Firebase console's
  reCAPTCHA metrics show real users passing, and raise the block threshold to
  Google's recommended starting point of `0.8` when doing so — `0.5` was set
  before any traffic existed to calibrate against.
- **The fallback can hang the page.** If the v2 fallback raises a visible
  challenge and the student dismisses it, the SDK's promise never settles —
  neither resolve nor reject. `sendVerificationCode` races it against a 90s
  timer for exactly this reason.
- `initializeRecaptchaConfig` runs from `warmPhoneAuth` so the config fetch and
  Google's behaviour observation start while the student types, which is worth
  real score points to an honest visitor.

### reCAPTCHA is not optional

Firebase refuses `signInWithPhoneNumber` without an `AppVerifier`. It is what
stands between the form and someone spending the SMS budget in a loop. Invisible
size, so ordinary traffic never sees a challenge.

Three things about it that cost time:

- **The verifier is a module-level singleton.** Constructing a second one against
  the same container throws, and a re-render must not be able to cause that.
- **A reCAPTCHA token is single use.** After a failed send the widget is spent,
  and reusing it produces `auth/captcha-check-failed` on every retry after the
  first, which looks exactly like the student's number being at fault.
  `resetVerifier()` exists for that and is called on every failure path.
- **The container must be laid out, and must not be sized to nothing.** This one
  cost the most, so it is written out in full below.

The container is rendered for the whole wizard rather than inside step 0, and
outside the `<form>`. Inside step 0 it would be a new DOM node whenever a student
navigated back to it while the verifier still held the old one; inside the form
it would put an injected iframe and hidden input into a form whose action writes
a student's account.

#### The container is an empty, unstyled `<div>`, and both halves of that matter

```jsx
<div id={RECAPTCHA_ID} />
```

It shipped as `className="hidden"`. Tailwind's `hidden` is `display: none`, and
grecaptcha cannot mint a token from a container it cannot lay out — invisible
size still has to be able to raise a challenge over the page for traffic Google
does not trust. Every send failed with `auth/invalid-app-credential`, which
names the *app credential* and not the container, and reads as a project
misconfiguration.

The obvious repair, `h-0 w-0 overflow-hidden`, breaks it a second way:
grecaptcha renders its anchor iframe **inside** this element, and clipping that
to zero makes it read positions off a node with no box. That throws
`Cannot read properties of null (reading 'style')` from inside
`recaptcha__en.js`.

At `size: "invisible"` an empty div is the whole answer. It collapses to nothing
on its own, and the floating badge is `position: fixed` and never lived in the
container anyway.

The general rule, which generalises past this file: **`hidden` is wrong for any
third-party widget that has to render.**

### The config is hand-synced, again

The four `NEXT_PUBLIC_FIREBASE_*` values live in both `apphosting.yaml` and
`.env.example`, the same trap [12](12-onboarding-persistence.md) records for the
scope list. **Availability must be `[BUILD, RUNTIME]`**: Next inlines
`NEXT_PUBLIC_*` at build time, so a value that exists only at runtime compiles to
`undefined` and sign-in fails in production while working perfectly on any dev
machine with a `.env.local`.

None of the four is secret. A Firebase `apiKey` is a project identifier, not a
credential; every Firebase web app ships it to every browser. Re-read them with
`firebase apps:sdkconfig WEB --project classisstant`.

## Known gaps

- **Sign-in is not end-to-end tested through a real SMS.** The project side is
  verified: `sendVerificationCode` and `signInWithPhoneNumber` were both driven
  directly against Identity Toolkit and returned a real `localId`, so phone auth
  works. What has not been observed is a real code arriving on a real handset and
  being typed into the wizard, because the number used for development is
  throttled (see above) and the alternative was an allowlisted test number, which
  never sends anything.
- ~~**Abandoning between the code and the grant loses the school and address.**~~
  **Closed** by keying on the Firebase `uid`. The document now exists from the
  moment the number is verified, so there is somewhere to write in-progress
  onboarding to. The fix this gap proposed — "a document keyed by `auth_uid`" —
  is what rekeying made unnecessary rather than what it took.
- **`serviceEmail` is no longer collected.** The optional "different Google
  account for Drive and Calendar" field was on the old details screen, which the
  access switches replaced. The field is still on `UserProfile` and is written as
  `undefined`. Nothing read it; deleting it properly is a separate change.
- **The switches are not enforced anywhere yet.** They are stored on the user
  document and every reader is *expected* to honour them. Until the agent and
  connector actually do, the last step promises something the backend does not
  keep, which is the most important open item here.
- **A student can be refused after the SMS.** School eligibility is checked at
  the grant, one step after the number is verified, so a wrong-domain account
  costs a text message before it is turned away. Cheap, and the alternative is
  checking an unproven claim earlier.
- **The header still says "Get set up" to a signed-in student.** The
  session-aware header remains outstanding in [07](07-backend-contract.md). The
  only sign-out affordances are "Not your number?" on step 0.
- **The OAuth app is unverified**, so only accounts added as test users on the
  consent screen can complete the grant. Unchanged.
