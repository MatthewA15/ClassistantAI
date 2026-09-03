# 23. The portal login, asked for later

Onboarding no longer asks for the school portal password. The step that did is
gone, and in its place is a page Classy texts a link to when it actually needs
the login: `/portal-login`. This is issue #54.

## What was wrong with asking during onboarding

The wizard was four screens: the number, the Google grant, the portal password,
the switches. The third one was the biggest ask in the flow and it landed at
the worst possible moment.

It is a second password, for a site the student met four minutes ago, and it
comes before anything has been done for them. Google's consent screen at least
looks like every other consent screen they have ever clicked through. A form on
our page asking for the credential they use to see their grades does not, and
the drawing beside it, however good, is us asserting our own trustworthiness
to somebody with no evidence either way.

Two costs followed. The obvious one is churn: a student who is going to bail
on signup bails here. The less obvious one is that the ask itself reads as a
security smell, and reasonably so. Collecting a credential up front, from
everybody, whether or not the product ever ends up needing it for them, is the
shape of a form that wants data more than it wants to help.

## The shape now

```
onboarding    number -> Google -> switches -> done
                                                 |
                                                 v
                              texts start arriving; Classy reads mail and calendar
                                                 |
                              Classy needs the portal for the first time
                                                 |
                                                 v
                              "Add your portal login: classistant.ca/portal-login?phone=..."
                                                 |
                                                 v
/portal-login   code (if signed out) -> the same form, sealed the same way -> back to Messages
```

The student is asked once, by something that has already sent them a useful
text, with a reason attached. That is a different question from the one the
wizard was asking, even though the fields are identical.

### The onboarding wizard

Three screens. `phaseForStep` maps 0 and 1 onto "Log in" and 2 onto "Welcome
gift"; the three `PHASES` in `shell.tsx` did not change, because they were
already counting jobs rather than screens. The Back button went with the step:
every remaining screen either starts the flow or sits behind a proof (a
delivered code, a completed grant) that Back could only offer to redo.
`completeOnboarding` stopped reading `portalUser` and `portalPassword` and
stopped calling `savePortalCredentials`, so an account can now finish onboarding
with no portal credential at all. Every reader of the credential document
already tolerated that; the dashboard's tile says "Missing" and links to the
form.

The done screen is the one place the portal is mentioned during signup: "When
it needs your school portal, Classy will text you a link for that." It is the
first moment a student has finished something and can hear "one more thing,
later" without it costing the signup.

### The page

`app/portal-login/page.tsx`, rendered in the onboarding wash rather than the
dashboard frame. It is a hand-off page a student arrives at from a text and
leaves from, not a room they navigate around in, so the nav rail would be
furniture for a corridor.

Three states, decided below a Suspense boundary for the reason `/signin` and
`/onboarding` put theirs there:

| State | Renders |
| --- | --- |
| Signed out | `PhoneSignIn`, prefilled from `?phone=`, returning here |
| Signed in, onboarding unfinished | a redirect to `/onboarding` |
| Signed in, finished | `PortalLoginHandoff` |

`PortalLoginHandoff` is the old onboarding step with its ending changed: the
same heading ("Let it work while you sleep" names the benefit, not the
credential), the same two fields, the same four reassurance lines, and the
`SealedPasswordScene`, which was drawn for exactly this ask and moved with it.
It is open by default, because the student tapped a link whose whole purpose
is this form; the dashboard's version collapses to a button for reasons that do
not apply here. It ends by replacing itself with a "Sealed" card whose one
filled button is `sms:` back to Classy.

The two fields are shared with the dashboard's replace form through
`components/portal/PortalLoginFields.tsx`. That is a deliberate exception to the
argument `PhoneSignIn` makes against sharing its fields with the wizard: there
the fields were the only thing in common; here they are the same two names,
read by the same server action, with the same error keys, and everything that
differs is outside them.

### The `phone` parameter proves nothing

The link carries the number Classy texted so the student can skip typing it.
That is the entire job. It is never read on the server, never compared to
anything, and never used to decide whose account this is; identity is the SMS
round trip, exactly as on `/signin`, and a student who is already signed in
never sees the number field. `formatPhone` reduces whatever arrives to at most
ten digits, so a hostile value is a wrong prefill and nothing else.

`PhoneSignIn` gained `initialPhone` and `next` for this. `next` is a literal
the page wrote, never a value from the URL: a destination read from the request
would turn the page into an open redirect wearing a sign-in form.

## The store did not change, and the issue asked whether it should

The issue thread proposes something further: a `secure.classistant.ca` that
takes the number as a parameter and keeps the encrypted details "in something
like Cloudflare's KV for a limited time". That is a different storage model
from the one this codebase has, and this change deliberately does not adopt
it. The reasoning is worth recording because the proposal is not unreasonable.

**What we have.** The password is envelope-encrypted under
`classistant-password-key` and written to
`users/{uid}/credentials/school_password`, per `docs/ENCRYPTION_CONTRACT.md`
§1 and [19](19-portal-password-envelope.md). The frontend holds encrypt only.
The browser agent (`src/agents/browser-agent/app/credentials.py`) is the one
principal with decrypt, and it reads that document, by that path, with a ten
minute in-process cache. Its `CredentialNotFound` message even says "has the
user saved their portal password in the dashboard?".

**Why not ephemeral.** The agent runs while the student is asleep. That is not
an implementation detail, it is the product: "let it work while you sleep" is
the heading on the form. A credential that expires minutes after being typed
can serve the sign-in that happens right then and no other. The next overnight
run would have to wake the student up to ask again, or the browser's cookie
jar would have to carry every session indefinitely, which is a longer-lived
and less protected credential than the sealed password it would be replacing.
Persistent browser sessions per student do exist (`/mnt/cookie-storage/<uid>`,
in the browser agent's README), and they reduce how often the password is
replayed. They do not remove the need to hold it.

**Why not Cloudflare KV specifically.** Everything in this system is on GCP:
Firestore, KMS, Cloud Run, App Hosting, Identity Platform. A second vendor for
one credential is a second audit story, a second failure mode and a second IAM
model, which is precisely the situation [19](19-portal-password-envelope.md)
records getting rid of when the password left Secret Manager. If the team does
want a time limit, Firestore has one built in: a TTL policy on an `expires_at`
field on the credential document, with the same envelope and the same key, and
no new vendor.

**What the frontend built is compatible with either answer.** The page collects
two fields and calls a server action. Where that action puts the password is
one function. If the decision goes the other way, `savePortalLogin` changes and
the page does not.

This is an open question for `@obaodelana`, not a closed one. The frontend
half of #54 does not depend on the answer, so it shipped.

## What the agent has to do

Nothing here sends the link. Classy decides when it needs the portal and texts
the URL; that is agent work and it belongs with #55's skills. The contract is:

- The URL is `${NEXT_PUBLIC_APP_URL}/portal-login?phone=<E.164>`.
- The trigger is `CredentialNotFound` from `get_portal_credentials`. That is
  now a normal state for a finished account, not a fault.
- After the student saves, the browser agent's ten minute credential cache may
  still hold the miss. `clear_cache()` exists for that, or the next run picks
  it up.

Until that is wired, the dashboard's Access page and the overview tile both
offer the form, so a student who wants to get ahead of the text can.

## What is stale, and what to do about it

- [04](04-onboarding.md) and [07](07-backend-contract.md) describe the portal
  step as part of onboarding. Both carry a note pointing here.
- The privacy policy's "information you give us during onboarding" list named
  the portal login. It now reads "at sign-up or later" and says the credential
  is given "when the assistant asks for them".
- Students who onboarded before this change have a sealed password already.
  Nothing about their account changes.
