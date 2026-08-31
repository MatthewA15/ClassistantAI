"""Placeholder-based credential injection for browser tools.

The LLM never sees (and never receives) the student's portal credentials.
Instead the prompt tells it to write the literal placeholders ``<%USERNAME%>``
and ``<%PASSWORD%>`` wherever the real values belong (login form fields,
etc.). This module bridges the gap at the tool boundary:
"""

import logging
from typing import Any
from google.adk.tools import ToolContext
from google.adk.tools.base_tool import BaseTool

from . import credentials

logger = logging.getLogger(__name__)

_PLACEHOLDER_TO_KEY = {
    "<%USERNAME%>": "username",
    "<%PASSWORD%>": "password",
}


def _substitute_in_obj(obj: Any, replacements: dict[str, str]) -> Any:
    """Recursively replace placeholder strings in dicts/lists/strings.

    ``replacements`` maps placeholder -> real value. Values that aren't
    str/dict/list are returned untouched.
    """

    if isinstance(obj, str):
        out = obj
        for placeholder, real in replacements.items():
            out = out.replace(placeholder, real)
        return out
    if isinstance(obj, dict):
        # Only values are substituted.
        return {
            key: _substitute_in_obj(value, replacements)
            for key, value in obj.items()
        }
    if isinstance(obj, (list, tuple)):
        return type(obj)(
            _substitute_in_obj(item, replacements) for item in obj
        )
    return obj


def _fetch_replacements(
    user_id: str | None,
    placeholders_found: set[str]
) -> dict[str, str]:
    """Decrypt and map only the placeholders that actually appear in args."""

    if not user_id or not placeholders_found:
        return {}
    try:
        creds = credentials.get_portal_credentials(user_id)
    except credentials.CredentialNotFound as exc:
        logger.info("credentials missing while injecting: %s", exc)
        raise
    except credentials.CredentialFormatError as exc:
        logger.error("credential format error while injecting: %s", exc)
        raise

    replacements: dict[str, str] = {}
    for placeholder, cred_key in _PLACEHOLDER_TO_KEY.items():
        if placeholder in placeholders_found:
            if value := creds.get(cred_key):
                replacements[placeholder] = value
    return replacements


async def inject_credentials(
    tool: BaseTool, args: dict[str, Any], tool_context: ToolContext
) -> dict[str, Any] | None:
    """``before_tool_callback`` — swap placeholders for real values in args.

    Scans the LLM-filled args for ``<%USERNAME%>`` / ``<%PASSWORD%>``. If
    any are present, decrypts the student's saved portal credentials and
    substitutes them in place.

    If no placeholders appear (plain browsing), this is a cheap no-op.
    """

    placeholders_in_args = _find_placeholders(args)

    placeholders_found = {
        placeholder
        for placeholder in _PLACEHOLDER_TO_KEY
        if placeholder in placeholders_in_args
    }

    if not (replacements := _fetch_replacements(
        tool_context.user_id, placeholders_found)
    ):
        return None

    # _substitute_in_obj is pure (returns a new object), so splice the
    # substituted values back into the caller's args dict in place.
    patched = _substitute_in_obj(args, replacements)
    args.clear()
    args.update(patched)
    logger.debug(
        "injected %d placeholder(s) for tool %s (user %s)",
        len(replacements),
        tool.name,
        tool_context.user_id,
    )

    # Signal the after-tool scrubber which real values to scrub, without
    # keeping them in global state: stash on the tool context state under a
    # namespaced key; scrub_credentials reads and empties it.
    tool_context.state["browser_creed_scrub"] = replacements
    return None


def _find_placeholders(obj: Any) -> set[str]:
    """Collect the set of placeholders present in a nested structure."""
    found: set[str] = set()
    if isinstance(obj, str):
        for placeholder in _PLACEHOLDER_TO_KEY:
            if placeholder in obj:
                found.add(placeholder)
    elif isinstance(obj, dict):
        for value in obj.values():
            found |= _find_placeholders(value)
    elif isinstance(obj, (list, tuple)):
        for item in obj:
            found |= _find_placeholders(item)
    return found


async def scrub_credentials(
    tool: BaseTool,
    args: dict[str, Any],
    tool_context: ToolContext,
    tool_response: dict[str, Any],
) -> dict[str, Any] | None:
    """``after_tool_callback`` — scrub leaked credentials from the result.

    Replaces any occurrence of the real username/password in the tool result
    with the placeholders. If no credentials were injected for this call
    (or the fetch previously failed), this is a no-op returning the result
    unchanged (returning None also means "unchanged" to ADK).
    """
    replacements: dict[str, str] = tool_context.state.get(
        "browser_creed_scrub"
    ) or {}
    if replacements:
        # Reverse direction: real value -> placeholder.
        reverse = {
            real: placeholder
            for placeholder, real in replacements.items()
        }

        if isinstance(tool_response, dict):
            scrubbed = _substitute_in_obj(tool_response, reverse)
            tool_response.clear()
            tool_response.update(scrubbed)

        tool_context.state["browser_creed_scrub"] = {}
    return None
