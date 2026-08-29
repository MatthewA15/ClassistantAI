"""Agent tools for Classy."""

import logging
import os

import httpx
from google.adk.tools import ToolContext

from .util import get_id_token

logger = logging.getLogger(__name__)

_TWILIO_SEND_URL = os.environ.get("TWILIO_SEND_URL")
_REQUEST_TIMEOUT_S = 30


def _error_response(
    code: str,
    message: str,
    *,
    retryable: bool = False,
    **extra,
) -> dict:
    """Build a structured error dict the agent can reason about.

    Args:
        code: A short, stable error code (e.g. ``"not_configured"``,
            ``"auth_failed"``, ``"upstream_error"``).
        message: A human-readable description of what went wrong and, when
            useful, what the agent should do next.
        retryable: Whether the agent may reasonably retry the call.
        **extra: Any additional fields to include in the response.

    Returns:
        A dict of shape ``{"ok": False, "error": {...}}``.
    """
    error = {"code": code, "message": message, "retryable": retryable}
    error.update(extra)
    return {"ok": False, "error": error}


def send_text(messages: list[str], tool_context: ToolContext) -> dict:
    """Send one or more SMS text messages to the student.

    Use this tool to text the student back. You can pass multiple messages
    in a single call; they will be delivered in order, one after another.

    Args:
        messages: A list of short text messages to send. Must contain at
            least one message. Each message should be concise and easy to
            read on a phone.
    """
    if not _TWILIO_SEND_URL:
        logger.error("send_text: TWILIO_SEND_URL is not set.")
        return _error_response(
            "not_configured",
            "The SMS messaging service URL is not configured. "
            "This is an internal error — do not retry; tell the student "
            "something went wrong on our end.",
            retryable=False,
        )

    # Use debug user id in dev
    user_id = os.environ.get("TEST_USER_ID", tool_context.user_id)
    payload = {"user_id": user_id, "messages": messages}

    # Acquire a Google-signed ID token for service-to-service auth on Cloud
    # Run. The target audience is the URL of the receiving service.
    try:
        id_token = get_id_token(_TWILIO_SEND_URL)
        if id_token is None:
            raise Exception("No ID Token returned")
    except Exception as exc:
        logger.error("send_text: failed to get ID token: %s", exc)
        return _error_response(
            "auth_failed",
            "Could not obtain credentials to authenticate with the "
            "messaging service. This is likely a transient infrastructure "
            "issue — you may try again in a moment.",
            retryable=True,
            detail=str(exc),
        )

    try:
        resp = httpx.post(
            _TWILIO_SEND_URL,
            json=payload,
            headers={"Authorization": f"Bearer {id_token}"},
            timeout=_REQUEST_TIMEOUT_S,
        )
    except httpx.RequestError as exc:
        logger.error("send_text: request failed: %s", exc)
        return _error_response(
            "network_error",
            "Could not reach the messaging service. The service may be "
            "temporarily unavailable — you may try again shortly.",
            retryable=True,
            detail=str(exc),
        )

    if resp.is_success:
        data = resp.json()
        logger.info(
            "send_text: sent %d message(s) to user %s",
            len(data.get("results") or messages),
            user_id,
        )
        return data

    # Non-2xx response from the messaging service.
    body = resp.text
    logger.error(
        "send_text: upstream returned %s: %s", resp.status_code, body
    )

    # 5xx errors: the upstream produced a server error. Wrap it so the
    # agent knows it may retry. For < 500, the upstream's own response
    # (e.g. {"error": "..."}) is already descriptive enough to return as-is.
    if 500 <= resp.status_code < 600:
        try:
            upstream = resp.json()
        except Exception:
            upstream = body
        return _error_response(
            "upstream_error",
            "The messaging service returned a server error. It may be "
            "temporary — you may try again shortly.",
            retryable=True,
            status_code=resp.status_code,
            upstream=upstream,
        )

    # 4xx: forward the upstream response directly.
    try:
        return resp.json()
    except Exception:
        return _error_response(
            "upstream_error",
            "The messaging service rejected the request.",
            retryable=False,
            status_code=resp.status_code,
            body=body,
        )
