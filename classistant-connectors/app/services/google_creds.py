"""Rebuild live Google credentials for a user from their stored refresh token.

The FastAPI layer is stateless: every request fetches the refresh token from
Secret Manager and mints a short-lived access token. Plaintext tokens never
touch a database or log line (ADR-0002).
"""
from fastapi import HTTPException
from google.oauth2.credentials import Credentials
from googleapiclient.discovery import build

from app.config import settings
from app.services import secrets

TOKEN_URI = "https://oauth2.googleapis.com/token"


def creds_for_user(user_id: str) -> Credentials:
    refresh_token = secrets.get_refresh_token(settings.gcp_project_id, user_id)
    if refresh_token is None:
        raise HTTPException(
            status_code=404,
            detail=f"No stored credentials for user {user_id}. Complete /auth/login first.",
        )
    return Credentials(
        token=None,  # forces refresh on first use
        refresh_token=refresh_token,
        token_uri=TOKEN_URI,
        client_id=settings.google_client_id,
        client_secret=settings.google_client_secret,
        scopes=settings.scopes,
    )


def service_for_user(user_id: str, api: str, version: str):
    return build(api, version, credentials=creds_for_user(user_id), cache_discovery=False)
