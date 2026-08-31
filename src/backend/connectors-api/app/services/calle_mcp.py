"""CALL-E client -- places a real phone call through a hosted MCP server.

(`docs/...` paths in this service are relative to the repo root, three levels
above src/backend/connectors-api/; `app/...` and `scripts/...` are relative
to this service.)

THE TOKEN IS SERVICE CONFIGURATION, NOT A CREDENTIAL
-----------------------------------------------------
`CALLE_ACCESS_TOKEN` is one bearer token for the whole service, the same kind
of thing as `google_client_secret`. It identifies *this integration* to
CALL-E; it never identifies a student. So it is not a per-user credential,
and this module is structurally incapable of treating it as one: it imports
neither `google.cloud.firestore` nor `google.cloud.kms`, writes nothing under
`users/{uid}/credentials/`, and the token has no encrypted form anywhere.

docs/ENCRYPTION_CONTRACT.md governs per-user credentials -- the
google_refresh_token this service decrypts, and the school_password it must
never touch -- and neither of those is what this token is. Nothing here
reads, names, or decrypts either of them, and nothing here should ever grow
the ability to.

The token is minted by a brokered browser login (`scripts/calle_login.py`)
and IT EXPIRES. A 401 or 403 from CALL-E therefore means exactly one thing:
an operator must run that script and rotate the environment variable. It is
never a user error and retrying will never fix it -- which is why
CalleAuthError is its own type rather than a flavour of upstream failure.

SESSIONS ARE NOT CACHED, ON PURPOSE
------------------------------------
Every public call here opens a fresh MCP session:

  1. POST `initialize`, and keep the `mcp-session-id` response header.
  2. Echo that header on every later request in the session.
  3. POST the `notifications/initialized` notification (no id, so the server
     owes no response).
  4. POST `tools/call`.

Caching a session would save one round trip and cost a whole class of bug: a
server-expired session id would surface as a mystery failure on the tool call
rather than on the handshake, and this client would need invalidation logic
for a thing it cannot observe. Placing a phone call is not a hot path.

THE CONFIRM TOKEN IS CONSUMED HERE, DELIBERATELY
-------------------------------------------------
`plan_call` returns a `confirm_token` that `run_call` exchanges for a placed
call. This module spends it inside one session and strips it from everything
it returns; it is never logged, never returned, and never reaches a caller.
That is the design: the human consent for a call lives in the product, not in
a per-call confirmation handshake the agent would only ever rubber-stamp.

RESPONSE FRAMING
----------------
CALL-E is a Streamable HTTP MCP server, so the same POST may be answered as
plain JSON or as an SSE stream -- we send `Accept` for both, so we decode
both. The reference client (CALLE-AI/call-e-integrations,
packages/core/lib/mcp-client.js) advertises the same Accept header but parses
with a bare JSON.parse; handling both framings here is a deliberate, small
divergence rather than an oversight.
"""
import json
import logging
import re
from dataclasses import dataclass

import httpx

from app.config import settings

logger = logging.getLogger(__name__)

# Wire contract. Public so the tests can name them instead of duplicating
# literals -- a header that drifts should break a test, not a phone call.
MCP_PROTOCOL_VERSION = "2025-11-25"
MCP_SESSION_ID_HEADER = "mcp-session-id"
ACCEPT_HEADER = "application/json, text/event-stream"
INTEGRATION_HEADER = "X-Call-E-Integration"
CLIENT_NAME = "classistant-connectors"
CLIENT_VERSION = "0.1.0"
INTEGRATION_HEADER_VALUE = f"{CLIENT_NAME}/{CLIENT_VERSION}"

INITIALIZE_METHOD = "initialize"
INITIALIZED_NOTIFICATION = "notifications/initialized"
TOOLS_CALL_METHOD = "tools/call"

PLAN_CALL_TOOL = "plan_call"
RUN_CALL_TOOL = "run_call"
GET_CALL_RUN_TOOL = "get_call_run"

# plan_call reasons about the goal before it answers and is documented at 150
# seconds; everything else is a fast round trip. A timeout on plan_call costs
# the user the whole flow, so it gets its own budget.
_PLAN_CALL_TIMEOUT_SECONDS = 150.0
_DEFAULT_TIMEOUT_SECONDS = 30.0

# Both spellings throughout: the MCP spec is camelCase, CALL-E answers in
# snake_case, and the reference client reads either.
_STRUCTURED_KEYS = ("structuredContent", "structured_content")
_IS_ERROR_KEYS = ("isError", "is_error")
_CONFIRM_TOKEN_KEYS = ("confirm_token", "confirmToken")
_PLAN_ID_KEYS = ("plan_id", "planId")
_RUN_ID_KEYS = ("run_id", "runId")

# Last resort when run_call answers in prose: "Call started. run_id: r_8f2c".
_RUN_ID_PATTERN = re.compile(
    r"""run[_-]?id["']?\s*[:=]\s*["']?([A-Za-z0-9_-]+)""", re.IGNORECASE
)

# E.164-shaped runs in untrusted upstream text. CALL-E names the number it
# could not reach in its own error prose, and that prose crosses two service
# boundaries (into this service's 502 detail, then into the agent's logs and
# the model's context), so it is masked before it goes anywhere.
_PHONE_PATTERN = re.compile(r"\+\d[\d().\s-]{5,17}\d")

_MAX_ERROR_DETAIL_CHARS = 300


class CalleError(Exception):
    """Base class — a router can map subclasses to HTTP codes."""


class CalleNotConfigured(CalleError):
    """CALLE_ACCESS_TOKEN is unset; an operator must mint one (-> 503)."""


class CalleAuthError(CalleError):
    """CALL-E rejected the service token — it expired, rotate it (-> 503)."""


class CalleUpstreamError(CalleError):
    """CALL-E failed, or answered in a shape this client can't read (-> 502)."""


# --------------------------------------------------------------------------
# Configuration and the one seam the tests swap
# --------------------------------------------------------------------------

def _access_token() -> str:
    """The service bearer token. Never logged and never put in a message."""
    token = settings.calle_access_token
    if not token:
        raise CalleNotConfigured(
            "CALLE_ACCESS_TOKEN is not set, so this service cannot place "
            "calls. Mint one with `python scripts/calle_login.py`. Every "
            "other endpoint is unaffected."
        )
    return token


def _mcp_url() -> str:
    return f"{settings.calle_base_url.rstrip('/')}/mcp/{settings.calle_channel}"


def _base_headers() -> dict[str, str]:
    """Every header CALL-E requires, Authorization included.

    Built per request and passed to `client.post(headers=...)` rather than
    set on the httpx.Client: the tests swap the client (see `_http_client`)
    and would otherwise be asserting headers they set themselves.
    Content-Type is explicit even though `json=` would supply it, because
    httpx only *setdefault*s its own -- so this is the value that goes on
    the wire, and a test can prove it.
    """
    return {
        "Accept": ACCEPT_HEADER,
        "Content-Type": "application/json",
        "mcp-protocol-version": MCP_PROTOCOL_VERSION,
        "Authorization": f"Bearer {_access_token()}",
        INTEGRATION_HEADER: INTEGRATION_HEADER_VALUE,
    }


def _http_client() -> httpx.Client:
    """A fresh httpx.Client for exactly one CALL-E session.

    The test seam, same shape as firestore_creds._firestore_client(): tests
    monkeypatch this to return a client wired to an httpx.MockTransport, so
    real header merging, real JSON encoding and the real per-request timeout
    are all still exercised. Nothing is cached between calls.
    """
    return httpx.Client(timeout=_DEFAULT_TIMEOUT_SECONDS)


@dataclass
class _Session:
    """One MCP session: the client, the headers every request in it repeats
    (the mcp-session-id lands here after initialize), and the JSON-RPC id
    counter -- ids have to be unique within a session.
    """
    client: httpx.Client
    headers: dict[str, str]
    next_id: int = 1


# --------------------------------------------------------------------------
# JSON-RPC messages
# --------------------------------------------------------------------------

def _rpc_request(session: _Session, method: str, params: dict) -> dict:
    payload = {
        "jsonrpc": "2.0",
        "id": session.next_id,
        "method": method,
        "params": params,
    }
    session.next_id += 1
    return payload


def _rpc_notification(method: str) -> dict:
    """A notification carries no `id`, so the server owes no response."""
    return {"jsonrpc": "2.0", "method": method, "params": {}}


def _mask_phones(text: str) -> str:
    """Mask any phone number CALL-E named back to us.

    CALL-E's own error prose says which number it could not reach, and that
    prose ends up in this service's 502 `detail` -- which the ADK agent logs
    and hands to the model. The agent is never supposed to see a student's
    raw number (it does not even send one; the connector reads it from
    Firestore), so the number is reduced here to the same shape the calls
    router shows: the "+" and the last four digits.
    """
    def _mask(match: re.Match) -> str:
        digits = "".join(ch for ch in match.group(0) if ch.isdigit())
        if len(digits) <= 4:
            return match.group(0)
        return "+" + "•" * (len(digits) - 4) + digits[-4:]

    return _PHONE_PATTERN.sub(_mask, text)


def _redact(text: str) -> str:
    """Strip secrets and phone numbers out of untrusted text, then truncate.

    The order is the whole point: truncating first could leave a usable
    prefix of the token in the message. No CALL-E error is expected to echo
    the Authorization header back, but an upstream body is untrusted text,
    and these are the values that must never escape this module.
    """
    token = settings.calle_access_token
    if token:
        text = text.replace(token, "***")
    text = _mask_phones(text)
    return text[:_MAX_ERROR_DETAIL_CHARS]


def _rpc_error_message(method: str, error: object) -> str:
    """A JSON-RPC error object as one redacted line.

    `data` is dropped deliberately: it is the free-form field where a server
    echoes back what it received, which here is a phone number and the call
    goal, and this message reaches a log line.
    """
    if isinstance(error, dict):
        code = error.get("code")
        message = error.get("message") or "no message given"
        return _redact(f"CALL-E rejected {method!r}: {message} (code {code}).")
    return _redact(f"CALL-E rejected {method!r}: {error}.")


# --------------------------------------------------------------------------
# Response decoding -- one entry point for both framings
#
# Streamable HTTP lets the server answer the same POST as JSON or as an SSE
# stream, and we send Accept for both, so both have to decode here rather
# than at four call sites.
# --------------------------------------------------------------------------

def _looks_like_sse(body: str) -> bool:
    """SSE framing sniffed from the body itself.

    Content-Type is checked first, but a server that frames as SSE while
    labelling it application/json (or the reverse) is a real failure mode and
    surviving it costs one startswith.
    """
    return body.lstrip().startswith(("data:", "event:", "id:", "retry:", ":"))


def _sse_data_payloads(body: str) -> list[str]:
    """The `data:` payloads of an SSE body, one entry per event, in order.

    Per the SSE grammar an event ends at a blank line, its data is its
    `data:` lines joined with a newline, and a single space after the colon
    is framing rather than value. Comment lines (`:`) and the
    `event:`/`id:`/`retry:` fields carry no JSON-RPC content.
    """
    payloads: list[str] = []
    current: list[str] = []
    for raw_line in body.splitlines():
        line = raw_line.rstrip("\r")
        if not line:
            if current:
                payloads.append("\n".join(current))
                current = []
            continue
        if line.startswith(":"):
            continue
        name, _, value = line.partition(":")
        if name != "data":
            continue
        current.append(value[1:] if value.startswith(" ") else value)
    # Servers don't always send the trailing blank line.
    if current:
        payloads.append("\n".join(current))
    return payloads


def _decode_rpc_response(response: httpx.Response, *, method: str) -> dict | None:
    """The one place a CALL-E body becomes a JSON-RPC object.

    Returns None for an empty body -- the 202 a notification gets -- and
    leaves it to the caller to decide whether that was legal for the message
    it sent. For an event stream the JSON-RPC object is taken from the LAST
    event that carries one: a server may emit progress notifications ahead of
    the response, and the response is the final event.

    Raises CalleUpstreamError when nothing in the body is a JSON object.
    """
    body = response.text
    if not body.strip():
        return None

    content_type = response.headers.get("content-type", "").split(";")[0].strip().lower()
    if content_type == "text/event-stream" or _looks_like_sse(body):
        candidates = _sse_data_payloads(body)
    else:
        candidates = [body]

    fallback = None
    for payload in reversed(candidates):
        try:
            decoded = json.loads(payload)
        except ValueError:
            continue
        if not isinstance(decoded, dict):
            continue
        if "result" in decoded or "error" in decoded:
            return decoded
        if fallback is None:
            fallback = decoded
    if fallback is not None:
        return fallback

    # Names the status and the content-type, never the body: the body can
    # echo the call goal back, and this message reaches a log line.
    raise CalleUpstreamError(
        f"CALL-E returned no JSON-RPC object for {method!r} "
        f"(HTTP {response.status_code}, content-type {content_type!r})."
    )


# --------------------------------------------------------------------------
# Transport
# --------------------------------------------------------------------------

def _post_rpc(
    session: _Session, payload: dict, *, timeout: float
) -> tuple[dict | None, httpx.Response]:
    """POST one JSON-RPC message; return (envelope or None, response).

    The response comes back too because `initialize` reads the session id off
    a response *header*, not the body.
    """
    method = payload.get("method", "?")
    try:
        response = session.client.post(
            _mcp_url(), json=payload, headers=session.headers, timeout=timeout
        )
    except httpx.InvalidURL as exc:
        # A malformed base url or channel is configuration, not an outage.
        raise CalleNotConfigured(
            f"CALLE_BASE_URL/CALLE_CHANNEL do not form a valid URL: {_mcp_url()!r}."
        ) from exc
    except httpx.HTTPError as exc:
        # The whole transport family: connect/read/write/pool timeouts,
        # ConnectError, RemoteProtocolError, TooManyRedirects and friends.
        # Only the type name goes in the message -- the string form can carry
        # the URL, and this reaches a log line.
        raise CalleUpstreamError(
            f"CALL-E {method!r} request failed: {type(exc).__name__}."
        ) from exc

    if response.status_code in (401, 403):
        raise CalleAuthError(
            f"CALL-E rejected the service token (HTTP {response.status_code}). "
            "The CALL-E access token expires -- mint a new one with "
            "`python scripts/calle_login.py` and update CALLE_ACCESS_TOKEN "
            "here and on Cloud Run. This is not a user error, and retrying "
            "will not fix it."
        )
    if response.status_code >= 400:
        raise CalleUpstreamError(
            f"CALL-E returned HTTP {response.status_code} for {method!r}: "
            + _redact(response.text)
        )

    envelope = _decode_rpc_response(response, method=method)
    if envelope is not None and envelope.get("error") is not None:
        raise CalleUpstreamError(_rpc_error_message(method, envelope["error"]))
    if envelope is None and "id" in payload:
        raise CalleUpstreamError(
            f"CALL-E answered {method!r} with an empty body "
            f"(HTTP {response.status_code}); a JSON-RPC request must get a response."
        )
    return envelope, response


def _open_session(client: httpx.Client) -> _Session:
    """Handshake: initialize -> capture mcp-session-id -> initialized."""
    # _base_headers() is what raises CalleNotConfigured, before any socket.
    session = _Session(client=client, headers=_base_headers())

    _, response = _post_rpc(
        session,
        _rpc_request(
            session,
            INITIALIZE_METHOD,
            {
                "protocolVersion": MCP_PROTOCOL_VERSION,
                "capabilities": {},
                "clientInfo": {"name": CLIENT_NAME, "version": CLIENT_VERSION},
            },
        ),
        timeout=_DEFAULT_TIMEOUT_SECONDS,
    )

    # httpx headers are case-insensitive, so this covers Mcp-Session-Id too.
    session_id = response.headers.get(MCP_SESSION_ID_HEADER)
    if session_id:
        session.headers[MCP_SESSION_ID_HEADER] = session_id
    else:
        # The spec allows a stateless server to omit it; failing here would
        # be stricter than the protocol.
        logger.debug("CALL-E returned no %s header; continuing without one.",
                     MCP_SESSION_ID_HEADER)

    _post_rpc(
        session,
        _rpc_notification(INITIALIZED_NOTIFICATION),
        timeout=_DEFAULT_TIMEOUT_SECONDS,
    )
    return session


# --------------------------------------------------------------------------
# Tool calls and result parsing
# --------------------------------------------------------------------------

def _text_content(result: dict) -> list[str]:
    """Every `text` from `result.content[]`, in order."""
    texts = []
    for item in result.get("content") or []:
        if isinstance(item, dict) and isinstance(item.get("text"), str):
            texts.append(item["text"])
    return texts


def _first_str(payload: dict, keys: tuple[str, ...]) -> str | None:
    """The first non-empty string value among `keys`, both spellings."""
    for key in keys:
        value = payload.get(key)
        if isinstance(value, str) and value.strip():
            return value
    return None


def _tool_result_payload(tool: str, result: dict) -> dict:
    """The tool's structured output, in CALL-E's precedence:

      1. result.structuredContent   -- the spec's camelCase field
      2. result.structured_content  -- CALL-E's snake_case spelling
      3. the first result.content[].text that parses as a JSON *object*

    Returns {} when none of the three yields an object, rather than raising:
    run_call is allowed to answer in prose (see `_run_id_from`), so a missing
    payload is only fatal to callers that need a specific field -- and those
    raise naming the field they wanted, which debugs far better than "no
    structuredContent".

    Raises CalleUpstreamError when the result is marked isError: the tool ran
    and declined, so the call was NOT placed and returning a payload would be
    a lie.
    """
    for key in _IS_ERROR_KEYS:
        if result.get(key):
            detail = _redact(" ".join(_text_content(result))) or "no detail given"
            raise CalleUpstreamError(
                f"CALL-E tool {tool!r} reported an error: {detail}"
            )

    for key in _STRUCTURED_KEYS:
        value = result.get(key)
        if isinstance(value, dict):
            return value

    for text in _text_content(result):
        try:
            decoded = json.loads(text)
        except ValueError:
            continue
        if isinstance(decoded, dict):
            return decoded
    return {}


def _call_tool(
    session: _Session, name: str, arguments: dict, *, timeout: float
) -> tuple[dict, dict]:
    """tools/call -> (structured payload, raw MCP result).

    The raw result comes back as well because run_call's run_id is not always
    inside the structured payload -- see `_run_id_from`.
    """
    envelope, _ = _post_rpc(
        session,
        _rpc_request(
            session, TOOLS_CALL_METHOD, {"name": name, "arguments": arguments}
        ),
        timeout=timeout,
    )
    result = (envelope or {}).get("result")
    result = result if isinstance(result, dict) else {}
    return _tool_result_payload(name, result), result


def _without_confirm_token(value: object) -> object:
    """A copy of `value` with every confirm_token removed, at any depth.

    The confirm token is the single value that turns a plan into a placed
    phone call. It exists for exactly one hop -- plan_call to run_call, inside
    one session -- and must never reach a caller, a response body, a log line
    or a traceback. Recursive because CALL-E may nest the plan under `plan`
    or `calls`, and both spellings because it has used each.
    """
    if isinstance(value, dict):
        return {
            key: _without_confirm_token(item)
            for key, item in value.items()
            if key not in _CONFIRM_TOKEN_KEYS
        }
    if isinstance(value, list):
        return [_without_confirm_token(item) for item in value]
    return value


def _run_id_from(payload: dict, result: dict) -> str | None:
    """run_call's run id: structured first, else scanned out of the text.

    Losing the id means a call that was placed and cannot be polled, so a
    structured miss is worth a regex rather than an exception. The CALL-E CLI
    does the same.
    """
    run_id = _first_str(payload, _RUN_ID_KEYS)
    if run_id:
        return run_id
    for text in _text_content(result):
        match = _RUN_ID_PATTERN.search(text)
        if match:
            return match.group(1)
    return None


# --------------------------------------------------------------------------
# Public API
# --------------------------------------------------------------------------

def start_call(
    to_phone: str,
    goal: str,
    language: str | None = None,
    region: str | None = None,
) -> dict:
    """Plan and place one call. Returns {plan_id, run_id, plan, run}.

    plan_call and run_call run inside ONE session, because the confirm token
    is scoped to it. That token never leaves this function: it is stripped
    out of `plan` and `run` before they are returned, and never logged.

    `to_phone` must be E.164 and is passed through as-is -- validating it
    belongs at the router, the same way credential handling stays out of
    routers.

    Raises CalleNotConfigured if no token is set, CalleAuthError if the token
    expired, and CalleUpstreamError if CALL-E fails or answers unreadably.
    """
    arguments: dict = {"to_phones": [to_phone], "goal": goal}
    # Omitted rather than sent as explicit nulls when not given.
    if language is not None:
        arguments["language"] = language
    if region is not None:
        arguments["region"] = region

    with _http_client() as client:
        session = _open_session(client)
        plan, _ = _call_tool(
            session, PLAN_CALL_TOOL, arguments, timeout=_PLAN_CALL_TIMEOUT_SECONDS
        )

        plan_id = _first_str(plan, _PLAN_ID_KEYS)
        confirm_token = _first_str(plan, _CONFIRM_TOKEN_KEYS)
        if not plan_id:
            raise CalleUpstreamError(
                "CALL-E planned the call but returned no plan_id; nothing was placed."
            )
        # No confirm token means no call: fail here rather than send run_call
        # a request it cannot honour.
        if not confirm_token:
            raise CalleUpstreamError(
                "CALL-E planned the call but returned no confirm token; "
                "nothing was placed."
            )

        run, run_result = _call_tool(
            session,
            RUN_CALL_TOOL,
            {"plan_id": plan_id, "confirm_token": confirm_token},
            timeout=_DEFAULT_TIMEOUT_SECONDS,
        )

    run_id = _run_id_from(run, run_result)
    if not run_id:
        raise CalleUpstreamError(
            "CALL-E accepted run_call but returned no run_id; the call may be "
            "in progress and cannot be polled."
        )

    # Identifiers only. Never the number, the goal, or the confirm token.
    logger.info("CALL-E call started (plan_id=%s, run_id=%s)", plan_id, run_id)
    return {
        "plan_id": plan_id,
        "run_id": run_id,
        "plan": _without_confirm_token(plan),
        "run": _without_confirm_token(run),
    }


def get_call_run(
    run_id: str, cursor: str | None = None, limit: int | None = None
) -> dict:
    """Poll one call run: status and activity so far, as CALL-E reports it.

    Opens its own session -- see the module docstring on why none is cached.
    """
    arguments: dict = {"run_id": run_id}
    if cursor is not None:
        arguments["cursor"] = cursor
    if limit is not None:
        arguments["limit"] = limit

    with _http_client() as client:
        session = _open_session(client)
        payload, _ = _call_tool(
            session, GET_CALL_RUN_TOOL, arguments, timeout=_DEFAULT_TIMEOUT_SECONDS
        )

    if not payload:
        raise CalleUpstreamError(
            f"CALL-E returned no readable status for run {run_id!r}."
        )
    # Defensive: a run detail may embed the plan it came from.
    return _without_confirm_token(payload)
