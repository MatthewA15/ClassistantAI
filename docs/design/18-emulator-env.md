# 18. Running the emulator without Secret Manager

`firebase emulators:start` used to die on startup with a 403 from Secret
Manager. Nothing in the app was asking for a secret. The emulator was, and it
asks before the dev server ever runs.

## Why the emulator reads Secret Manager at all

The App Hosting emulator builds the dev server's entire environment from
`apphosting.yaml` first, then spawns `npm run dev` with it. Resolving an entry
is one line in `firebase-tools`:

```js
value.value ? value.value : await loadSecret(projectId, value.secret)
```

So every `secret:` entry with no `value:` is a live Secret Manager call, made
with whoever is logged into the CLI. `apphosting.yaml` has two of them,
`SESSION_SECRET` and `GOOGLE_CLIENT_SECRET`. The resolution happens before
startup and a failure aborts the whole run, which is why the emulator printed
`Shutting down emulators` one line after it printed `starting app`.

The comment in `apphosting.yaml` explaining that
`firebase-app-hosting-compute@` reads these is about the deployed service, and
it sent us looking in the wrong place. Locally the identity is your own account.

## Project Editor is not enough

The obvious guess is that a project Editor can read a project's secrets. It
cannot. Editor covers `secretmanager.secrets.list`, so `gcloud secrets list`
succeeds and the secret is visibly there, but it excludes
`secretmanager.versions.access`, so reading the payload fails. That combination
produces the misleading part of the error, `(or it may not exist)`, on a secret
that does exist.

Neither secret carries a per-secret IAM binding, so nothing narrows the gap.
Reading production values needs `roles/secretmanager.secretAccessor` granted
explicitly, and that is worth asking for only if you actually need production
values. For local work you do not.

## Three config files, and only one of them can do this

The CLI reads up to three files out of the backend root and merges them in
order. The third argument to `merge` is what separates them:

| File | Merged with | Can replace a `secret:` with a value |
| --- | --- | --- |
| `apphosting.yaml` | base | n/a |
| `apphosting.emulator.yaml` | `allowSecretsToBecomePlaintext: false` | **no** |
| `apphosting.local.yaml` | `allowSecretsToBecomePlaintext: true` | yes |

`apphosting.emulator.yaml` is the file the CLI names in its own prompts and the
one you would reach for, and it is the wrong one. Give it a plaintext value for
a variable the base file declares as a secret and the merge throws:

```
Cannot convert secret to plaintext in apphosting.emulator.yaml
```

It can only override values that were already plaintext. `apphosting.local.yaml`
is the one with the exemption, so that is the file we keep. Both are read by the
emulator, so nothing is lost by using it.

## What is in it, and why the third entry matters

Only three variables differ locally. The two secrets are obvious. The third is
the one that would have bitten next:

| Variable | Reason |
| --- | --- |
| `SESSION_SECRET` | secret in the base file, 403 without it |
| `GOOGLE_CLIENT_SECRET` | secret in the base file, 403 without it |
| `NEXT_PUBLIC_APP_URL` | base file points at the deployed origin |

The consent URL is built as `${NEXT_PUBLIC_APP_URL}/onboarding/callback`. Under
the emulator the production value is injected into the dev server, so a local
sign-in would have walked through consent and come back to the deployed site.
The other six variables in `apphosting.yaml` are byte-identical to `.env.local`
and are left to be inherited.

## The rule that makes this fragile

The emulator spawns the dev server with `{ ...process.env, ...injected }`, and
`@next/env` never overwrites a variable that is already set. So for any variable
in `apphosting.local.yaml`, that file wins and `.env.local` is ignored for the
whole run, even though Next still prints `Environments: .env.local` at startup.

The two files therefore have to be kept in step by hand, and drift is silent:
the app boots fine and runs on stale values. That is the same hand-synced-config
hazard as `GOOGLE_SCOPES` and `config.py` in doc 17, and it has the same
mitigation, which is to keep the overridden set as small as possible. Three
entries, not nine. A variable that matches the base file does not belong here.

`apphosting.local.yaml` is gitignored and listed in `firebase.json`'s `ignore`.
It holds a plaintext copy of the OAuth client secret, and a copy that reached a
build would override the real secrets with local ones.

## The alternative, for the record

`npm run dev` never had this problem: it reads `.env.local` directly and skips
the config merge entirely. `firebase.json` configures no other emulator, so the
emulator's only real value here is running the app under the same env-injection
path production uses, which is exactly the path that broke. That is worth
having, and it is why this was fixed rather than routed around.
