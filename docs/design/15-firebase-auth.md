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

## The two ids, and the seam between them

This is the part that most needs to be understood before changing anything here.

| | Firebase `uid` | Google `sub` |
| --- | --- | --- |
| Comes from | phone sign-in | the connector's code exchange |
| Exists from | step 0 | step 1 |
| Keys | nothing | `users/`, `credentials/`, every connector call |

Firestore is keyed by the Google `sub`, and so is every endpoint the ADK agent
calls, against a contract
[frozen for the Aug 22 build](../../src/backend/connectors-api/API_CONTRACT.md).
None of that changed. What changed is that the session no longer knows that id.

So:

- **Nothing is written during the first half of onboarding.** A verified phone
  with no `sub` has no document to be written to, and inventing a key to hold a
  half record would mean migrating it later.
- **`recordGoogleConnection` is where the user document is born.** It is the
  first moment a `sub` exists, and it writes `auth_uid` and `phone_number` from
  the session in the same breath. That one write is the entire bridge between
  the two identities.
- **`getUserByAuthUid` is how anything gets back across.** Single-field
  equality, so Firestore's automatic index covers it and nothing has to be
  deployed alongside.

A signed-in student with no user document is therefore the *normal* state in the
middle of onboarding, not an error, and code that reads the document has to say
so rather than treating absence as a fault.

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
provisioned on `classisstant` when this was built: the Identity Toolkit admin
API returned `CONFIGURATION_NOT_FOUND`.

1. **Enable Firebase Authentication** on `classisstant`, and enable **Phone** as
   a sign-in provider.
2. **Authorised domains** must include `localhost` and
   `classistant--classisstant.us-central1.hosted.app`. Missing here surfaces as
   `auth/unauthorized-domain`.
3. **IAM on the App Hosting runtime service account.** Minting a session cookie
   signs a JWT *as* that account, so it needs
   `roles/iam.serviceAccountTokenCreator` on itself, plus
   `roles/firebaseauth.admin`. Without it every sign-in fails at the last step,
   after the student has already received the SMS, with a permission error from
   the IAM signBlob API.
4. **Phone auth costs money and has a quota.** SMS is billed per message and the
   project needs Blaze. Add test numbers in the console during development:
   Firebase lets a fixed number and code through without sending anything, and
   `123456` is the convention the scene is drawn around.

`lib/firebaseClient.ts` maps `auth/configuration-not-found` and
`auth/operation-not-allowed` to their own messages so a half-configured project
fails loudly during setup rather than looking like an ordinary sign-in failure.

### reCAPTCHA is not optional

Firebase refuses `signInWithPhoneNumber` without an `AppVerifier`. It is what
stands between the form and someone spending the SMS budget in a loop. Invisible
size, so ordinary traffic never sees a challenge.

Two things about it that cost time:

- **The verifier is a module-level singleton.** Constructing a second one against
  the same container throws, and a re-render must not be able to cause that.
- **A reCAPTCHA token is single use.** After a failed send the widget is spent,
  and reusing it produces `auth/captcha-check-failed` on every retry after the
  first, which looks exactly like the student's number being at fault.
  `resetVerifier()` exists for that and is called on every failure path.

The container is rendered for the whole wizard rather than inside step 0, and
outside the `<form>`. Inside step 0 it would be a new DOM node whenever a student
navigated back to it while the verifier still held the old one; inside the form
it would put an injected iframe and hidden input into a form whose action writes
a student's account.

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

- **Sign-in is not end-to-end tested.** It cannot be until step 1 above is done.
  Everything below the SMS is: validation, token rejection, the admin SDK, the
  callback guards, and the build all verified locally.
- **Abandoning between the code and the grant loses the school and address.**
  Nothing is written until the grant completes, so a reload in that window drops
  back to whatever `?school=` carries. The fix, if it turns out to matter, is a
  document keyed by `auth_uid` for in-progress onboarding.
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
