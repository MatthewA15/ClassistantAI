"""Utility helpers for the classistant agent package."""

import logging
from pathlib import Path

from google.auth import default as _google_auth_default
from google.auth.credentials import TokenState
from google.oauth2.id_token import fetch_id_token
from google.auth.transport.requests import Request as _GoogleAuthRequest

logger = logging.getLogger(__name__)


def load_prompt(filename: str = "prompt.md") -> str:
    """Load a prompt markdown file from this package directory as a string.

    Args:
        filename: Name of the markdown file located alongside the agent
            module (e.g. ``prompt.md``).

    Returns:
        The file contents as a (stripped) string.

    Raises:
        FileNotFoundError: If the requested file does not exist.
    """
    file_path = Path(__file__).resolve().parent / filename
    return file_path.read_text(encoding="utf-8").strip()


def get_id_token(target_audience: str) -> str | None:
    """Fetch a Google-signed OpenID Connect ID token for service-to-service
    authentication on Cloud Run.

    Args:
        target_audience (str): URL of the GCP service being invoked

    Returns:
        A Google-signed ID token (a JWT) as a string.

    See Also:
        https://docs.cloud.google.com/run/docs/authenticating/service-to-service
    """
    auth_req = _GoogleAuthRequest()
    id_token = fetch_id_token(auth_req, target_audience)

    return id_token
