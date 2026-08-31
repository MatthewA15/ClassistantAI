"""Tests for the CALL-E MCP client.

The client is driven through httpx.MockTransport rather than a mocking
library, so every assertion is about bytes httpx actually produced -- merged
headers, the encoded JSON body, the per-request timeout. There is no respx
and no pytest-mock in requirements-dev.txt on purpose; the seam is
`_http_client`, monkeypatched the same way test_firestore_creds.py swaps
`_firestore_client`.

The load-bearing test here is
`test_the_confirm_token_appears_nowhere_in_what_start_call_returns`. The
confirm token is the one value that turns a plan into a real phone call, and
consuming it inside this module is the whole design -- if it leaks into a
return value or a log line, that design is gone and nothing else would say so.
"""
import json
import logging

import httpx
import pytest

import app.services.calle_mcp as calle

TOKEN = "calle-service-token-abc123"
PHONE = "+15145550123"
GOAL = "Ask the registrar when add-drop closes"
CONFIRM_TOKEN = "confirm-tok-9f3d"
SESSION_IDS = ("sess-1", "sess-2")

PLAN_RESULT = {
    "structuredContent": {"plan_id": "plan-1", "confirm_token": CONFIRM_TOKEN}
}
RUN_RESULT = {"structuredContent": {"run_id": "run-1", "status": "dialing"}}


def _sse(envelope: dict) -> httpx.Response:
    """`envelope` framed as an SSE stream, the way a streaming MCP server
    answers the same POST.
    """
    body = f"event: message\ndata: {json.dumps(envelope)}\n\n"
    return httpx.Response(
        200, text=body, headers={"content-type": "text/event-stream"}
    )


class _CalleServer:
    """A CALL-E stand-in behind httpx.MockTransport.

    Records every httpx.Request the module actually built, so the tests
    assert what would go over the wire rather than what a mock was told.
    `results` maps a tool name to the MCP result dict it should answer with,
    an httpx.Response to return verbatim, or an exception to raise.
    """

    def __init__(self):
        self.requests: list[httpx.Request] = []
        self.clients: list[httpx.Client] = []
        self.results: dict = {
            calle.PLAN_CALL_TOOL: PLAN_RESULT,
            calle.RUN_CALL_TOOL: RUN_RESULT,
        }
        self.session_ids = list(SESSION_IDS)
        self.send_session_id = True
        self.framing = "json"
        self.initializes = 0

    def payload_of(self, request: httpx.Request) -> dict:
        return json.loads(request.content)

    def requests_for(self, method: str) -> list[httpx.Request]:
        return [r for r in self.requests if self.payload_of(r).get("method") == method]

    def tool_calls(self) -> list[dict]:
        """The params of every tools/call, in order."""
        return [
            self.payload_of(r)["params"]
            for r in self.requests_for(calle.TOOLS_CALL_METHOD)
        ]

    def arguments_for(self, tool: str) -> dict:
        return next(p["arguments"] for p in self.tool_calls() if p["name"] == tool)

    def _envelope(self, request: httpx.Request, result: dict) -> httpx.Response:
        envelope = {
            "jsonrpc": "2.0",
            "id": self.payload_of(request).get("id"),
            "result": result,
        }
        if self.framing == "sse":
            return _sse(envelope)
        return httpx.Response(200, json=envelope)

    def handle(self, request: httpx.Request) -> httpx.Response:
        self.requests.append(request)
        payload = self.payload_of(request)
        method = payload.get("method")

        if method == calle.INITIALIZE_METHOD:
            headers = {}
            if self.send_session_id and self.session_ids:
                headers[calle.MCP_SESSION_ID_HEADER] = self.session_ids[
                    min(self.initializes, len(self.session_ids) - 1)
                ]
            self.initializes += 1
            return httpx.Response(
                200,
                json={"jsonrpc": "2.0", "id": payload.get("id"), "result": {}},
                headers=headers,
            )

        if method == calle.INITIALIZED_NOTIFICATION:
            # A notification gets no JSON-RPC response at all.
            return httpx.Response(202)

        tool = payload["params"]["name"]
        outcome = self.results[tool]
        if isinstance(outcome, Exception):
            raise outcome
        if isinstance(outcome, httpx.Response):
            return outcome
        return self._envelope(request, outcome)


@pytest.fixture
def server(monkeypatch):
    """A CALL-E stand-in, with `_http_client` pointed at it."""
    calle_server = _CalleServer()

    def _client() -> httpx.Client:
        client = httpx.Client(
            transport=httpx.MockTransport(calle_server.handle),
            # Mirror production, so a request that ever forgets its explicit
            # timeout still reads as 30s rather than httpx's 5s default.
            timeout=calle._DEFAULT_TIMEOUT_SECONDS,
        )
        calle_server.clients.append(client)
        return client

    monkeypatch.setattr(calle, "_http_client", _client)
    return calle_server


@pytest.fixture(autouse=True)
def _configured(monkeypatch):
    """Every test starts with a token set; the not-configured test clears it."""
    monkeypatch.setattr(calle.settings, "calle_access_token", TOKEN)


def _walk(value):
    """Every scalar in a nested structure, for leak checks."""
    if isinstance(value, dict):
        for key, item in value.items():
            yield key
            yield from _walk(item)
    elif isinstance(value, list):
        for item in value:
            yield from _walk(item)
    else:
        yield value


# --------------------------------------------------------------------------
# The session handshake
# --------------------------------------------------------------------------

def test_initialize_is_the_first_request_and_declares_the_protocol_version(server):
    calle.start_call(PHONE, GOAL)

    first = server.payload_of(server.requests[0])
    assert first["method"] == calle.INITIALIZE_METHOD
    assert first["params"]["protocolVersion"] == calle.MCP_PROTOCOL_VERSION
    assert first["params"]["capabilities"] == {}
    assert first["params"]["clientInfo"] == {
        "name": calle.CLIENT_NAME,
        "version": calle.CLIENT_VERSION,
    }


def test_every_request_carries_the_headers_calle_requires(server):
    calle.start_call(PHONE, GOAL)

    assert server.requests
    for request in server.requests:
        # accept proves the module's value beat httpx's own */*, and
        # content-type proves the explicit value survived httpx's setdefault.
        assert request.headers["accept"] == calle.ACCEPT_HEADER
        assert request.headers["content-type"].startswith("application/json")
        assert request.headers["mcp-protocol-version"] == calle.MCP_PROTOCOL_VERSION
        assert request.headers["authorization"] == f"Bearer {TOKEN}"
        assert request.headers[calle.INTEGRATION_HEADER.lower()] == (
            calle.INTEGRATION_HEADER_VALUE
        )
        assert str(request.url) == (
            f"{calle.settings.calle_base_url}/mcp/{calle.settings.calle_channel}"
        )


def test_the_session_id_from_initialize_is_echoed_on_every_later_request(server):
    calle.start_call(PHONE, GOAL)

    initialize, *rest = server.requests
    assert calle.MCP_SESSION_ID_HEADER not in initialize.headers
    assert rest, "the handshake must be followed by more requests"
    for request in rest:
        assert request.headers[calle.MCP_SESSION_ID_HEADER] == SESSION_IDS[0]


def test_the_initialized_notification_follows_initialize_and_carries_no_id(server):
    calle.start_call(PHONE, GOAL)

    second = server.payload_of(server.requests[1])
    assert second["method"] == calle.INITIALIZED_NOTIFICATION
    # No id -- so the server's empty 202 is the expected outcome, not an error.
    assert "id" not in second


def test_a_missing_session_id_header_does_not_stop_the_session(server):
    server.send_session_id = False

    result = calle.start_call(PHONE, GOAL)

    assert result["run_id"] == "run-1"
    assert not any(
        calle.MCP_SESSION_ID_HEADER in r.headers for r in server.requests
    ), "no session id was offered, so none should have been invented"


def test_each_public_call_opens_its_own_session(server):
    calle.start_call(PHONE, GOAL)
    server.results[calle.GET_CALL_RUN_TOOL] = {
        "structuredContent": {"run_id": "run-1", "status": "completed"}
    }
    calle.get_call_run("run-1")

    assert len(server.requests_for(calle.INITIALIZE_METHOD)) == 2
    assert len(server.clients) == 2
    assert all(client.is_closed for client in server.clients), (
        "each session's client must be closed when its call finishes"
    )
    # The second session echoes the second id, so nothing was cached.
    assert server.requests[-1].headers[calle.MCP_SESSION_ID_HEADER] == SESSION_IDS[1]


def test_plan_call_gets_the_long_timeout_and_every_other_request_the_default(server):
    # Pinned to the literal seconds, not just to the constants: CALL-E
    # documents plan_call at 150s, and asserting only that the two constants
    # are routed correctly would pass just as happily if both were 30.
    assert calle._PLAN_CALL_TIMEOUT_SECONDS == 150.0
    assert calle._DEFAULT_TIMEOUT_SECONDS == 30.0

    calle.start_call(PHONE, GOAL)

    def read_timeout(request: httpx.Request) -> float:
        return request.extensions["timeout"]["read"]

    for request in server.requests:
        payload = server.payload_of(request)
        is_plan_call = (
            payload.get("method") == calle.TOOLS_CALL_METHOD
            and payload["params"]["name"] == calle.PLAN_CALL_TOOL
        )
        expected = (
            calle._PLAN_CALL_TIMEOUT_SECONDS
            if is_plan_call
            else calle._DEFAULT_TIMEOUT_SECONDS
        )
        assert read_timeout(request) == expected, f"wrong timeout on {payload}"


# --------------------------------------------------------------------------
# plan + run, and the confirm token that must never escape
# --------------------------------------------------------------------------

def test_start_call_plans_then_runs_in_one_session_and_returns_both_ids(server):
    result = calle.start_call(PHONE, GOAL)

    assert [params["name"] for params in server.tool_calls()] == [
        calle.PLAN_CALL_TOOL,
        calle.RUN_CALL_TOOL,
    ]
    assert len(server.requests_for(calle.INITIALIZE_METHOD)) == 1
    assert result["plan_id"] == "plan-1"
    assert result["run_id"] == "run-1"
    assert result["run"]["status"] == "dialing"


def test_the_phone_number_is_sent_as_a_one_element_to_phones_list(server):
    calle.start_call(PHONE, GOAL)

    arguments = server.arguments_for(calle.PLAN_CALL_TOOL)
    assert arguments["to_phones"] == [PHONE]
    assert arguments["goal"] == GOAL


def test_run_call_is_sent_the_confirm_token_plan_call_returned(server):
    calle.start_call(PHONE, GOAL)

    # The one hop where the token legitimately travels.
    assert server.arguments_for(calle.RUN_CALL_TOOL) == {
        "plan_id": "plan-1",
        "confirm_token": CONFIRM_TOKEN,
    }


def test_the_confirm_token_appears_nowhere_in_what_start_call_returns(server):
    server.results[calle.PLAN_CALL_TOOL] = {
        "structuredContent": {
            "plan_id": "plan-1",
            "confirm_token": CONFIRM_TOKEN,
            # Nested, and under the camelCase spelling too.
            "plan": {"legs": [{"confirmToken": CONFIRM_TOKEN, "to": PHONE}]},
        }
    }
    server.results[calle.RUN_CALL_TOOL] = {
        "structuredContent": {"run_id": "run-1", "confirm_token": CONFIRM_TOKEN}
    }

    result = calle.start_call(PHONE, GOAL)

    values = list(_walk(result))
    # Substring, not equality: a token embedded in a longer string (a URL
    # with it in the query, say) is just as much of a leak as a bare one.
    assert not [v for v in values if isinstance(v, str) and CONFIRM_TOKEN in v]
    assert not {"confirm_token", "confirmToken"} & set(values)
    # The rest of the payload survives -- this strips one key, not the plan.
    assert result["plan"]["plan"]["legs"][0]["to"] == PHONE


def test_the_confirm_token_and_the_call_content_never_reach_a_log_line(server, caplog):
    with caplog.at_level(logging.DEBUG, logger=calle.__name__):
        calle.start_call(PHONE, GOAL)

    assert caplog.records, "the call must be logged, or it cannot be traced"
    logged = "\n".join(
        record.getMessage() + (record.exc_text or "") for record in caplog.records
    )
    assert CONFIRM_TOKEN not in logged
    assert TOKEN not in logged
    assert PHONE not in logged
    assert GOAL not in logged
    # Identifiers are what a log line is for.
    assert "run-1" in logged


def test_start_call_omits_language_and_region_when_they_are_not_given(server):
    calle.start_call(PHONE, GOAL)

    # Absent, not null: CALL-E should see the same request as a caller that
    # has no opinion on either.
    assert set(server.arguments_for(calle.PLAN_CALL_TOOL)) == {"to_phones", "goal"}


def test_start_call_passes_language_and_region_through_when_they_are_given(server):
    calle.start_call(PHONE, GOAL, language="en-CA", region="CA")

    arguments = server.arguments_for(calle.PLAN_CALL_TOOL)
    assert arguments["language"] == "en-CA"
    assert arguments["region"] == "CA"


def test_a_plan_without_a_confirm_token_never_reaches_run_call(server):
    server.results[calle.PLAN_CALL_TOOL] = {
        "structuredContent": {"plan_id": "plan-1"}
    }

    with pytest.raises(calle.CalleUpstreamError):
        calle.start_call(PHONE, GOAL)

    # The safety property: no confirm token, no call placed.
    assert server.requests_for(calle.TOOLS_CALL_METHOD)
    assert not any(
        params["name"] == calle.RUN_CALL_TOOL for params in server.tool_calls()
    )


# --------------------------------------------------------------------------
# Result parsing and response framing
# --------------------------------------------------------------------------

def test_a_json_object_in_the_text_content_is_read_when_no_structured_field_is_present(
    server,
):
    server.results[calle.PLAN_CALL_TOOL] = {
        "content": [
            {"type": "text", "text": "Planning your call"},  # prose, skipped
            {
                "type": "text",
                "text": json.dumps(
                    {"plan_id": "plan-1", "confirm_token": CONFIRM_TOKEN}
                ),
            },
        ]
    }

    result = calle.start_call(PHONE, GOAL)

    assert result["plan_id"] == "plan-1"
    assert CONFIRM_TOKEN not in list(_walk(result))


def test_the_run_id_is_scanned_out_of_the_text_when_run_call_returns_no_structured_run_id(
    server,
):
    server.results[calle.RUN_CALL_TOOL] = {
        "structuredContent": {"status": "dialing"},
        "content": [{"type": "text", "text": "Call started. run_id: r_8f2c"}],
    }

    assert calle.start_call(PHONE, GOAL)["run_id"] == "r_8f2c"


@pytest.mark.parametrize("framing", ["json", "sse"])
def test_an_event_stream_response_is_decoded_exactly_like_a_json_one(server, framing):
    server.framing = framing

    result = calle.start_call(PHONE, GOAL)

    assert result["plan_id"] == "plan-1"
    assert result["run_id"] == "run-1"


def test_the_json_rpc_response_is_taken_from_the_last_event_in_the_stream():
    """A streaming server may emit progress ahead of the response."""
    body = (
        ": keep-alive\n"
        "event: message\n"
        'data: {"jsonrpc": "2.0", "method": "notifications/progress"}\n'
        "\n"
        "event: message\n"
        'data: {"jsonrpc": "2.0", "id": 1, "result": {"ok": true}}\n'
        "\n"
    )
    response = httpx.Response(
        200, text=body, headers={"content-type": "text/event-stream"}
    )

    envelope = calle._decode_rpc_response(response, method="tools/call")

    assert envelope["result"] == {"ok": True}


def test_multi_line_sse_data_is_joined_and_the_leading_space_is_stripped():
    body = ': a comment\nevent: message\ndata: {"a": 1,\ndata:  "b": 2}\n\n'

    # One space after the colon is framing; a second one is data.
    assert calle._sse_data_payloads(body) == ['{"a": 1,\n "b": 2}']


def test_a_notification_answered_with_202_and_an_empty_body_is_not_an_error():
    empty = httpx.Response(202)

    assert calle._decode_rpc_response(
        empty, method=calle.INITIALIZED_NOTIFICATION
    ) is None


# --------------------------------------------------------------------------
# Error taxonomy. A CALL-E failure is an operator problem or an upstream
# problem -- it is never reported as something the student did wrong.
# --------------------------------------------------------------------------

def test_a_missing_access_token_raises_calle_not_configured_before_any_request(
    server, monkeypatch
):
    monkeypatch.setattr(calle.settings, "calle_access_token", None)

    with pytest.raises(calle.CalleNotConfigured) as excinfo:
        calle.start_call(PHONE, GOAL)

    assert "scripts/calle_login.py" in str(excinfo.value)
    assert server.requests == [], "nothing should reach the network unconfigured"


@pytest.mark.parametrize("status", [401, 403])
def test_a_401_or_403_tells_the_operator_to_rotate_the_token(server, status):
    server.results[calle.PLAN_CALL_TOOL] = httpx.Response(
        status, text=f"token {TOKEN} expired"
    )

    with pytest.raises(calle.CalleAuthError) as excinfo:
        calle.start_call(PHONE, GOAL)

    message = str(excinfo.value)
    assert "scripts/calle_login.py" in message
    assert "CALLE_ACCESS_TOKEN" in message
    assert TOKEN not in message, "the bearer token must never reach a message"


def test_a_json_rpc_error_body_raises_an_upstream_error(server):
    server.results[calle.PLAN_CALL_TOOL] = httpx.Response(
        200,
        json={
            "jsonrpc": "2.0",
            "id": 2,
            "error": {
                "code": -32602,
                "message": "unknown tool",
                # `data` echoes back what was sent, so it must not surface.
                "data": {"to_phones": [PHONE]},
            },
        },
    )

    with pytest.raises(calle.CalleUpstreamError) as excinfo:
        calle.start_call(PHONE, GOAL)

    message = str(excinfo.value)
    assert "unknown tool" in message
    assert "-32602" in message
    assert PHONE not in message


def test_an_http_500_raises_an_upstream_error_and_not_an_auth_error(server):
    server.results[calle.PLAN_CALL_TOOL] = httpx.Response(500, text="gateway blew up")

    with pytest.raises(calle.CalleUpstreamError) as excinfo:
        calle.start_call(PHONE, GOAL)

    assert not isinstance(excinfo.value, calle.CalleAuthError)


def test_a_transport_failure_raises_an_upstream_error_chaining_the_original(server):
    server.results[calle.PLAN_CALL_TOOL] = httpx.ConnectError("no route to host")

    with pytest.raises(calle.CalleUpstreamError) as excinfo:
        calle.start_call(PHONE, GOAL)

    assert "ConnectError" in str(excinfo.value)
    assert isinstance(excinfo.value.__cause__, httpx.ConnectError)


@pytest.mark.parametrize("key", ["isError", "is_error"])
def test_a_tool_result_marked_is_error_raises_an_upstream_error(server, key):
    server.results[calle.PLAN_CALL_TOOL] = {
        key: True,
        "content": [{"type": "text", "text": "number unreachable"}],
    }

    with pytest.raises(calle.CalleUpstreamError) as excinfo:
        calle.start_call(PHONE, GOAL)

    assert "number unreachable" in str(excinfo.value)


def test_a_body_that_is_neither_json_nor_an_event_stream_raises_an_upstream_error(
    server,
):
    server.results[calle.PLAN_CALL_TOOL] = httpx.Response(
        200, text="<html>502 Bad Gateway</html>", headers={"content-type": "text/html"}
    )

    with pytest.raises(calle.CalleUpstreamError) as excinfo:
        calle.start_call(PHONE, GOAL)

    message = str(excinfo.value)
    assert "text/html" in message
    assert "Bad Gateway" not in message, "the body can echo the goal; don't quote it"


# --------------------------------------------------------------------------
# get_call_run
# --------------------------------------------------------------------------

def test_get_call_run_sends_the_run_id_and_returns_the_structured_payload(server):
    server.results[calle.GET_CALL_RUN_TOOL] = {
        "structuredContent": {"run_id": "run-1", "status": "completed"}
    }

    assert calle.get_call_run("run-1") == {"run_id": "run-1", "status": "completed"}
    assert server.arguments_for(calle.GET_CALL_RUN_TOOL) == {"run_id": "run-1"}


def test_get_call_run_passes_cursor_and_limit_through_when_they_are_given(server):
    server.results[calle.GET_CALL_RUN_TOOL] = {"structuredContent": {"status": "done"}}

    calle.get_call_run("run-1", cursor="c-1", limit=10)

    assert server.arguments_for(calle.GET_CALL_RUN_TOOL) == {
        "run_id": "run-1",
        "cursor": "c-1",
        "limit": 10,
    }


def test_a_phone_number_in_calles_error_text_is_masked(server):
    """CALL-E names the number it could not reach; that must not travel.

    This detail becomes the connector's 502 `detail`, which the ADK agent
    logs and hands to the model -- and the agent is never supposed to see a
    student's raw number, since it does not even send one. Masked here, at
    the boundary where the untrusted text arrives, rather than at each of the
    places it later flows to.
    """
    number = "+15145550123"
    server.results[calle.PLAN_CALL_TOOL] = {
        "isError": True,
        "content": [{"type": "text", "text": f"Cannot reach {number}: invalid"}],
    }

    with pytest.raises(calle.CalleUpstreamError) as excinfo:
        calle.start_call(number, GOAL)

    message = str(excinfo.value)
    assert number not in message
    assert "0123" in message, "the last four digits stay, so it is recognisable"
    assert "invalid" in message, "the reason must survive masking"


def test_masking_leaves_ordinary_numbers_alone():
    """A run id or a duration must not be mangled into a phone number."""
    assert calle._mask_phones("run 12345 took 96 seconds") == (
        "run 12345 took 96 seconds"
    )
    assert calle._mask_phones("no digits here") == "no digits here"
