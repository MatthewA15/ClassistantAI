"""Unit-test setup: run the agent package without the ADK installed.

`app/__init__.py` imports `.agent`, which imports `google.adk.agents.llm_agent`
and `google.adk.apps`; `app/tools.py` imports `google.adk.tools`. So importing
anything under `app.` pulls in the ADK, which is a heavy dependency that is not
present in every environment these tests need to run in.

Three things about the stub below are load-bearing:

  * It has to land in `sys.modules` before the first `import app.*`, which is
    why it runs at conftest import time rather than inside a fixture.
  * It only stubs `google.adk` and below. `google` is a namespace package, so
    adding a submodule does not shadow its siblings, and the real
    `google.auth` that `app/util.py` needs is untouched.
  * It installs ONLY when the real ADK is absent. That conditional is a
    correctness requirement, not politeness: `pytest tests/unit
    tests/integration` loads this file first, and an unconditional stub would
    poison `sys.modules` with an empty package and break every integration
    test on a machine that does have the ADK installed.
"""

import sys
import types

import httpx
import pytest


def _adk_available() -> bool:
    try:
        import google.adk.agents.llm_agent  # noqa: F401
        import google.adk.apps  # noqa: F401
        import google.adk.tools  # noqa: F401
    except Exception:
        return False
    return True


def _install_adk_stub() -> None:
    """Minimal stand-ins for the three ADK symbols this package imports."""

    class ToolContext:
        def __init__(self, user_id=None, **kwargs):
            self.user_id = user_id

    class Agent:
        def __init__(self, **kwargs):
            self.__dict__.update(kwargs)

    class App:
        def __init__(self, **kwargs):
            self.__dict__.update(kwargs)

    def _module(name: str) -> types.ModuleType:
        mod = types.ModuleType(name)
        mod.__path__ = []  # mark as a package so submodule imports resolve
        sys.modules[name] = mod
        return mod

    adk = _module("google.adk")
    agents = _module("google.adk.agents")
    llm_agent = _module("google.adk.agents.llm_agent")
    apps = _module("google.adk.apps")
    tools = _module("google.adk.tools")

    llm_agent.Agent = Agent
    apps.App = App
    tools.ToolContext = ToolContext
    agents.llm_agent = llm_agent
    adk.agents = agents
    adk.apps = apps
    adk.tools = tools

    import google  # the real namespace package
    google.adk = adk


if not _adk_available():
    _install_adk_stub()


@pytest.fixture
def tool_context():
    """A ToolContext carrying a Firebase uid, real class or stub alike."""
    from google.adk.tools import ToolContext

    return ToolContext(user_id="firebase-uid-123")


@pytest.fixture
def calls_env(monkeypatch):
    """Configure tools_calls as if deployed, with auth already working."""
    import app.tools_calls as tools_calls

    monkeypatch.setattr(tools_calls, "_CONNECTORS_API_URL", "https://connectors.test")
    monkeypatch.setattr(tools_calls, "get_id_token", lambda audience: "test-token")
    monkeypatch.setenv("DEBUG", "false")
    monkeypatch.delenv("TEST_USER_ID", raising=False)
    return tools_calls


class _Recorder:
    """Captures what a tool actually put on the wire, and replies to order.

    Responses are real httpx.Response objects, so `.is_success`, `.json()` and
    `.text` behave exactly as they do in production -- the tests exercise the
    real status handling rather than a mock's idea of it.
    """

    def __init__(self):
        self.requests: list[dict] = []
        self.response = None
        self.raises = None

    def queue(self, status: int, json=None, text=None):
        self.response = (status, json, text)

    def fail(self, exc: Exception):
        self.raises = exc

    def _handle(self, method: str, url: str, **kwargs):
        self.requests.append({
            "method": method,
            "url": url,
            "json": kwargs.get("json"),
            "headers": kwargs.get("headers") or {},
            "timeout": kwargs.get("timeout"),
        })
        if self.raises is not None:
            raise self.raises
        status, payload, text = self.response
        request = httpx.Request(method, url)
        if payload is not None:
            return httpx.Response(status, json=payload, request=request)
        return httpx.Response(status, text=text or "", request=request)

    @property
    def last(self) -> dict:
        return self.requests[-1]


@pytest.fixture
def http(monkeypatch, calls_env):
    """Intercepts httpx.post/get inside tools_calls. No network, ever."""
    recorder = _Recorder()
    monkeypatch.setattr(
        calls_env.httpx, "post",
        lambda url, **kw: recorder._handle("POST", url, **kw),
    )
    monkeypatch.setattr(
        calls_env.httpx, "get",
        lambda url, **kw: recorder._handle("GET", url, **kw),
    )
    return recorder
