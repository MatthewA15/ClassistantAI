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

The CALL-E settings below are the second deliberate exception, on the same
reasoning as the client secret: one service-level bearer token for the whole
service, not a per-user credential. It identifies *this integration* to
CALL-E, never a student, so it is configuration rather than something the
encryption contract has anything to say about. See app/services/calle_mcp.py.
"""
from pydantic import Field
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    # Resolved from GOOGLE_CLOUD_PROJECT, the standard env var that ADC
    # (and Cloud Run's runtime) already exposes.
    gcp_project_id: str = Field(
        validation_alias="GOOGLE_CLOUD_PROJECT", default="classisstant")
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

    # CALL-E: the hosted MCP server that places the actual phone call.
    #
    # All three have defaults, unlike the KMS fields above, and that is the
    # point: a missing CALL-E token must degrade to a 503 on the call
    # endpoints alone. It must never fail Settings() at startup, because
    # that would take Gmail, Calendar, Drive and Docs down with it over a
    # feature they don't use. app/services/calle_mcp.py raises
    # CalleNotConfigured at call time instead.
    #
    # The token is service configuration, not a per-user credential: it is
    # never written to Firestore, never wrapped by KMS, and has no
    # encrypted form. It comes from a brokered browser login and it
    # EXPIRES -- mint or rotate it with `python scripts/calle_login.py`.
    calle_base_url: str = "https://seleven-mcp-sg.airudder.com"
    calle_channel: str = "openagent_oauth"
    calle_access_token: str | None = None

    class Config:
        env_file = ".env"


settings = Settings()
