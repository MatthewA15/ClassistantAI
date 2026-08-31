"""Tests for app.callbacks placeholder inject/scrub behaviour."""

from __future__ import annotations

from typing import Any

import pytest

from app import callbacks, credentials


class FakeTool:
    def __init__(self):
        self.name = "browser_type"


class FakeState(dict):
    pass


class FakeToolContext:
    def __init__(self, user_id: str | None = "uid-1"):
        self.user_id = user_id
        self.state = FakeState()


CREDS = {"username": "s1234567", "password": "sup3rs3cret!"}


@pytest.fixture(autouse=True)
def _patch_credentials(monkeypatch):
    """Every test in this module gets instant fake credentials."""
    monkeypatch.setattr(
        credentials, "get_portal_credentials", lambda uid: dict(CREDS)
    )
    yield


# --------------------------------------------------------------------------
# inject_credentials (before_tool_callback)
# --------------------------------------------------------------------------

async def test_placeholders_replaced_in_top_level_args():
    tool, args, ctx = FakeTool(), {
        "ref": "e5",
        "text": "<%USERNAME%>",
    }, FakeToolContext()
    result = await callbacks.inject_credentials(tool, args, ctx)
    assert result is None  # None -> tool proceeds with patched args
    assert args == {"ref": "e5", "text": "s1234567"}


async def test_placeholders_replaced_in_nested_json_strings():
    tool, ctx = FakeTool(), FakeToolContext()
    args = {"json": '{"user": "<%USERNAME%>", "pass": "<%PASSWORD%>"}'}
    await callbacks.inject_credentials(tool, args, ctx)
    assert args["json"] == '{"user": "s1234567", "pass": "sup3rs3cret!"}'


async def test_no_placeholders_is_noop():
    tool, ctx = FakeTool(), FakeToolContext()
    args = {"url": "https://portal.school.ca"}
    await callbacks.inject_credentials(tool, args, ctx)
    assert args == {"url": "https://portal.school.ca"}


async def test_no_user_id_leaves_args_untouched(monkeypatch):
    monkeypatch.setattr(
        credentials, "get_portal_credentials",
        lambda uid: pytest.fail("should not fetch creds without user_id"),
    )
    tool, args = FakeTool(), {"text": "<%USERNAME%>"}
    ctx = FakeToolContext(user_id=None)
    await callbacks.inject_credentials(tool, args, ctx)
    # credentials unavailable -> args untouched, no exception raised
    assert "<%USERNAME%>" in args["text"]


async def test_credential_not_found_propagates(monkeypatch):
    def boom(uid):
        raise credentials.CredentialNotFound("no creds")

    monkeypatch.setattr(credentials, "get_portal_credentials", boom)
    tool, args, ctx = FakeTool(), {"text": "<%PASSWORD%>"}, FakeToolContext()
    with pytest.raises(credentials.CredentialNotFound):
        await callbacks.inject_credentials(tool, args, ctx)


# --------------------------------------------------------------------------
# scrub_credentials (after_tool_callback)
# --------------------------------------------------------------------------

async def test_result_with_real_username_is_scrubbed():
    tool, ctx = FakeTool(), FakeToolContext()
    args = {"text": "<%USERNAME%>"}
    await callbacks.inject_credentials(tool, args, ctx)

    result: dict[str, Any] = {
        "ok": True,
        "page": "Welcome back, s1234567! You last signed in Tuesday.",
    }
    out = await callbacks.scrub_credentials(tool, args, ctx, result)
    # Returning None is ADK's "unchanged"; our version mutates in place.
    assert "s1234567" not in result["page"]
    assert "<%USERNAME%>" in result["page"]


async def test_password_scrubbed_even_in_nested_result():
    tool, ctx = FakeTool(), FakeToolContext()
    args = {"text": "x<%PASSWORD%>x"}
    await callbacks.inject_credentials(tool, args, ctx)

    result = {
        "ok": True,
        "nested": {"echo": "submitted password: sup3rs3cret!"},
        "list": ["a", "sup3rs3cret!"],
    }
    await callbacks.scrub_credentials(tool, args, ctx, result)
    flat = str(result)
    assert "sup3rs3cret!" not in flat
    assert "<%PASSWORD%>" in flat


async def test_scrub_is_noop_without_injection():
    tool, ctx = FakeTool(), FakeToolContext()
    result = {"ok": True, "page": "nothing secret here"}
    await callbacks.scrub_credentials(tool, args={}, tool_context=ctx, result=result)
    assert result == {"ok": True, "page": "nothing secret here"}


async def test_state_scrub_marker_cleared_after_scrub():
    tool, ctx = FakeTool(), FakeToolContext()
    args = {"text": "<%USERNAME%>"}
    await callbacks.inject_credentials(tool, args, ctx)
    assert ctx.state.get("browser_creed_scrub")  # marker set
    result = {"page": "hi s1234567"}
    await callbacks.scrub_credentials(tool, args, ctx, result)
    # ADK's State has no __delitem__, so the marker is emptied rather than
    # deleted; the contract is "holds no real values" (falsy / empty).
    assert not ctx.state.get("browser_creed_scrub")
    assert ctx.state.get("browser_creed_scrub") == {}
