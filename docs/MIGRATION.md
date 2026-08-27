# Connector migration — Secret Manager → Firestore + KMS (issue #12)

Branch suggestion: `matthew/firestore-creds`. Conventional commit:
`feat(creds): replace secret manager with firestore + kms envelope decryption`

## 1. Delete

- `app/routers/oauth.py` (the `/login` + `/callback` router) — login now lives
  entirely in Richard's Next.js callback.
- `app/services/secrets.py` (all Secret Manager code).
- In `app/main.py`: remove the oauth router import + `include_router` line.
- In `app/config.py`: remove any Secret Manager settings.

Grep before committing — nothing should reference `secretmanager`, `secrets.`,
or `store_refresh_token` afterwards:

    grep -rn "secret" app/

## 2. Add

- `app/services/firestore_creds.py` (new, provided).
- `app/services/google_creds.py` (replace existing — same public signature,
  so no router changes).

## 3. Config / env vars

| Var | Value | Status |
|---|---|---|
| `GCP_PROJECT_ID` | `classisstant` (double-s) | unchanged |
| `KMS_LOCATION` | ⚠️ ask Obalua — likely `global` or `northamerica-northeast2` | **open** |
| `KMS_KEYRING` | `classistant-keyring` | from issue |
| `KMS_KEY` | `classistant-key` | confirm this is the refresh-token key post-split |
| `KMS_AAD_SOURCE` | `none` for now (`iv` / `user_id` if Chim adds AAD) | **open** |
| `GOOGLE_CLIENT_ID` | **Richard's** client ID (from Google Chat) | replace yours |
| `GOOGLE_CLIENT_SECRET` | **Richard's** client secret | ⚠️ see red flag below |

Add to `app/config.py` settings: `kms_location`, `kms_keyring`, `kms_key`,
`kms_aad_source` (default `"none"`).

## 4. Dependencies

Remove: `google-cloud-secret-manager`
Add:    `google-cloud-firestore`, `google-cloud-kms`, `cryptography`

    pip uninstall google-cloud-secret-manager
    pip install google-cloud-firestore google-cloud-kms cryptography
    pip freeze > requirements.txt   # or edit requirements.txt directly

## 5. API contract

Bump `API_CONTRACT.md` to v0.4:
- `/login` and `/callback` removed (breaking).
- All other endpoints unchanged.
- New error semantics: 404 when a user has no stored Google credential
  (map `CredentialNotFound`), 500 with a clear message on format mismatch
  (map `CredentialFormatError`). Suggested handler in `main.py`:

    from app.services.firestore_creds import CredentialNotFound, CredentialFormatError

    @app.exception_handler(CredentialNotFound)
    async def _cred_404(request, exc):
        return JSONResponse(status_code=404, content={"detail": str(exc)})

    @app.exception_handler(CredentialFormatError)
    async def _cred_500(request, exc):
        return JSONResponse(status_code=500, content={"detail": str(exc)})

## 6. ADR

New ADR (0006 or next number): "Credential storage moves from Secret Manager
to Firestore + KMS envelope encryption; OAuth login moves to frontend."
Cover: per-key Secret Manager cost, separate KMS keys per credential type
(least privilege — connector SA decrypts refresh tokens only), plaintext
password never enters model context (MCP wrapper / harness on Obalua's side).
ADR-0004 (PKCE rationale) is now moot — note it as superseded.

## 7. Open items (blockers marked ⚠️)

1. ⚠️ **Client secret validity.** On the call Richard said "I don't think you
   need that secret" and couldn't find it — that's wrong for our case: the
   refresh-token grant against Google's token endpoint requires client_id
   **and** client_secret for a web-application client. If what he sent was
   only the public client ID, token refresh will fail with
   `invalid_client`. Confirm you have the actual secret from his OAuth
   client (Console → APIs & Services → Credentials → his client → secret).
   Also: it was pasted in Google Chat — fine for a hackathon, but worth
   deleting the message once it's in your .env, and it must be the same
   client users log in through or their refresh tokens won't work with it.
2. ⚠️ **KMS location** — needed for the key resource path. One-line ask.
3. **Key post-split** — confirm `classistant-key` is now the refresh-token-only
   key and your SA has `roles/cloudkms.cryptoKeyDecrypter` on it (Obalua was
   doing this live on the Aug 25 call; verify it stuck).
4. **AAD** — Chim hasn't said whether she passes AAD on the KMS encrypt.
   Default is off; flip `KMS_AAD_SOURCE` when she confirms.
5. **Byte-format sync with Chim** — the #1 realistic failure mode. Her
   encrypt and this decrypt must agree on: dkey encoding inside the KMS
   plaintext (base64 text vs raw bytes), iv base64 encoding, and GCM tag
   appended to ciphertext (WebCrypto default). The module fails loudly with
   a specific message on each mismatch, so a single end-to-end test with
   one real onboarded user will pinpoint any drift immediately.

## 8. Test plan (once login works, per "by tomorrow")

1. Onboard one real user through Richard's flow (your Ontario Tech Google
   account) so a real `user_credentials` doc exists.
2. Grab your Firebase UID from the `users` doc.
3. `GET /users/{uid}/emails?max_results=1` locally — this exercises the
   entire chain: Firestore query → KMS decrypt → AES-GCM → token exchange
   → Gmail API.
4. Call it twice; second call should be noticeably faster (cache hit).
5. Then deploy to Cloud Run and hand Obalua the URL.
