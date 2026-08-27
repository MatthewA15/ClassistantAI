# 19. The portal password, sealed

The school portal password was never being written where the rest of the system
expected to find it. Onboarding put it in Secret Manager and left a pointer in a
top-level `credentials/{uid}` document, while the Google refresh token was going
into `users/{uid}/credentials/google_refresh_token` as an envelope-encrypted
blob. Two credentials, two stores, two audit stories.

`docs/ENCRYPTION_CONTRACT.md` §8 already settled this on paper: the Secret
Manager path is retired and the password follows the same envelope as the
refresh token, under its own key. The code had the key mapping in it and no
caller. This is the caller.

```
users/{uid}/credentials/school_password
  user_id, credential_type, encrypted_credential, encrypted_dkey, iv,
  created_at, updated_at
```

`encrypted_credential` is AES-256-GCM with the tag appended, `encrypted_dkey` is
that message's data key wrapped by `classistant-password-key` in
`classistant-keyring`, with the uid as additional authenticated data. Byte for
byte the same scheme as the refresh token, and the same code path
(`lib/credentials.ts`); the only thing that differs is which key does the wrap.

## Doc 12 chose Secret Manager, and it was right at the time

[12](12-onboarding-persistence.md) weighed Secret Manager against envelope
encryption and picked Secret Manager for three reasons. Two of them stopped
being true, and it is worth being precise about which:

**"It is already how the connector stores per-user refresh tokens, so
credentials have one storage model rather than two."** This was the strongest
argument and it inverted completely. Issue #12 moved refresh tokens out of
Secret Manager and into the Firestore envelope. Keeping the password behind
Secret Manager is now the thing that creates two storage models, not the thing
that avoids them.

**"No key handling code of our own to get wrong."** Also gone, and not by
choice: `lib/envelope.ts` and `lib/credentials.ts` exist and are load bearing
for the refresh token. The code is written, reviewed, and cross-checked against
the connector's Python. Declining to use it for the password buys nothing.

**"Every individual read is audit logged."** This one still stands, and it is a
real loss. Secret Manager logs every `AccessSecretVersion` by default; Firestore
logs document reads only with Data Access audit logs enabled, at coarser
granularity. What replaces it is a KMS log rather than a Firestore one: reading
a password requires a `Decrypt` call on `classistant-password-key`, and KMS
records those. That is arguably the better record anyway, because it is the
step that cannot be skipped -- a reader with the ciphertext still has nothing.

## What the envelope buys that Secret Manager did not

The reason to be pleased about this rather than merely consistent:

**The blast radius is a key, not a role.** A Secret Manager secret is readable
by anything holding `secretAccessor` broadly enough to match its name, which is
why doc 07 had to record a *conditioned* IAM binding on the connector to keep it
out of `session-secret`. A sealed password is readable only by a principal with
`cryptoKeyDecrypter` on one specific key, and the connector has no grant on that
key at all. The separation is a KMS binding rather than a name prefix in an IAM
condition.

**It is bound to one student.** The KMS wrap passes the uid as AAD, so an
attacker who can write Firestore cannot move student A's `encrypted_dkey` into
student B's document -- KMS fails closed. Secret Manager had no equivalent; the
binding was the secret's name, and names are guessable.

**Cost stops scaling with students.** One secret per student bills per active
version per month and there is a per-project quota. Doc 12 flagged this as the
trade and said envelope encryption "is where this should go if that day
arrives". The day arrived for a different reason.

## Where the username went

`users/{uid}.school_username`, not the credential document.

It is not a credential. It is an identifier the school hands out, frequently the
student number, and it belongs beside `school_id` and `email` where anything
holding `datastore.viewer` can read it without being able to open anything.
Putting it in the credential document would also add a field that
ENCRYPTION_CONTRACT.md §3 does not list, and the connector checks that
document's shape from the other side.

This is one of the contract's open items ("where `school_username` lives"), so
it is a decision made here rather than one being followed. The cost if it goes
the other way is a field move.

## Order of writes, and which half survives a failure

The credential is sealed and written first, then the username. It is the same
reasoning the Secret Manager version used with the destinations swapped: a
sealed password nobody points at is invisible, harmless, and overwritten on the
next attempt, whereas a user document announcing a portal login whose password
was never stored is a fault the agent discovers at 3am with nothing naming the
cause.

`storeCredential` encrypts before it writes (contract §6), so a KMS failure gets
that far and persists nothing at all.

## There is no read path, and there cannot be one

`lib/portalCredentials.ts` used to export `getPortalPassword`. It does not any
more, and this is not tidying: this application holds `cryptoKeyEncrypter` on
`classistant-password-key` and nothing else, so a read path here is a function
the process has no permission to implement. Same shape as the missing
`unwrapDataKey` in `lib/credentials.ts`. The frontend can lock a password away
and cannot open it again.

**Nothing can open it yet.** As of this change the key's IAM holds exactly one
binding, `cryptoKeyEncrypter` for `firebase-app-hosting-compute@`. There is no
`cryptoKeyDecrypter` on it at all, which is correct for today -- the connector
must never have one (contract §1) and the agent does not exist. It is also the
first thing that will need granting when the agent does, and the failure until
then is a `PermissionDenied` from KMS rather than anything that looks like a
credential problem.

## What is now stale, and what to do about it

Nothing here deletes anything, deliberately. Two kinds of leftovers exist:

- **Secret Manager secrets** named `user-{uid}-portal-password`, one per student
  who onboarded before this change. They still bill and are still readable.
  Destroy them once the students in question have re-onboarded, not before.
- **Top-level `credentials/{uid}` documents** holding `username` and
  `secret_name`. Harmless, unread by anything, and worth deleting in the same
  pass so the collection does not survive as a thing future readers have to work
  out the status of.

A student who re-onboards writes the new document and does not clean up the old
pair, because a write path that deletes things is a write path that can delete
the wrong thing.

## Verifying it

`npm run verify:credentials`, against a running Firestore emulator. It calls the
real `savePortalCredentials`, reads the document back, and checks the field set
against §3, the IV length and tag placement against §4, and the absence of the
plaintext in any encoding.

It uses the **real** KMS, because there is no emulator for it. That is the point
of the script rather than a limitation of it: the AES layer is already covered
by `lib/envelope.test.ts` against the connector's own Python, and what this adds
is proof that the principal can reach the *second* key. That grant is separate
from the refresh-token key's, was added later, and its absence looks like a
perfectly working application right up until a student submits step two.

The one thing it cannot check is a round trip, since nothing here may decrypt.
`lib/credentials.test.ts` covers the gap where it matters most: wrapping a
password under `classistant-key` by mistake would succeed, write a document that
passes every other check, and be wrong in exactly one way -- the connector could
read it.
