"""Agent tools for Classy."""

import logging
import os
from datetime import datetime
from zoneinfo import ZoneInfo
import httpx
from google.adk.tools import ToolContext
from google.adk.memory.memory_entry import MemoryEntry
from google.genai.types import Content, Part
from pydantic import BaseModel
from typing import Literal

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


async def search_memories(query: str, tool_context: ToolContext):
    """Query this tool when you need to fetch information about user preferences."""
    try:
        return await tool_context.search_memory(query)
    except ValueError as e:
        return _error_response(
            code="memory_service_not_available",
            message=str(e),
            retryable=False
        )


class Fact(BaseModel):
    fact: str
    # Helps the agent categorize its thoughts
    fact_type: Literal["user_preference", "reminder", "agent_learning"]


async def save_to_memory(important_facts: list[Fact],
                         tool_context: ToolContext) -> dict:
    try:
        await tool_context.add_memory(
            memories=[
                MemoryEntry(
                    content=Content(
                        role="model",
                        parts=[Part.from_text(text=fact.fact)]
                    ),
                    custom_metadata={"fact_type": fact.fact_type},
                    timestamp=datetime.now().isoformat()
                )
                for fact in important_facts
            ],
            custom_metadata={
                "enable_consolidation": True
            })

        return {"ok": True,
                "message": f"Successfully added {len(important_facts)} facts to long-term memory."}
    except ValueError as e:
        return _error_response(
            code="memory_service_not_available",
            message=str(e),
            retryable=False
        )


def send_text(messages: list[str], tool_context: ToolContext) -> dict:
    """Send one or more SMS text messages to the student.

    Use this tool to text the student back. You can pass multiple messages
    in a single call; they will be delivered in order, one after another.

    Args:
        messages: A list of short text messages to send. Must contain at
            least one message. Each message should be concise and easy to
            read on a phone.
    """

    if os.environ.get("DEBUG", "false") != "false":
        return _error_response(
            "debug_mode",
            "We're in debug mode. Don't use this function. Just respond normally",
            retryable=False
        )

    if not _TWILIO_SEND_URL:
        logger.error("send_text: TWILIO_SEND_URL is not set.")
        return _error_response(
            "not_configured",
            "The SMS messaging service URL is not configured. "
            "This is an internal error — do not retry; tell the student "
            "something went wrong on our end.",
            retryable=False,
        )

    user_id = tool_context.user_id
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


def to_timezone(
    datetime_str: str,
    target_timezone: str,
    source_timezone: str = "UTC",
) -> dict:
    """Convert a datetime string from one timezone to another.

    Use this tool when you need to translate a wall-clock time the agent
    computed (e.g. an assignment due date or a reminder) into the student's
    local timezone so the text you send reads naturally to them.

    Args:
        datetime_str: A datetime in ``"YYYY-mm-dd HH:MM"`` (24-hour) format,
            e.g. ``"2026-08-29 14:30"``. It is interpreted as being in
            ``source_timezone``.
        target_timezone: An IANA timezone name to convert *to*, e.g.
            ``"America/New_York"`` or ``"Africa/Lagos"``.
        source_timezone: An IANA timezone name that ``datetime_str`` is
            currently expressed in. Defaults to ``"UTC"``.

    Returns:
        On success, ``{"ok": True, "datetime": "...", "timezone": "..."}``
        where ``datetime`` is the converted time in ``"YYYY-mm-dd HH:MM"``
        format and ``timezone`` is the resolved target timezone name. On
        failure, ``{"ok": False, "error": {...}}``.
    """
    try:
        naive = datetime.strptime(datetime_str, "%Y-%m-%d %H:%M")
    except ValueError as exc:
        return _error_response(
            "bad_datetime_format",
            f"datetime_str must be in 'YYYY-mm-dd HH:MM' format, "
            f"got {datetime_str!r}: {exc}",
            retryable=True,
        )

    try:
        source_tz = ZoneInfo(source_timezone)
        localized = naive.replace(tzinfo=source_tz)
    except (KeyError, ValueError) as exc:
        return _error_response(
            "bad_timezone",
            f"source_timezone {source_timezone!r} is not a valid IANA "
            f"timezone: {exc}",
            retryable=True,
        )

    try:
        target_tz = ZoneInfo(target_timezone)
    except (KeyError, ValueError) as exc:
        return _error_response(
            "bad_timezone",
            f"target_timezone {target_timezone!r} is not a valid IANA "
            f"timezone: {exc}",
            retryable=True,
        )

    converted = localized.astimezone(target_tz)

    return {
        "ok": True,
        "datetime": converted.strftime("%Y-%m-%d %H:%M"),
        "timezone": str(converted.tzinfo),
    }
