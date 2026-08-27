"""App configuration.

Design note (see docs/adr/0004): login now happens in the Next.js frontend,
which owns the authorization-code exchange. This service never sees a code,
but the refresh-token grant it performs still requires client authentication
for a web-application client, so google_client_id/secret stay here — they
must be the *frontend's* OAuth client credentials, since refresh tokens are
bound to the client that issued them (they are not "our" client anymore).

Per-user credentials (refresh tokens) live in Firestore, envelope-encrypted
with Cloud KMS (see app/services/firestore_creds.py and docs/adr/0004).
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
    scopes: list[str] = [
        "openid",
        "https://www.googleapis.com/auth/userinfo.email",
        "https://www.googleapis.com/auth/gmail.readonly",
        "https://www.googleapis.com/auth/gmail.compose",       # P2: drafts only, never send
        "https://www.googleapis.com/auth/calendar",             # P1: read + create events
        "https://www.googleapis.com/auth/drive.metadata.readonly",  # P2: list files
        # P2: download/export file content. Added in v0.3 -- existing users must
        # re-run /auth/login to re-consent before /drive/files/{id}/download works.
        "https://www.googleapis.com/auth/drive.readonly",
        "https://www.googleapis.com/auth/documents",            # P2: create docs
        "https://www.googleapis.com/auth/drive.file",           # P2: docs we create
    ]

    class Config:
        env_file = ".env"


settings = Settings()
