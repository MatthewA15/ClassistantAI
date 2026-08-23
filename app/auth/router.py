"""OAuth 2.0 login flow (P0).

Flow (ADR-0002): user hits /auth/login -> Google consent screen ->
/auth/callback exchanges the code, verifies the id_token to get a stable
`sub` (our user_id) + email, stores ONLY the refresh token in Secret
Manager, and returns the user_id the ADK agent should use on every
subsequent call. No passwords, no tokens in our DB.
"""
from fastapi import APIRouter, HTTPException, Request
from google.oauth2 import id_token as gid
from google.auth.transport import requests as grequests
from google_auth_oauthlib.flow import Flow

from app.config import settings
from app.services import secrets

router = APIRouter(prefix="/auth", tags=["auth"])


def _flow(state: str | None = None) -> Flow:
    client_config = {
        "web": {
            "client_id": settings.google_client_id,
            "client_secret": settings.google_client_secret,
            "auth_uri": "https://accounts.google.com/o/oauth2/auth",
            "token_uri": "https://oauth2.googleapis.com/token",
            "redirect_uris": [settings.oauth_redirect_uri],
        }
    }
    return Flow.from_client_config(
        client_config, scopes=settings.scopes, state=state,
        redirect_uri=settings.oauth_redirect_uri,
        autogenerate_code_verifier=False,
    )


@router.get("/login")
def login():
    """Returns the Google consent URL. Frontend (Next.js) redirects the user here."""
    auth_url, state = _flow().authorization_url(
        access_type="offline",   # required to receive a refresh token
        prompt="consent",        # force refresh token even on re-login
        include_granted_scopes="true",
    )
    return {"auth_url": auth_url, "state": state}


@router.get("/callback")
def callback(request: Request, code: str | None = None, error: str | None = None):
    if error:
        raise HTTPException(status_code=400, detail=f"OAuth error: {error}")
    if not code:
        raise HTTPException(status_code=400, detail="Missing authorization code")

    flow = _flow()
    flow.fetch_token(code=code)
    creds = flow.credentials

    # Verify id_token -> stable user identity
    info = gid.verify_oauth2_token(
        creds.id_token, grequests.Request(), settings.google_client_id
    )
    user_id, email = info["sub"], info.get("email")

    if not creds.refresh_token:
        # Can happen if Google skipped consent; prompt="consent" should prevent it.
        raise HTTPException(status_code=500, detail="No refresh token returned; retry login")

    secrets.store_refresh_token(settings.gcp_project_id, user_id, creds.refresh_token)

    # The agent/frontend persists user_id and uses it for all connector calls.
    return {"user_id": user_id, "email": email, "status": "connected"}
