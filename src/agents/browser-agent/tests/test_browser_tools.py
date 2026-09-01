"""Tests for app.browser_tools (per-user obscura toolset fanout).

Offline: ``McpToolset.__init__`` doesn't spawn the subprocess (connection is
lazy on first session), so constructing toolsets and asserting spawn
parameters requires no obscura binary and no network.
"""

from __future__ import annotations

import pytest

from app import browser_tools


@pytest.fixture(autouse=True)
def _fresh_toolsets(monkeypatch, tmp_path):
    """Isolated registry + storage base per test."""
    monkeypatch.setattr(browser_tools, "_TOOLSETS", {})
    monkeypatch.setattr(browser_tools, "_STORAGE_BASE", str(tmp_path))
    yield


class _RecordingToolset:
    """Stands in for McpToolset, capturing constructor kwargs."""

    instances: list["_RecordingToolset"] = []

    def __init__(self, **kwargs):
        self.kwargs = kwargs
        _RecordingToolset.instances.append(self)

    async def get_tools_with_prefix(self, readonly_context=None):
        return []

    async def close(self):
        pass


@pytest.fixture
def record_toolsets(monkeypatch):
    _RecordingToolset.instances = []
    monkeypatch.setattr(browser_tools, "McpToolset", _RecordingToolset)
    yield _RecordingToolset


def test_spawn_args_place_storage_dir_before_mcp(record_toolsets):
    """--storage-dir is a TOP-LEVEL flag: it must precede the mcp subcommand."""
    browser_tools.get_or_create_toolset("uid-1")
    assert len(record_toolsets.instances) == 1
    server_params = record_toolsets.instances[0].kwargs["connection_params"].server_params
    assert server_params.command == browser_tools.OBSCURA_BIN
    assert server_params.args == [
        "--storage-dir",
        browser_tools.storage_dir_for("uid-1"),
        "--stealth",
        "mcp",
    ]


def test_mcp_timeout_lands_on_connection_params(record_toolsets):
    """StdioConnectionParams.timeout doubles as the per-call read timeout;
    the 5s default kills real page loads mid-flight. Assert ours is set."""
    browser_tools.get_or_create_toolset("uid-1")
    conn = record_toolsets.instances[0].kwargs["connection_params"]
    assert conn.timeout == browser_tools._MCP_TIMEOUT
    assert conn.timeout > 5  # not the deadly default


def test_mcp_timeout_env_override(record_toolsets, monkeypatch):
    monkeypatch.setattr(browser_tools, "_MCP_TIMEOUT", 120.0)
    browser_tools.get_or_create_toolset("uid-1")
    conn = record_toolsets.instances[0].kwargs["connection_params"]
    assert conn.timeout == 120.0


def test_stealth_off_when_env_false(record_toolsets, monkeypatch):
    """OBSCURA_STEALTH=false drops --stealth from the spawn args."""
    import app.browser_tools as bt

    monkeypatch.setattr(bt, "_STEALTH", False)
    browser_tools.get_or_create_toolset("uid-1")
    server_params = record_toolsets.instances[0].kwargs["connection_params"].server_params
    assert "--stealth" not in server_params.args


def test_no_tool_name_prefix_to_avoid_double_prefix(record_toolsets):
    """Obscura tools are already named browser_*; a prefix would double them."""
    browser_tools.get_or_create_toolset("uid-1")
    kwargs = record_toolsets.instances[0].kwargs
    assert "tool_name_prefix" not in kwargs or kwargs["tool_name_prefix"] is None


def test_storage_dir_joins_base_and_user_id(record_toolsets, monkeypatch):
    assert browser_tools.storage_dir_for("abc").endswith("/abc")
    browser_tools.get_or_create_toolset("abc")
    server_params = record_toolsets.instances[0].kwargs["connection_params"].server_params
    assert server_params.args[1] == browser_tools.storage_dir_for("abc")


def test_same_user_reuses_cached_toolset(record_toolsets):
    first = browser_tools.get_or_create_toolset("uid-1")
    second = browser_tools.get_or_create_toolset("uid-1")
    assert first is second
    assert len(record_toolsets.instances) == 1


def test_distinct_users_get_distinct_toolsets(record_toolsets):
    a = browser_tools.get_or_create_toolset("uid-a")
    b = browser_tools.get_or_create_toolset("uid-b")
    assert a is not b
    assert len(record_toolsets.instances) == 2


async def test_fanout_toolset_uses_context_user_id(record_toolsets):
    """PerUserBrowserToolset.get_tools routes by readonly_context.user_id."""
    from app.browser_tools import PerUserBrowserToolset

    class FakeCtx:
        user_id = "uid-ctx"

    toolset = PerUserBrowserToolset()
    await toolset.get_tools(FakeCtx())
    assert "uid-ctx" in browser_tools._TOOLSETS


async def test_fanout_toolset_no_context_falls_back_to_dev(record_toolsets):
    from app.browser_tools import PerUserBrowserToolset

    toolset = PerUserBrowserToolset()
    await toolset.get_tools(None)
    assert browser_tools._DEV_USER_ID in browser_tools._TOOLSETS


async def test_close_all_toolsets_clears_registry(record_toolsets):
    from app.browser_tools import aclose_all_toolsets

    browser_tools.get_or_create_toolset("uid-1")
    browser_tools.get_or_create_toolset("uid-2")
    assert len(browser_tools._TOOLSETS) == 2
    await aclose_all_toolsets()
    assert browser_tools._TOOLSETS == {}
