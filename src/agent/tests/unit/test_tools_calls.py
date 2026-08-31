"""Tests for the phone-call tools.

These run without google-adk installed (see conftest.py) and without network.
httpx is intercepted at the module boundary and answers with real
httpx.Response objects, so status handling is exercised for real.

The load-bearing tests are the ones about retrying. Every other tool in this
package can be retried for free; `call_student` cannot, because a retry is a
second real phone ringing on a student's handset. Three separate paths have to
say "do not retry" -- a 500, a timeout, and a 404 on the poll -- and each has a
test here for exactly that reason.
"""

import httpx
import pytest

import app.tools_calls as tools_calls

GOAL = "Remind them the CHEM 204 petition is due Friday Sept 5 at 5pm"
RUN_ID = "wMXbZkrDQ-UoPcJPxTw_5A"
UID = "firebase-uid-123"
CALLS_URL = f"https://connectors.test/users/{UID}/calls"

STARTED = {
    "run_id": RUN_ID,
    "status": "started",
    "to_phone_masked": "+•••••••0123",
    "persisted": True,
}

IN_PROGRESS = {
    "run_id": RUN_ID,
    "status": "PREPARING",
    "in_progress": True,
    "poll_after_seconds": 10,
    "summary": None,
    "task_completed": None,
    "transcript": None,
}


def _error(result: dict) -> dict:
    assert result["ok"] is False, f"expected an error dict, got {result}"
    return result["error"]


# --------------------------------------------------------------------------
# What goes on the wire
# --------------------------------------------------------------------------

def test_call_student_posts_the_goal_to_the_calls_endpoint(http, tool_context):
    http.queue(201, STARTED)

    tools_calls.call_student(GOAL, tool_context)

    assert http.last["method"] == "POST"
    assert http.last["url"] == CALLS_URL
    assert http.last["json"] == {"goal": GOAL}
    assert http.last["headers"]["Authorization"] == "Bearer test-token"


def test_call_student_uses_the_long_planning_timeout(http, tool_context):
    http.queue(201, STARTED)

    tools_calls.call_student(GOAL, tool_context)

    # A literal, not the module constant: the connector spends up to ~150s
    # planning, so lowering the constant must fail this rather than agree
    # with itself.
    assert http.last["timeout"] == 200


def test_get_call_result_uses_the_short_timeout(http, tool_context):
    http.queue(200, IN_PROGRESS)

    tools_calls.get_call_result(RUN_ID, tool_context)

    assert http.last["method"] == "GET"
    assert http.last["timeout"] == 30


def test_get_call_result_preserves_the_run_id_exactly(http, tool_context):
    http.queue(200, IN_PROGRESS)

    tools_calls.get_call_result(RUN_ID, tool_context)

    # base64url, the shape CALL-E actually returns. It must reach the
    # connector byte-for-byte -- no trimming, no re-encoding.
    assert http.last["url"] == f"{CALLS_URL}/{RUN_ID}"


def test_debug_mode_substitutes_the_test_user_id(http, tool_context, monkeypatch):
    monkeypatch.setenv("DEBUG", "true")
    monkeypatch.setenv("TEST_USER_ID", "test-uid")
    http.queue(201, STARTED)

    tools_calls.call_student(GOAL, tool_context)

    assert "test-uid" in http.last["url"]
    assert UID not in http.last["url"]


# --------------------------------------------------------------------------
# What comes back to the model
# --------------------------------------------------------------------------

def test_call_student_returns_the_connector_body_unchanged(http, tool_context):
    http.queue(201, STARTED)

    result = tools_calls.call_student(GOAL, tool_context)

    # Raw, like send_text. The docstrings teach these exact key names, so
    # nothing may be renamed or wrapped on the way through.
    assert result == STARTED
    assert "ok" not in result


def test_call_student_surfaces_persisted_false(http, tool_context):
    http.queue(201, dict(STARTED, persisted=False))

    result = tools_calls.call_student(GOAL, tool_context)

    # The call is real and the phone will ring; only the record is missing.
    # The model has to see this to know the result can never be polled.
    assert result["persisted"] is False
    assert result["run_id"] == RUN_ID
    assert "ok" not in result


def test_get_call_result_passes_an_in_progress_poll_through(http, tool_context):
    http.queue(200, IN_PROGRESS)

    result = tools_calls.get_call_result(RUN_ID, tool_context)

    assert result == IN_PROGRESS
    assert result["in_progress"] is True
    assert result["poll_after_seconds"] == 10


# --------------------------------------------------------------------------
# Retrying: the rules that stop a second phone call
# --------------------------------------------------------------------------

def test_a_500_is_not_retryable_and_forbids_calling_again(http, tool_context):
    http.queue(500, {"detail": "boom"})

    error = _error(tools_calls.call_student(GOAL, tool_context))

    assert error["retryable"] is False
    assert "call_student" in error["message"]
    assert "send_text" in error["message"]


def test_a_timeout_is_not_retryable_because_the_phone_may_be_ringing(
    http, tool_context
):
    http.fail(httpx.ReadTimeout("timed out"))

    error = _error(tools_calls.call_student(GOAL, tool_context))

    # The connector answers slowly by design, so a timeout most likely means
    # the request landed and the call is being placed right now.
    assert error["code"] == "network_error"
    assert error["retryable"] is False
    assert "send_text" in error["message"]


def test_a_connect_error_is_retryable_because_nothing_was_placed(
    http, tool_context
):
    http.fail(httpx.ConnectError("no route to host"))

    error = _error(tools_calls.call_student(GOAL, tool_context))

    assert error["code"] == "network_error"
    assert error["retryable"] is True


def test_polling_a_run_that_is_not_recorded_forbids_calling_again(
    http, tool_context
):
    http.queue(404, {"detail": "No call run 'x' for user_id='y'."})

    error = _error(tools_calls.get_call_result(RUN_ID, tool_context))

    assert error["code"] == "call_run_not_found"
    assert error["retryable"] is False
    assert error["run_id"] == RUN_ID
    assert "send_text" in error["message"] or "text" in error["message"]


# --------------------------------------------------------------------------
# The rest of the error taxonomy
# --------------------------------------------------------------------------

def test_a_403_is_calls_disabled_and_points_at_send_text(http, tool_context):
    http.queue(403, {"detail": "Calling is turned off for this student."})

    error = _error(tools_calls.call_student(GOAL, tool_context))

    assert error["code"] == "calls_disabled"
    assert error["retryable"] is False
    assert "send_text" in error["message"]


def test_a_502_is_an_upstream_error_and_retryable(http, tool_context):
    http.queue(502, {"detail": "CALL-E returned HTTP 500"})

    error = _error(tools_calls.call_student(GOAL, tool_context))

    assert error["code"] == "upstream_error"
    assert error["retryable"] is True


def test_a_503_is_an_operator_problem_and_not_retryable(http, tool_context):
    http.queue(503, {"detail": "CALLE_ACCESS_TOKEN is not set"})

    error = _error(tools_calls.call_student(GOAL, tool_context))

    assert error["code"] == "upstream_error"
    assert error["retryable"] is False
    assert "send_text" in error["message"]


def test_a_409_is_forwarded_as_the_connectors_own_prose(http, tool_context):
    detail = "This student has no verified phone number, so there is nothing to call."
    http.queue(409, {"detail": detail})

    result = tools_calls.call_student(GOAL, tool_context)

    # Already good model-facing prose, so it is passed through, like send_text.
    assert result == {"detail": detail}


# --------------------------------------------------------------------------
# Preconditions: neither of these may reach the network
# --------------------------------------------------------------------------

def test_an_unset_connectors_url_makes_no_request(http, tool_context, monkeypatch):
    monkeypatch.setattr(tools_calls, "_CONNECTORS_API_URL", None)

    error = _error(tools_calls.call_student(GOAL, tool_context))

    assert error["code"] == "not_configured"
    assert error["retryable"] is False
    assert http.requests == [], "nothing may reach the network unconfigured"


def test_a_failing_token_fetch_makes_no_request(http, tool_context, monkeypatch):
    def _boom(audience):
        raise RuntimeError("no credentials")

    monkeypatch.setattr(tools_calls, "get_id_token", _boom)

    error = _error(tools_calls.call_student(GOAL, tool_context))

    assert error["code"] == "auth_failed"
    assert error["retryable"] is True
    assert http.requests == []


def test_a_token_fetch_returning_none_is_an_auth_failure(
    http, tool_context, monkeypatch
):
    monkeypatch.setattr(tools_calls, "get_id_token", lambda audience: None)

    error = _error(tools_calls.get_call_result(RUN_ID, tool_context))

    assert error["code"] == "auth_failed"
    assert http.requests == []


def test_the_id_token_audience_is_the_service_root_not_the_endpoint(
    http, tool_context, monkeypatch
):
    seen = []
    monkeypatch.setattr(
        tools_calls, "get_id_token", lambda audience: seen.append(audience) or "t"
    )
    http.queue(201, STARTED)

    tools_calls.call_student(GOAL, tool_context)

    # Cloud Run validates the token against the service root; sending the
    # full /users/.../calls path here would reject every request.
    assert seen == ["https://connectors.test"]


@pytest.mark.parametrize("raw", ["https://connectors.test/", "https://connectors.test"])
def test_a_trailing_slash_in_the_env_var_does_not_double_the_path(raw, monkeypatch):
    monkeypatch.setenv("CONNECTORS_API_URL", raw)
    import importlib

    reloaded = importlib.reload(tools_calls)
    try:
        assert reloaded._CONNECTORS_API_URL == "https://connectors.test"
    finally:
        monkeypatch.delenv("CONNECTORS_API_URL", raising=False)
        importlib.reload(tools_calls)
