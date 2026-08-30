"""Phone calls (v0: CALL-E places the call, and only ever to the student).

WHO WE ARE ALLOWED TO DIAL
---------------------------
v0 dials exactly one number: the student's own, read from `phone_number` on
their users/{user_id} document. That number got there by a Firebase phone
sign-in, so it is SMS-verified -- the student proved they hold the handset
(see src/frontend/lib/users.ts).

The request body therefore has no phone field, and adding one later is not a
small change: a caller-supplied number is a number nobody verified, and this
service would become a way to make a stranger's phone ring. The agent asking
to call the registrar is a different feature with a different safety story,
not a parameter on this one. Nothing here infers or repairs a country code
either -- a guessed prefix is a call to a real person who did not consent.

WHAT LEAVES THIS SERVICE
-------------------------
The number is masked in every response and every log line (`_mask_phone`).
CALL-E's own payload carries far more than we return: the full unmasked
number at `result.extracted.to_phones`, and the student's name inside
`display_goal` and `result.extracted.goal`. So responses are built by
whitelisting fields out of that payload -- never by passing it through --
there is deliberately no `raw` field, and the payload is never written to
Firestore or a log line as-is. `activity` entries are projected down to four
keys for the same reason.

The confirm token that turns a plan into a placed call never reaches this
module at all; app/services/calle_mcp.py spends it and strips it. Nothing
here should undo that.

ERRORS
------
CalleNotConfigured / CalleAuthError (-> 503) and CalleUpstreamError (-> 502)
are handled app-wide in app/main.py, so they propagate from here untouched
and this router reads like the others. Only the HTTP errors specific to
calling -- 403, 404, 409 -- are raised here.
"""
import logging

from fastapi import APIRouter, HTTPException, Query
from google.cloud import firestore
from pydantic import BaseModel, Field

from app.services import calle_mcp
# The process-wide client, reused rather than a second one built here: one
# Firestore client per process is the pattern firestore_creds already sets
# (lazy, thread-safe, Cloud Run friendly), and it is also the seam the tests
# swap.
from app.services.firestore_creds import USERS_COLLECTION, _firestore_client

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/users/{user_id}/calls", tags=["calls"])

CALL_RUNS_SUBCOLLECTION = "call_runs"
# The dashboard switch that turns calling off. Absent means allowed: the
# switch ships after this endpoint, and an older user document must not read
# as "denied" (see data/access.ts on the frontend).
CALLS_ACCESS_KEY = "calls"

# CALL-E says "keep polling" by naming this action on next_step; it is the
# only signal that distinguishes a live call from a finished one.
_POLL_ACTION = "poll_get_call_run"

# Everything we are willing to return from an activity entry. A projection,
# not a blocklist: a new field CALL-E adds tomorrow is dropped by default
# rather than leaked by default.
_ACTIVITY_FIELDS = ("ts", "level", "kind", "message")

_MASK_VISIBLE_DIGITS = 4
_MASK_CHAR = "\u2022"  # bullet; escaped so this file stays ASCII


def _mask_phone(phone: str) -> str:
    """Mask a number down to its "+" and its last four digits.

    "+15145550123" becomes a "+", seven bullets, then "0123".

    Four digits is enough for a student to recognise their own number and
    not enough to dial it.
    """
    digits = "".join(ch for ch in phone if ch.isdigit())
    if len(digits) <= _MASK_VISIBLE_DIGITS:
        # Too short to mask meaningfully -- show nothing rather than most of it.
        return _MASK_CHAR * len(digits)
    hidden = _MASK_CHAR * (len(digits) - _MASK_VISIBLE_DIGITS)
    return f"+{hidden}{digits[-_MASK_VISIBLE_DIGITS:]}"


def _user_doc(user_id: str) -> dict:
    """The users/{user_id} document, or a 404 in the API's usual wording."""
    snapshot = (
        _firestore_client()
        .collection(USERS_COLLECTION)
        .document(user_id)
        .get()
    )
    if not snapshot.exists:
        raise HTTPException(
            404,
            f"No user document for user_id={user_id!r}. The user_id must be "
            "the Firebase UID, and the student must have completed onboarding.",
        )
    return snapshot.to_dict() or {}


def _call_runs(user_id: str):
    """users/{user_id}/call_runs -- this service's own record of each call."""
    return (
        _firestore_client()
        .collection(USERS_COLLECTION)
        .document(user_id)
        .collection(CALL_RUNS_SUBCOLLECTION)
    )


def _calls_allowed(user: dict) -> bool:
    """False only for an explicit access.calls == false."""
    access = user.get("access")
    if isinstance(access, dict) and access.get(CALLS_ACCESS_KEY) is False:
        return False
    return True


def _sanitized_activity(entries: object) -> list[dict]:
    """Each activity entry cut down to {ts, level, kind, message}."""
    if not isinstance(entries, list):
        return []
    return [
        {key: entry[key] for key in _ACTIVITY_FIELDS if key in entry}
        for entry in entries
        if isinstance(entry, dict)
    ]


def _as_dict(value: object) -> dict:
    """CALL-E nests deeply and every level is absent mid-call."""
    return value if isinstance(value, dict) else {}


class CallIn(BaseModel):
    goal: str = Field(
        ...,
        min_length=8,
        description=(
            "What the call is for, in plain language, carrying every concrete "
            "fact the caller needs: names, dates, course codes, reference "
            "numbers, and what a good outcome is. CALL-E cannot ask us "
            "anything once the call starts, so a goal that says 'ask about my "
            "registration' produces a worse call than one that says 'ask "
            "whether the late-add petition for CHEM 204, submitted Aug 24 "
            "under student number 30112233, has been approved'."
        ),
    )
    language: str | None = Field(None, description="BCP-47, e.g. 'en-CA'.")
    region: str | None = Field(None, description="ISO country, e.g. 'CA'.")


class CallStartedResponse(BaseModel):
    run_id: str
    status: str = "started"
    to_phone_masked: str = Field(
        ..., description="The student's own number, masked."
    )


class CallRunResponse(BaseModel):
    """One call run, whitelisted out of CALL-E's payload.

    Everything below the first two fields is null or empty while the call is
    still running, and fills in once it finishes.
    """
    run_id: str
    status: str = Field(..., description="CALL-E's uppercase state, e.g. COMPLETED.")
    in_progress: bool = Field(
        ..., description="Derived: CALL-E is still asking to be polled."
    )
    poll_after_seconds: int | None = Field(
        None, description="How long CALL-E asks us to wait before polling again."
    )
    message: str | None = None
    summary: str | None = None
    task_completed: bool | None = None
    confidence: float | None = Field(
        None, description="CALL-E's completion confidence, 0..1."
    )
    evidence: list[str] = Field(default_factory=list)
    transcript: str | None = None
    duration_seconds: int | None = None
    activity: list[dict] = Field(
        default_factory=list, description="Projected to {ts, level, kind, message}."
    )
    next_cursor: str | None = None


class CallSummary(BaseModel):
    run_id: str
    goal: str | None = None
    status: str | None = None
    to_phone_masked: str | None = None


class CallListResponse(BaseModel):
    calls: list[CallSummary]
    count: int


def _call_run_response(run_id: str, payload: dict) -> CallRunResponse:
    """Whitelist CALL-E's payload down to what we are willing to return.

    Field by field on purpose. The payload also contains the student's full
    number (result.extracted.to_phones) and their name (display_goal,
    result.extracted.goal); none of it is copied here, and there is no
    passthrough field through which it could escape.
    """
    result = _as_dict(payload.get("result"))
    outcome = _as_dict(result.get("outcome"))
    next_step = _as_dict(payload.get("next_step"))
    confidence = _as_dict(outcome.get("completion_confidence"))
    calling = _as_dict(_as_dict(result.get("extracted")).get("calling"))
    evidence = outcome.get("evidence")
    transcript = result.get("transcript")

    return CallRunResponse(
        run_id=payload.get("run_id") or run_id,
        status=str(payload.get("status") or "UNKNOWN"),
        in_progress=next_step.get("action") == _POLL_ACTION,
        poll_after_seconds=next_step.get("poll_after_seconds"),
        message=payload.get("message"),
        summary=result.get("summary"),
        task_completed=outcome.get("task_completed"),
        confidence=confidence.get("score"),
        evidence=[e for e in evidence if isinstance(e, str)]
        if isinstance(evidence, list)
        else [],
        transcript=transcript if isinstance(transcript, str) else None,
        duration_seconds=calling.get("duration_seconds"),
        activity=_sanitized_activity(payload.get("activity")),
        next_cursor=payload.get("next_cursor"),
    )


@router.post("", status_code=201, response_model=CallStartedResponse)
def start_call(user_id: str, call: CallIn):
    """Call the student on their own SMS-verified number and pursue `goal`.

    There is no phone number in the request: v0 only ever dials the number on
    the student's own user document. See this module's docstring for why.

    Planning is slow -- CALL-E can take around 150 seconds before it accepts
    the run -- so callers need a generous client timeout. A 201 means the run
    was submitted, not that the call is over: the phone rings asynchronously,
    and `GET /users/{user_id}/calls/{run_id}` is how the outcome arrives.
    """
    user = _user_doc(user_id)
    if not _calls_allowed(user):
        raise HTTPException(
            403,
            "Calling is turned off for this student. They can turn it back on "
            "from the dashboard.",
        )

    phone = user.get("phone_number")
    if not isinstance(phone, str) or not phone.strip():
        raise HTTPException(
            409,
            "This student has no verified phone number, so there is nothing to "
            "call. It is set by the phone sign-in step of onboarding.",
        )

    phone = phone.strip()
    masked = _mask_phone(phone)
    started = calle_mcp.start_call(
        phone, call.goal, language=call.language, region=call.region
    )
    run_id = started["run_id"]

    _call_runs(user_id).document(run_id).set(
        {
            "run_id": run_id,
            "plan_id": started.get("plan_id"),
            "goal": call.goal,
            "status": "started",
            "to_phone_masked": masked,
            "created_at": firestore.SERVER_TIMESTAMP,
        }
    )

    # Masked here as everywhere else: a log line is a place the number leaks
    # from just as readily as a response body.
    logger.info(
        "call started (user_id=%s, run_id=%s, to=%s)", user_id, run_id, masked
    )
    return CallStartedResponse(run_id=run_id, to_phone_masked=masked)


@router.get("/{run_id}", response_model=CallRunResponse)
def get_call_run(
    user_id: str,
    run_id: str,
    cursor: str | None = Query(None, description="Activity cursor from a previous page."),
    limit: int | None = Query(None, ge=1, le=100, description="Activity entries per page."),
):
    """Status, outcome and transcript for one call.

    Poll this while `in_progress` is true, waiting `poll_after_seconds`
    between calls. The outcome fields are null until the call ends.
    """
    # Ownership first, and before CALL-E is touched: a run_id belonging to
    # another student must be indistinguishable from one that never existed.
    doc_ref = _call_runs(user_id).document(run_id)
    if not doc_ref.get().exists:
        raise HTTPException(
            404, f"No call run {run_id!r} for user_id={user_id!r}."
        )

    payload = calle_mcp.get_call_run(run_id, cursor=cursor, limit=limit)
    response = _call_run_response(run_id, payload)

    # Terminal state onto our own document, so the dashboard can render a
    # finished call without going back to CALL-E for it.
    doc_ref.set(
        {
            "status": response.status,
            "summary": response.summary,
            "task_completed": response.task_completed,
            "duration_seconds": response.duration_seconds,
            "last_checked_at": firestore.SERVER_TIMESTAMP,
        },
        merge=True,
    )
    return response


@router.get("", response_model=CallListResponse)
def list_calls(user_id: str, max_results: int = Query(10, le=50)):
    """This student's calls, most recent first."""
    _user_doc(user_id)  # 404 for an unknown user, like every other endpoint

    snapshots = (
        _call_runs(user_id)
        .order_by("created_at", direction=firestore.Query.DESCENDING)
        .limit(max_results)
        .stream()
    )
    calls = []
    for snapshot in snapshots:
        doc = snapshot.to_dict() or {}
        calls.append(CallSummary(
            run_id=doc.get("run_id") or snapshot.id,
            goal=doc.get("goal"),
            status=doc.get("status"),
            to_phone_masked=doc.get("to_phone_masked"),
        ))
    return CallListResponse(calls=calls, count=len(calls))
