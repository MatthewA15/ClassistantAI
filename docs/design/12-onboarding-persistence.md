# 12. Onboarding persistence and the Google login

How a student actually gets from the onboarding wizard to a stored account, and
why the OAuth flow is split the way it is. This supersedes the `TODO(backend)`
markers described in [07 Backend contract](07-backend-contract.md); those server
actions are live now.

## The pieces

| Where | Responsibility |
| --- | --- |
| `lib/firebaseClient.ts` | Phone sign-in and the SMS code. Identity only. See [15](15-firebase-auth.md). |
| `app/api/auth/session/` | Trades a Firebase ID token for the session cookie. |
| `lib/authSession.ts` | Verifies that cookie. Carries the Firebase uid and the number. |
| `data/access.ts` | The switches over what may be touched, and the rule their labels follow. |
| `lib/googleOAuth.ts` | Builds the consent URL. Holds the scope list. |
| `app/onboarding/callback/route.ts` | Takes Google's redirect, hands the code to the connector. |
| `connectors-api` on Cloud Run | Exchanges the code, writes the refresh token to Secret Manager. |
| `app/onboarding/actions.ts` | Validation, and the two Firestore writes. |
| `lib/portalCredentials.ts` | School portal password, in Secret Manager. |

Deployed connector: `https://classistant-connectors-945345983057.us-central1.run.app`,
running as `classistant-connector@classisstant.iam.gserviceaccount.com`.

## Why the frontend builds the auth URL

The connector already has a `GET /auth/login` that returns a ready-made consent
URL, and the obvious wiring is to redirect the student straight at it. We do not
do that, for two reasons.

**`hd` has nowhere to go.** `/auth/login` takes no parameters, so it cannot pin
consent to the school's Workspace domain. Without `hd` a student can connect a
personal gmail, and [05 Schools data](05-schools-data.md) exists precisely
because a Google *school* mailbox is the eligibility rule for this product. The
guard would be silently gone.

**The callback returns JSON.** Google redirects the *browser* to the callback,
so pointing it at the connector dead-ends the student on a page of raw
`{"user_id": ...}` with no route back into the wizard.

Both are fixable in the connector, and both fixes touch endpoints its
`API_CONTRACT.md` marks *frozen for the Aug 22 build* with the ADK agent built
against them. Building the URL on this side needs only the public client id and
avoids the coordination entirely. If the contract ever thaws, moving the entry
point back into the connector is the tidier end state.

## The flow

> Since [15 Firebase Auth](15-firebase-auth.md), a step 0 sits in front of this:
> the student verifies a **mobile number** with Firebase phone auth, which
> establishes identity and mints the session. What follows is the *authorisation*
> leg and it is plain Google OAuth, not Firebase. `connectGoogle` refuses to run
> without a verified session.
>
> One consequence reaches into the collections below: the Google `sub` does not
> exist until step 3, so **nothing is written before it**, and the user document
> is created by `recordGoogleConnection` rather than existing beforehand. It
> carries `auth_uid` and `phone_number` from the session, which is the only
> bridge between the Firebase identity and the `sub` everything else is keyed by.

1. Student picks a school and types their school address. `connectGoogle` checks
   it against the school's domain, mints a `state`, stores
   `{state, schoolId, email}` in a signed httpOnly cookie, and returns the
   consent URL for the client to navigate to.
2. Google returns to `/onboarding/callback`.
3. The route checks `state`, then `GET`s the connector's `/auth/callback?code=`
   server-to-server. The connector exchanges the code and stores the refresh
   token. **The authorization code never reaches the browser, and the refresh
   token never reaches this app.**
4. The route re-checks the returned email against the school domain, writes a
   `users` document, sets a signed session cookie, and redirects into step 2.
5. `completeOnboarding` writes the rest of the profile and the portal
   credentials.

### Two settings that are load-bearing

`access_type=offline` **and** `prompt=consent`. The first asks for a refresh
token at all; the second forces Google to reissue one on a repeat login.
Without the second, a returning student gets no refresh token and the connector
500s with "No refresh token returned".

**No `include_granted_scopes`.** It makes Google return previously granted
scopes as well, so the granted set stops matching the requested set and oauthlib
raises "Scope has changed" during the exchange. The connector also runs with
`OAUTHLIB_RELAX_TOKEN_SCOPE=1` as a second line of defence, because Google
normalises some scope names on its own.

### The scope list is duplicated, deliberately

`GOOGLE_SCOPES` in `lib/googleOAuth.ts` must stay identical to `scopes` in the
connector's `app/config.py`. The connector rebuilds a `Credentials` object from
its own hardcoded list and Google validates the granted set at exchange time, so
a drift here either drops a permission the agent needs or throws outright.
**Change both in the same commit.** A shared source would be better and there is
no good one across a Python service and a Next.js app.

The old frontend list requested `gmail.send`. The connector grants
`gmail.compose`, which writes drafts and cannot send, and that is a product
decision, not an oversight: the agent proposes mail, a human sends it. The
consent copy in `ScopeList` was saying "send email you have approved" and has
been corrected. Consent copy that overstates the grant fails app review and is
untrue to the student besides.

## The two collections

```
users/{google_sub}
  id, name, email, phone_number, school_id, service_email
  auth_uid                             the Firebase uid behind the phone login
  consent: { terms, sms, marketing }   each { granted, at, ip, wording }
  access:  { gmail_read, gmail_drafts, calendar, drive_read, docs }
  created_at, updated_at, google_connected_at, onboarding_complete

credentials/{google_sub}
  user_id, username, secret_name, created_at, updated_at
```

Both keyed by the Google `sub`, which is also what the ADK agent passes to every
connector endpoint. One id end to end, nothing to join.

### `name` is not the student's real name

The connector requests no `profile` scope and returns no name from
`/auth/callback`, so nothing in this system ever learns what the registrar calls
them. `name` is the nickname they chose, falling back to the local part of their
address, and the UI says so rather than pretending. A real name would cost a
`profile` scope on both sides plus a new response field on a frozen endpoint,
for a value nobody currently reads.

### Consent is not a boolean

`acceptTerms: true` is not evidence of anything. What has to be producible later,
for CASL and for Twilio A2P registration, is *what the student was shown at the
moment they agreed*. So each consent stores the granted flag, a server
timestamp, the client IP, and the exact wording, versioned.

`data/consent.ts` is the single source for that wording and the wizard renders
from it. That is the whole point: if the checkbox text and the stored record
came from two places, editing copy would silently re-describe consents already
on file as agreeing to words nobody ever saw.

### `created_at` needs a transaction

`set({created_at: serverTimestamp()}, {merge: true})` looks like it preserves the
original date and does not. Merge overwrites any field it is handed, so every
re-onboard would reset the signup date and destroy the ordering consent evidence
depends on. `setStamped()` in `lib/users.ts` reads first inside a transaction and
stamps `created_at` only on insert.

## Why the portal password is in Secret Manager

This is **reversible encryption, not hashing**. The agent replays the password
into the school's LMS overnight, so a one-way hash is not available to us the way
it would be for a password we authenticate against ourselves.

Given that, the choice was Secret Manager versus envelope encryption under a
Cloud KMS key with the ciphertext in the Firestore document. Secret Manager won:

- It is already how the connector stores per-user refresh tokens (ADR-0002), so
  credentials have one storage model and one audit story rather than two.
- **Every individual read is audit logged.** For a credential an unattended
  agent uses at 3am, that is the only control that can ever demonstrate it was
  touched when it should have been. Firestore logs document reads only if Data
  Access audit logs are enabled, and at coarser granularity.
- No key handling code of our own to get wrong.

The trade is real: one secret per user bills per active version per month, so
cost grows linearly with students, and there is a per-project secret quota to
check before scaling. KMS envelope encryption is flat-cost regardless of user
count and is where this should go if that day arrives. Everything therefore goes
through `storePortalPassword` / `getPortalPassword` and nothing else knows where
the bytes live.

**`credentials` has no `password` field.** The document holds `secret_name`, a
resource pointer that is safe to read, log, and export. The original ER diagram
had a plain `password: string`; that would have contradicted the promise on
[the privacy page](../../src/frontend/app/privacy/page.tsx) that the credential
is encrypted and decrypted only inside an isolated session.

## Cookies

> **Superseded in part by [15 Firebase Auth](15-firebase-auth.md).** The session
> cookie described below is gone: identity is a Firebase Auth session cookie
> now, with revocation and rotation, and the sign-in happens one leg earlier
> than this document describes. The OAuth cookie and everything else here still
> stands.

`classistant_oauth` carries `{state, schoolId}` across the redirect, single use,
10 minute TTL, HMAC signed with `SESSION_SECRET`.

`SameSite=Lax`, not `Strict`. The return from Google is a top-level cross-site
GET; Lax sends cookies on exactly that and Strict does not, which would make the
callback see nothing and fail every login.

Identity in `completeOnboarding` comes from the session cookie, never from the
form. The whole point of the round trip is that the email was proven; reading it
from a hidden input would throw that away and let anyone write a document under
someone else's id.

## Known gaps

- **The connector is `--allow-unauthenticated`.** Anyone with a `user_id` can
  read that student's mail, calendar, and Drive, and a Google `sub` is not a
  secret. Its README lists locking this down as post-Saturday work. This is the
  most serious open item here and it is not a frontend fix.
- ~~**The session cookie is bearer-only.**~~ Closed by
  [15 Firebase Auth](15-firebase-auth.md). Sessions are Firebase Auth session
  cookies now: revocable, rotated, and verified against Google's keys.
- **The OAuth app is unverified**, so only accounts added as test users on the
  consent screen can complete a login.
- **`joinWaitlist` still does not persist.** Out of scope for the two
  collections agreed for this pass.
- **Twilio verification and the first crawl** are still `TODO(backend)` in
  `completeOnboarding`.
