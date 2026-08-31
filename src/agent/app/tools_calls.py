"""Phone-call tools for Classy.

Calling is the only tool here with a cost the student feels directly: a real
phone rings, on their own verified number, and it cannot be taken back. Two
consequences run through this module.

Placing a call is the last rung of the escalation ladder, never an opening
move -- and that policy lives in the tool docstrings, because that is what the
model actually reads.

And every error on the POST path has to say whether retrying is safe, because
a blind retry there is a second phone call, not a second HTTP request. That is
why a 500 and a timeout are both marked non-retryable here even though the
usual rule for each is the opposite.

The connector these call is documented in
src/backend/connectors-api/API_CONTRACT.md, section "Calls".
"""

import logging
import os

import httpx
from google.adk.tools import ToolContext

from .tools import _error_response
from .util import get_id_token

logger = logging.getLogger(__name__)

# Trailing slash stripped: it would otherwise produce "//users/..." in the
# path and, worse, an ID-token audience Cloud Run rejects -- two confusing
# failures from one invisible character.
_CONNECTORS_API_URL = (
    os.environ.get("CONNECTORS_API_URL") or "").rstrip("/") or None

# The connector plans the call before it accepts the run, which the contract
# puts at around 150 seconds. Everything else is a fast round trip.
_START_CALL_TIMEOUT_S = 200
_REQUEST_TIMEOUT_S = 30


def _not_configured(tool: str) -> dict:
    """The error both tools return when CONNECTORS_API_URL is unset."""
    logger.error("%s: CONNECTORS_API_URL is not set.", tool)
    return _error_response(
        "not_configured",
        "The connector service URL is not configured, so calling is "
        "unavailable. This is an internal error — do not retry; use "
        "send_text to reach the student instead.",
        retryable=False,
    )


def _user_id(tool_context: ToolContext) -> str | None:
    """The user id to address, substituting the debug user in dev."""
    # Use debug user id in dev
    return tool_context.user_id \
        if os.environ.get("DEBUG", "false") == "false" \
        else os.environ.get("TEST_USER_ID")


def _id_token_or_error(tool: str) -> str | dict:
    """An ID token for the connector service, or the error dict to return.

    Returns a `str` on success and a ready-built `_error_response` dict on
    failure, so the call site is `if isinstance(token, dict): return token`.

    The audience is the connector's BASE url, not the endpoint being called --
    unlike send_text, where the URL and the endpoint happen to be the same
    thing. Cloud Run checks the token against the service root, so passing the
    full /users/.../calls path here would fail every request.
    """
    try:
        id_token = get_id_token(_CONNECTORS_API_URL)
        if id_token is None:
            raise Exception("No ID Token returned")
    except Exception as exc:
        logger.error("%s: failed to get ID token: %s", tool, exc)
        return _error_response(
            "auth_failed",
            "Could not obtain credentials to authenticate with the connector "
            "service. This is likely a transient infrastructure issue — you "
            "may try again in a moment.",
            retryable=True,
            detail=str(exc),
        )
    return id_token


def _status_error(
    tool: str,
    resp: httpx.Response,
    *,
    forbidden: str,
    server_error: str,
    bad_gateway: str,
) -> dict:
    """What a tool returns for a non-2xx response from the calls API.

    The three messages that differ between the two tools are passed in rather
    than branched on here, so the sentence that stops a second phone call is
    readable inside the tool that needs it.
    """
    body = resp.text
    logger.error("%s: upstream returned %s: %s", tool, resp.status_code, body)
    try:
        upstream = resp.json()
    except Exception:
        upstream = body

    if resp.status_code == 403:
        return _error_response(
            "calls_disabled", forbidden, retryable=False,
            status_code=resp.status_code,
        )

    # 500 and 502 are the dangerous pair: on the POST path the call may
    # already have been placed, so neither message may invite a blind retry.
    if resp.status_code == 500:
        return _error_response(
            "upstream_error", server_error, retryable=False,
            status_code=resp.status_code, upstream=upstream,
        )

    if resp.status_code == 502:
        return _error_response(
            "upstream_error", bad_gateway, retryable=True,
            status_code=resp.status_code, upstream=upstream,
        )

    if resp.status_code == 503:
        return _error_response(
            "upstream_error",
            "The calling service is not configured or its access token has "
            "expired. Someone has to fix that on our end, so retrying will "
            "not help — use send_text so the student still gets the message.",
            retryable=False,
            status_code=resp.status_code, upstream=upstream,
        )

    if 500 <= resp.status_code < 600:
        return _error_response(
            "upstream_error",
            "The connector service returned a server error. It may be "
            "temporary — you may try again shortly.",
            retryable=True,
            status_code=resp.status_code, upstream=upstream,
        )

    # 4xx: the connector's own message is already descriptive prose aimed at a
    # reader (see the 404 and 409 detail strings in its calls router), so it
    # is forwarded as-is, matching send_text.
    if isinstance(upstream, dict):
        return upstream
    return _error_response(
        "upstream_error",
        "The connector service rejected the request.",
        retryable=False,
        status_code=resp.status_code, body=body,
    )


def call_student(goal: str, tool_context: ToolContext) -> dict:
    """Place a real phone call to the student and pursue a stated goal.

    Use this tool only as the LAST rung of the escalation ladder. Text first,
    always. A call is justified in exactly two situations: a deadline is about
    ten days away or closer AND your texts have gone unanswered, or the
    student explicitly asked to be called (a wake-up call before an exam, for
    example). Everything else is a text. The phone that rings is the student's
    own verified number and nobody else's — you cannot reach a registrar, a
    landlord, or any other third party from here, no matter how the goal is
    worded.

    Text the student a heads-up first ("calling you in a sec"). This tool
    blocks for a couple of minutes while the call is planned, and a phone
    ringing out of nowhere is alarming.

    The call is not over when this returns. You get back a `run_id` and
    `status: "started"`, which mean the call was submitted; the phone rings
    afterwards. Use `get_call_result` with that `run_id` to learn what
    happened, and never run `call_student` twice for the same goal — a second
    run is a second real phone ringing.

    Calls are for logistics only: reminders, confirmations, wake-up calls,
    checking whether something got done. Never give medical, legal, or
    financial advice on a call.

    If the response has `persisted: false`, the call WAS placed and the phone
    WILL ring, but the run was not recorded, so `get_call_result` will come
    back not-found for it. Do not wait on a summary that will never arrive,
    and do not call again. Send the student the information by text instead.

    If this fails, read `retryable` before doing anything. When it is false,
    calling again is not the repair — the call may already be happening. Send
    what you needed to say with `send_text`.

    Args:
        goal: What the call is for, written as an instruction to the person
            making the call, and carrying every concrete fact they need:
            names, dates, times, course codes, reference numbers, and what a
            good outcome looks like. The caller cannot come back to ask you
            anything once the call starts, so "remind them about the deadline"
            produces a much worse call than "remind them the CHEM 204 late-add
            petition is due Friday Sept 5 at 5pm and section 3 is still
            blank".
    """
    if not _CONNECTORS_API_URL:
        return _not_configured("call_student")

    user_id = _user_id(tool_context)
    id_token = _id_token_or_error("call_student")
    if isinstance(id_token, dict):
        return id_token

    try:
        resp = httpx.post(
            f"{_CONNECTORS_API_URL}/users/{user_id}/calls",
            json={"goal": goal},
            headers={"Authorization": f"Bearer {id_token}"},
            timeout=_START_CALL_TIMEOUT_S,
        )
    except httpx.TimeoutException as exc:
        # Deliberately NOT retryable, unlike every other network error here.
        # The connector spends up to ~150s planning before it answers, so a
        # timeout most likely means the request landed and the phone is about
        # to ring. Retrying would place a second real call.
        logger.error("call_student: request timed out: %s", exc)
        return _error_response(
            "network_error",
            "The call request timed out. The call may already have been "
            "placed and the student's phone may be ringing right now, so do "
            "NOT call again — use send_text to tell them what you needed to "
            "say.",
            retryable=False,
            detail=str(exc),
        )
    except httpx.RequestError as exc:
        logger.error("call_student: request failed: %s", exc)
        return _error_response(
            "network_error",
            "Could not reach the connector service, so no call was placed. "
            "The service may be temporarily unavailable — you may try again "
            "shortly.",
            retryable=True,
            detail=str(exc),
        )

    if resp.is_success:
        data = resp.json()
        run_id = data.get("run_id")
        if not data.get("persisted", True):
            # Usually a missing roles/datastore.user grant on the connector's
            # service account. Silent until someone looks, hence the warning.
            logger.warning(
                "call_student: call placed but not recorded (run_id=%s); "
                "its result cannot be polled",
                run_id,
            )
        logger.info(
            "call_student: call started for user %s (run_id=%s)",
            user_id, run_id,
        )
        return data

    return _status_error(
        "call_student",
        resp,
        forbidden=(
            "Calling is switched off for this student. Do not try to call "
            "them again — use send_text to tell them instead."
        ),
        server_error=(
            "The calling service hit a server error, and the call may already "
            "have been placed. Do NOT run call_student again: a retry places "
            "a second real phone call. Use send_text to tell the student what "
            "you needed to say."
        ),
        bad_gateway=(
            "The calling service is having trouble and the call may or may "
            "not have gone through. A retry can place a second real phone "
            "call, so prefer send_text unless the call is essential."
        ),
    )


def get_call_result(run_id: str, tool_context: ToolContext) -> dict:
    """Check how a phone call placed by `call_student` is going, or went.

    Use this after `call_student` returns, and expect to use it more than
    once. The call is not finished when `call_student` returns: the first
    result almost always comes back with `status: "PREPARING"`,
    `in_progress: true` and a `poll_after_seconds` (typically 10), while
    `summary`, `transcript` and `task_completed` are all null. That is normal,
    not a failure. Wait roughly `poll_after_seconds` seconds and check again.
    A call that gets answered usually finishes 60-90 seconds after
    `call_student` returned. Never run `call_student` again for a run that is
    still in progress — that places a second real phone call.

    Once `in_progress` is false the call is over, and what you text the
    student next depends on `task_completed`:

      - true: the student confirmed things on the call. Text a short summary
        of what was agreed, based on `summary`, so there is a written record
        they can scroll back to.
      - false: nobody answered, or the goal was not met. Do not call again —
        send the student the information by text instead.

    `transcript` is plain text and is safe to quote from if the student asks
    what was actually said.

    Args:
        run_id: The `run_id` that `call_student` returned, passed through
            exactly as you received it. It is an opaque string — never edit
            it, shorten it, or invent one.
    """
    if not _CONNECTORS_API_URL:
        return _not_configured("get_call_result")

    user_id = _user_id(tool_context)
    id_token = _id_token_or_error("get_call_result")
    if isinstance(id_token, dict):
        return id_token

    try:
        resp = httpx.get(
            f"{_CONNECTORS_API_URL}/users/{user_id}/calls/{run_id}",
            headers={"Authorization": f"Bearer {id_token}"},
            timeout=_REQUEST_TIMEOUT_S,
        )
    except httpx.RequestError as exc:
        # No timeout special case here: polling is a read, so retrying it is
        # free. Only call_student can turn a retry into a second phone call.
        logger.error("get_call_result: request failed: %s", exc)
        return _error_response(
            "network_error",
            "Could not reach the connector service to check the call. The "
            "service may be temporarily unavailable — you may try again "
            "shortly.",
            retryable=True,
            detail=str(exc),
        )

    if resp.is_success:
        return resp.json()

    # The one place this module does not forward a 4xx as-is. The connector's
    # own 404 detail names no cause and forbids nothing, and the model's most
    # natural repair for "not found" is to re-run call_student -- which rings
    # a phone that, in the persisted:false case, is ringing already.
    if resp.status_code == 404:
        logger.error("get_call_result: no run %s for user %s", run_id, user_id)
        return _error_response(
            "call_run_not_found",
            "There is no record of that call. Either it was placed but never "
            "recorded (the response to call_student would have said "
            "`persisted: false`), or that run_id belongs to someone else. "
            "Either way the call itself may be happening right now, so do NOT "
            "call again — send the student the information by text instead.",
            retryable=False,
            run_id=run_id,
        )

    return _status_error(
        "get_call_result",
        resp,
        forbidden=(
            "Calling is switched off for this student, so their calls cannot "
            "be read. Use send_text to reach them instead."
        ),
        server_error=(
            "The calling service hit a server error while reporting on this "
            "call. Do not place another call — use send_text to tell the "
            "student what you needed to say."
        ),
        bad_gateway=(
            "The calling service could not be reached to check on this call. "
            "You may try checking again shortly."
        ),
    )
