"""App configuration.

Design note (see docs/adr/0002): the OAuth *client* secret lives in an env var
for hackathon speed; per-user *refresh tokens* always live in Secret Manager.
"""
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    gcp_project_id: str
    # Local dev only: impersonate the runtime SA via your ADC (needs
    # roles/iam.serviceAccountTokenCreator on the SA). Leave unset on Cloud Run,
    # where the service runs as this SA directly via --service-account.
    gcp_service_account: str | None = None
    google_client_id: str
    google_client_secret: str
    oauth_redirect_uri: str

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
