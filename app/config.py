"""App configuration.

Design note (see docs/adr/0004): the frontend builds the consent URL and
owns login for the *student*, but it deliberately never holds the OAuth
client secret -- this service does, and is the only thing that can exchange
an authorization code (app/auth/router.py `/auth/callback`) or refresh a
token later. google_client_id/secret must be the frontend's OAuth web-app
client, since both the code exchange and the later refresh-token grant have
to hit Google as the same client that started the flow.

Per-user credentials (refresh tokens) live in Firestore, envelope-encrypted
with Cloud KMS -- this service now performs both the encrypt (at
`/auth/callback`) and the decrypt (per API request) halves. See
app/services/firestore_creds.py and docs/adr/0004.
"""
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    gcp_project_id: str
    # TODO(matthew): confirm with Richard this is his live OAuth web-app
    # client (the one users actually log in through) -- see docs/MIGRATION.md
    # item 1. A stale/public-only client_id here fails token refresh with
    # invalid_client.
    google_client_id: str
    google_client_secret: str
    # Must byte-match the redirect_uri Google issued the code against -- i.e.
    # the frontend's callback route, NOT this service's own URL (the
    # frontend hands the code to this service server-to-server; the browser
    # never lands here). See src/frontend/lib/googleOAuth.ts:redirectUri().
    # Local dev: http://localhost:3000/onboarding/callback.
    oauth_redirect_uri: str

    # TODO(matthew): confirm region with Obalua -- keyring/key location for
    # classistant-keyring/classistant-key isn't known yet. No default on
    # purpose: a missing value should fail Settings() at startup rather than
    # silently hit the wrong region.
    kms_location: str
    kms_keyring: str = "classistant-keyring"
    # TODO(matthew): confirm with Obalua that "classistant-key" is the
    # refresh-token-only key post credential-type split (docs/MIGRATION.md
    # item 3) -- this service must never gain decrypt rights on the
    # school_password key.
    kms_key: str = "classistant-key"
    # TODO(matthew): confirm with Chim whether the frontend passes AAD on the
    # KMS encrypt call, and which value. "none" is safe until confirmed --
    # flipping this incorrectly makes KMS fail closed on every decrypt.
    kms_aad_source: str = "none"

    # Requesting all scopes up front (including P2) so users don't have to
    # re-consent when we ship drafts/Drive/Docs later. See ADR-0002.
    #
    # MUST stay byte-identical (same nine scopes, doesn't need to be the same
    # order) to GOOGLE_SCOPES in the frontend's src/frontend/lib/googleOAuth.ts
    # -- the frontend requests consent for its list, this service rebuilds a
    # Credentials object against its own hardcoded copy during the code
    # exchange, and Google validates the granted set matches during that
    # exchange. When one changes, change both in the same change.
    scopes: list[str] = [
        "openid",
        "https://www.googleapis.com/auth/userinfo.email",
        "https://www.googleapis.com/auth/gmail.readonly",
        "https://www.googleapis.com/auth/gmail.compose",       # P2: drafts only, never send
        "https://www.googleapis.com/auth/calendar",             # P1: read + create events
        "https://www.googleapis.com/auth/drive.metadata.readonly",  # P2: list files
        # P2: download/export file content. Added in v0.3 -- existing users
        # must re-run onboarding (frontend consent URL) before
        # /drive/files/{id}/download works.
        "https://www.googleapis.com/auth/drive.readonly",
        "https://www.googleapis.com/auth/documents",            # P2: create docs
        "https://www.googleapis.com/auth/drive.file",           # P2: docs we create
    ]

    class Config:
        env_file = ".env"


settings = Settings()
