"""App configuration.

(`docs/...` paths in this service are relative to the repo root, three
levels above src/backend/connectors-api/, because the encryption contract
and the ADRs are shared with the frontend rather than owned by this service.)

Design note (see docs/adr/0004 and docs/ENCRYPTION_CONTRACT.md): the
frontend builds the consent URL, runs the OAuth code exchange, and
envelope-encrypts the resulting refresh token itself -- this service never
sees an authorization code and holds no KMS encrypt rights. It only decrypts
the google_refresh_token credential the frontend already wrote to Firestore,
and only ever refreshes it against Google's token endpoint.

google_client_id/secret are still required here despite login having moved
out: the `refresh_token` grant against Google's token endpoint requires
client authentication for a web-application client, same as the
authorization_code grant the frontend runs. Both sides must use the same
OAuth client, or refresh fails with invalid_client (ENCRYPTION_CONTRACT.md
#1's "client secret is a deliberate exception").

Per-user credentials (refresh tokens) live in Firestore, envelope-encrypted
with Cloud KMS by the frontend; this service only performs the decrypt half.
See app/services/firestore_creds.py.
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
    # "user_id" | "none" -- ENCRYPTION_CONTRACT.md #5 settles this as
    # utf8_bytes(uid), which the frontend passes on every KMS encrypt call.
    # Must byte-match what the frontend actually sends or KMS decrypt fails
    # closed -- this default must never silently drift from the contract.
    kms_aad_source: str = "user_id"

    # Requesting all scopes up front (including P2) so users don't have to
    # re-consent when we ship drafts/Drive/Docs later. See ADR-0002.
    #
    # MUST stay byte-identical (same nine scopes, doesn't need to be the same
    # order) to GOOGLE_SCOPES in the frontend's src/frontend/lib/googleOAuth.ts
    # -- the frontend requests consent for its list, and Google validates the
    # granted set matches during its code exchange. When one changes, change
    # both in the same change.
    #
    # Nothing here may delete a student's data. Google's scope catalogue does not
    # offer create-without-delete for calendar events, so events.owned is the
    # floor; every other write scope in this list is incapable of deleting.
    # Narrowing is safe for existing grants -- google-auth only raises on a scope
    # it requested and did not get, so an older broader token still refreshes.
    scopes: list[str] = [
        "openid",
        "https://www.googleapis.com/auth/userinfo.email",
        "https://www.googleapis.com/auth/gmail.readonly",
        "https://www.googleapis.com/auth/gmail.compose",       # P2: drafts only, never send
        # P1: events only. Replaced the full `calendar` scope, which could also
        # delete whole calendars and rewrite their sharing. `events` is the
        # superset and `events.owned` the same powers confined to calendars the
        # student owns, so the second adds no reach; both are listed because the
        # consent URL lists both. Only list and insert are ever called.
        "https://www.googleapis.com/auth/calendar.events",
        "https://www.googleapis.com/auth/calendar.events.owned",
        "https://www.googleapis.com/auth/drive.metadata.readonly",  # P2: list files
        # P2: download/export file content. Added in v0.3 -- existing users
        # must re-run onboarding (frontend consent URL) before
        # /drive/files/{id}/download works.
        "https://www.googleapis.com/auth/drive.readonly",
        # P2: create docs. The Docs API has no delete method, and documents.create
        # makes the file on its own, which is why `drive.file` is no longer here:
        # it was the only scope in this list that could delete a file.
        "https://www.googleapis.com/auth/documents",
    ]

    class Config:
        env_file = ".env"


settings = Settings()
