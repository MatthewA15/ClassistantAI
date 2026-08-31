"""Per-user browser toolset backed by the obscura MCP server.

Obscura runs as an MCP server over stdio. It keeps per-user browser state
(cookies, sessions, storage) on disk under ``--storage-dir``, so each student
needs their own obscura server process pointed at their own directory.

Why not one plain ``McpToolset`` on ``Agent.tools``: a toolset owns one
connection, and for stdio connections ADK pools exactly one session.
One toolset == one obscura process == shared cookies across all students.
Not acceptable here.

This module defines ``PerUserBrowserToolset``, a ``BaseToolset`` that
fans out: ADK calls ``get_tools(readonly_context)`` at request assembly
(``LlmAgent.canonical_tools`` → ``get_tools_with_prefix``), the context
carries the invoking ``user_id``, and we delegate to that student's own
``McpToolset`` — reusing ADK's full ``MCPTool`` machinery (declarations,
sessions, retries) verbatim. The toolset holds no tools of its own; it is
only the dispatch point.
"""

import atexit
import asyncio
import logging
import os
from pathlib import Path
from typing import Optional
from google.adk.agents.readonly_context import ReadonlyContext
from google.adk.tools.base_tool import BaseTool
from google.adk.tools.base_toolset import BaseToolset
from google.adk.tools.mcp_tool.mcp_session_manager import StdioConnectionParams
from google.adk.tools.mcp_tool.mcp_toolset import McpToolset
from mcp import StdioServerParameters

logger = logging.getLogger(__name__)

OBSCURA_BIN = os.environ.get("OBSCURA_BIN", "obscura")
_STORAGE_BASE = os.environ.get("OBSCURA_STORAGE_BASE", "/mnt/cookie-storage")

# Stealth mode (consistent browser fingerprint; with the `stealth` build,
# TLS impersonation + tracker blocking)
_STEALTH = os.environ.get("OBSCURA_STEALTH", "true").lower() != "false"

# The user_id to serve when a request carries none (local dev only).
_DEV_USER_ID = "dev"

# One McpToolset (== one obscura subprocess) per user_id, for the process
# lifetime. close_all_toolsets() handles shutdown.
_TOOLSETS: dict[str, McpToolset] = {}


def storage_dir_for(user_id: str) -> str:
    """The per-user obscura ``--storage-dir`` path for ``user_id``."""
    return str(Path(_STORAGE_BASE) / user_id)


def get_or_create_toolset(user_id: str) -> McpToolset:
    """Return the cached per-user ``McpToolset``, spawning obscura if needed.

    Each student gets their own obscura MCP server process with an isolated
    ``--storage-dir``, so cookies/sessions never leak between users.
    And the per-session tool list cache is keyed per user
    by the session manager, so listing stays cheap without a custom cache.
    """

    if user_id not in _TOOLSETS:
        storage_dir = storage_dir_for(user_id)
        # obscura may expect the directory to already exist.
        Path(storage_dir).mkdir(parents=True, exist_ok=True)
        logger.info(
            "spawning obscura MCP for user %s (storage: %s)",
            user_id,
            storage_dir,
        )

        _TOOLSETS[user_id] = McpToolset(
            connection_params=StdioConnectionParams(
                server_params=StdioServerParameters(
                    command=OBSCURA_BIN,
                    args=[
                        "--storage-dir",
                        storage_dir,
                        *(["--stealth"] if _STEALTH else []),
                        "mcp",
                    ],
                ),
            ),
            tool_list_cache_ttl_seconds=3600,
        )
    return _TOOLSETS[user_id]


async def aclose_all_toolsets() -> None:
    """Await-closes every per-user obscura subprocess. Failures are logged,
    never raised — shutdown must not block."""
    for user_id, toolset in _TOOLSETS.items():
        try:
            await toolset.close()
        except:
            logger.exception("failed closing toolset for %s", user_id)
    _TOOLSETS.clear()


def close_all_toolsets() -> None:
    """Sync best-effort wrapper (atexit): run the async close on a fresh loop."""
    try:
        asyncio.run(aclose_all_toolsets())
    except:
        logger.exception("close_all_toolsets failed")


atexit.register(close_all_toolsets)


class PerUserBrowserToolset(BaseToolset):
    """A ``BaseToolset`` that routes to a per-user obscura ``McpToolset``.

    ADK calls ``get_tools`` at request-assembly time with a
    ``ReadonlyContext`` carrying the invoking ``user_id``; we return the
    tools of *that* student's obscura process. All ``MCPTool`` behaviour
    (declarations from ``inputSchema``, session pooling, retries, error
    handling) is inherited from the per-user ``McpToolset`` untouched.
    """

    async def get_tools(
        self,
        readonly_context: Optional[ReadonlyContext] = None
    ) -> list[BaseTool]:
        """Return this user's obscura tools as ADK ``BaseTool``s.

        Args:
            readonly_context: Carries the invoking ``user_id``. ``None``
                (offline tool enumeration, e.g. schema dumps) falls back to
                the dev profile so listing doesn't crash locally.
        """
        user_id = getattr(readonly_context, "user_id", None) or _DEV_USER_ID
        toolset = get_or_create_toolset(user_id)

        try:
            # The inner toolset's own get_tools caches per-invocation and
            # (via tool_list_cache_ttl_seconds) across invocations
            return await toolset.get_tools_with_prefix(readonly_context)
        except Exception:
            logger.exception(
                "obscura toolset for user %s failed to list tools", user_id
            )
            return []

    async def close(self) -> None:
        """Close all spawned obscura subprocesses."""
        await aclose_all_toolsets()
