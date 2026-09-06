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
from urllib.parse import quote, unquote

from fastapi import APIRouter, HTTPException, Query
from google.cloud import firestore
from google.cloud.firestore_v1.base_query import FieldFilter
from pydantic import BaseModel, Field

from app.services import calle_mcp
# The process-wide client, reused rather than a second one built here: one
# Firestore client per process is the pattern firestore_creds already sets
# (lazy, thread-safe, Cloud Run friendly), and it is also the seam the tests
# swap.
from app.services.firestore_creds import USERS_COLLECTION, _firestore_client

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/users/{user_id}/calls", tags=["calls"])

# Top-level, not a subcollection under the user. Ownership therefore is
# not implied by the document path any more -- it is the `user_id` field
# on each document, and every read has to check it (see `_owned_run`).
CALL_RUNS_COLLECTION = "call_runs"
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


def _run_document_id(run_id: str) -> str:
    """The Firestore document id for a CALL-E run id.

    Defensive, not corrective. Every run id CALL-E has actually been observed
    to return is base64url -- `wMXbZkrDQ-UoPcJPxTw_5A` -- which is already a
    valid document id and passes through `quote` completely unchanged. So
    this is a no-op on real traffic today, and documents keep the ids they
    already have.

    It exists because a document id cannot contain "/": the client raises
    `ValueError: A document must have an even number of path elements`, and a
    run id is an opaque string from a service we do not control. Validating
    it here costs nothing and keeps one class of upstream change from
    reaching Firestore as a crash.

    `quote` is injective, so two run ids can never collide on one document.
    The true run id is stored as a field regardless, and it is the field,
    never the document id, that is returned to callers and sent to CALL-E.
    """
    return quote(run_id, safe="")


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


def _call_runs():
    """The top-level call_runs collection -- one document per placed call.

    Every document carries a `user_id` field naming its owner. That field is
    the only thing that ties a run to a student now, so nothing may read a
    run without checking it.
    """
    return _firestore_client().collection(CALL_RUNS_COLLECTION)


def _owned_run(user_id: str, run_id: str):
    """The run's document reference, or a 404 if it is not this student's.

    Ownership used to be implied by the document's position under the user;
    in a top-level collection it has to be checked explicitly against the
    stored `user_id`.

    A run belonging to someone else answers exactly as one that never
    existed: same 404, same message. Not a 403 -- distinguishing the two
    would confirm that a run id is real, which is precisely what someone
    guessing ids is trying to learn.
    """
    doc_ref = _call_runs().document(_run_document_id(run_id))
    snapshot = doc_ref.get()
    if not snapshot.exists or (snapshot.to_dict() or {}).get("user_id") != user_id:
        raise HTTPException(
            404, f"No call run {run_id!r} for user_id={user_id!r}."
        )
    return doc_ref


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
            "What the call is for, written as an instruction to the person "
            "making the call, and carrying every concrete fact they need: "
            "names, dates, course codes, reference numbers, and what a "
            "good outcome is. The caller cannot come back to ask "
            "anything once the call starts, so a goal that says 'ask about my "
            "registration' produces a worse call than one that says 'ask "
            "whether the late-add petition for CHEM 204, submitted Aug 24 "
            "under student number 30112233, has been approved'."
        ),
    )
    language: str | None = Field(None, description="BCP-47, e.g. 'en-CA'.")
    region: str | None = Field(None, description="ISO country, e.g. 'CA'.")


class CallStartedResponse(BaseModel):
    run_id: str = Field(
        ...,
        description=(
            "The handle for this call. Pass it to GET /calls/{run_id} to find "
            "out what happened. It is an opaque string -- keep it exactly as "
            "given. Losing it means a call that cannot be followed up."
        ),
    )
    status: str = Field(
        "started",
        description=(
            "Always 'started'. It means the run was submitted, NOT that the "
            "call has happened yet -- the phone rings afterwards."
        ),
    )
    to_phone_masked: str = Field(
        ..., description="The student's own number, masked."
    )
    persisted: bool = Field(
        True,
        description=(
            "False when the call was placed but this service could not record "
            "it. The call is real, the phone will still ring, and `run_id` is "
            "still valid at CALL-E; what is missing is our own call_runs "
            "document, so GET /calls/{run_id} will 404 for this run and it "
            "will not appear in GET /calls. Its outcome can therefore never "
            "be polled -- send the student the information directly instead "
            "of waiting for a summary. Do NOT place the call again: it is "
            "already happening. Treat false as 'the call is happening but we "
            "lost our copy of the paperwork', never as a failure to call."
        ),
    )


class CallRunResponse(BaseModel):
    """One call run, whitelisted out of CALL-E's payload.

    Everything below the first two fields is null or empty while the call is
    still running, and fills in once it finishes.
    """
    run_id: str
    status: str = Field(..., description="CALL-E's uppercase state, e.g. COMPLETED.")
    in_progress: bool = Field(
        ...,
        description=(
            "True while the call is still going and CALL-E is still asking to "
            "be polled. Poll this endpoint again rather than starting another "
            "call -- starting one places a second real phone call."
        ),
    )
    poll_after_seconds: int | None = Field(
        None,
        description=(
            "Roughly how long to wait before polling again, in seconds "
            "(typically 10). Null once the call is over."
        ),
    )
    message: str | None = Field(
        None, description="CALL-E's own human-readable status line, if any."
    )
    summary: str | None = Field(
        None,
        description=(
            "What the call achieved, in prose. Null until the call ends. This "
            "is the right basis for the follow-up text to the student."
        ),
    )
    task_completed: bool | None = Field(
        None,
        description=(
            "Whether the goal was met, once the call is over; null while it "
            "is still running. True means the student engaged and the goal "
            "was met. False means nobody answered or the goal was not met -- "
            "send the information by text instead, and do not call again."
        ),
    )
    confidence: float | None = Field(
        None, description="CALL-E's confidence in `task_completed`, 0..1."
    )
    evidence: list[str] = Field(
        default_factory=list,
        description=(
            "Quotes or facts supporting the outcome. Empty until the call ends."
        ),
    )
    transcript: str | None = Field(
        None,
        description=(
            "Plain-text transcript of the call, safe to quote from. Null until "
            "the call ends."
        ),
    )
    duration_seconds: int | None = Field(
        None, description="How long the call lasted. Null until it ends."
    )
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
    """Place a real phone call to the student and pursue `goal`.

    This rings an actual phone. It cannot be taken back, and it costs money
    every time.

    There is no phone number in the request: v0 only ever dials the number on
    the student's own user document, which they verified by SMS. There is no
    way to reach anyone else from here, however `goal` is worded.

    Planning is slow -- CALL-E can take around 150 seconds before it accepts
    the run -- so callers need a generous client timeout.

    **A 201 does not mean the call is over.** It means the run was submitted;
    the phone rings afterwards. Poll
    `GET /users/{user_id}/calls/{run_id}` for what actually happened.

    **Never call this twice for the same goal.** A run that is still in
    progress is not a failed run, and repeating this request places a SECOND
    real phone call to the student rather than retrying the first. If a
    response was lost or the request timed out, poll the run or
    `GET /users/{user_id}/calls` to find it -- do not re-post.
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

    # By the time we get here the phone has already rung and the budget is
    # already spent, so nothing below may raise. Recording the run is
    # bookkeeping; the run_id is the only handle that exists for a call the
    # student is living through right now, and losing it to a failed write
    # would be the worst outcome available here.
    #
    # Deliberately broad: it is not worth enumerating which Firestore failure
    # modes are worth keeping the run_id for. They all are. (The first one we
    # actually hit was a PermissionDenied -- this service was read-only until
    # calls shipped, and its service account had roles/datastore.viewer.)
    #
    # The consequence, accepted knowingly: an unpersisted run has no
    # call_runs document, so GET /calls/{run_id} will 404 for it --
    # ownership is checked against Firestore, and a run we cannot prove
    # belongs to this student must not be readable by them. The caller still
    # holds the run_id and `persisted: false` says why. A later 404 is a much
    # smaller harm than never learning the id of a call that is happening.
    persisted = True
    try:
        _call_runs().document(_run_document_id(run_id)).set(
            {
                "run_id": run_id,
                # The owner. In a top-level collection this field is the only
                # thing that makes the run this student's, so a run written
                # without it is unreadable by anyone.
                "user_id": user_id,
                "plan_id": started.get("plan_id"),
                "goal": call.goal,
                "status": "started",
                "to_phone_masked": masked,
                "created_at": firestore.SERVER_TIMESTAMP,
            }
        )
    except Exception:  # noqa: BLE001 -- see above; the run_id must survive
        persisted = False
        # exception() keeps the traceback, which is what identifies an IAM
        # problem. Masked number only, as everywhere else.
        logger.exception(
            "call placed but not recorded (user_id=%s, run_id=%s, to=%s); "
            "the run is live and pollable at CALL-E but will 404 here",
            user_id,
            run_id,
            masked,
        )
    else:
        # Masked here as everywhere else: a log line is a place the number
        # leaks from just as readily as a response body.
        logger.info(
            "call started (user_id=%s, run_id=%s, to=%s)", user_id, run_id, masked
        )

    return CallStartedResponse(
        run_id=run_id, to_phone_masked=masked, persisted=persisted
    )


@router.get("/{run_id}", response_model=CallRunResponse)
def get_call_run(
    user_id: str,
    run_id: str,
    cursor: str | None = Query(None, description="Activity cursor from a previous page."),
    limit: int | None = Query(None, ge=1, le=100, description="Activity entries per page."),
):
    """Status, outcome and transcript for one call.

    The first poll after starting a call almost always comes back with
    `status: "PREPARING"`, `in_progress: true` and a `poll_after_seconds`
    (typically 10), while `summary`, `transcript` and `task_completed` are
    still null. That is the normal beginning of a call, not a failure.

    Poll again while `in_progress` is true, waiting about
    `poll_after_seconds` between attempts. An answered call usually finishes
    within 60-90 seconds of the run being submitted. **Never re-post to
    `POST /users/{user_id}/calls` for a run that is still in progress** --
    that places a second real phone call.

    Once `in_progress` is false the call is over, and `task_completed` says
    how it went: true means the student engaged and the goal was met (use
    `summary`), false means nobody answered or the goal was not met, in which
    case send the information by text rather than calling again.

    A `404` here means this service has no record of the run -- either it
    belongs to another student, or the call was placed but never recorded
    (`persisted: false` on the original response). In neither case should the
    call be repeated.
    """
    # Ownership first, and before CALL-E is touched: a run_id belonging to
    # another student must be indistinguishable from one that never existed.
    doc_ref = _owned_run(user_id, run_id)

    payload = calle_mcp.get_call_run(run_id, cursor=cursor, limit=limit)
    response = _call_run_response(run_id, payload)

    # Terminal state onto our own document, so the dashboard can render a
    # finished call without going back to CALL-E for it.
    #
    # Non-fatal for the same reason the write in start_call is: this is a
    # cache of something the caller is already holding. Failing the request
    # would throw away the live status we just fetched in order to report
    # that we could not memoise it, which serves nobody.
    try:
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
    except Exception:  # noqa: BLE001 -- a cache miss must not fail the read
        logger.exception(
            "could not cache call status (user_id=%s, run_id=%s); "
            "returning CALL-E's answer anyway",
            user_id,
            run_id,
        )
    return response


@router.get("", response_model=CallListResponse)
def list_calls(user_id: str, max_results: int = Query(10, le=50)):
    """This student's calls, most recent first."""
    _user_doc(user_id)  # 404 for an unknown user, like every other endpoint

    # REQUIRES A FIRESTORE COMPOSITE INDEX on the call_runs collection:
    #   user_id ASCENDING, created_at DESCENDING
    # Firestore auto-creates single-field indexes but not composite ones, and
    # this query filters on one field while ordering by another. The previous
    # subcollection version needed no index at all -- it was a single-field
    # sort within one user's own subcollection. Without the index this raises
    # FailedPrecondition ("The query requires an index") the FIRST time it
    # runs against real Firestore; the error carries a console link that
    # creates it. Nothing here will catch that at build or test time.
    snapshots = (
        _call_runs()
        .where(filter=FieldFilter("user_id", "==", user_id))
        .order_by("created_at", direction=firestore.Query.DESCENDING)
        .limit(max_results)
        .stream()
    )
    calls = []
    for snapshot in snapshots:
        doc = snapshot.to_dict() or {}
        calls.append(CallSummary(
            run_id=doc.get("run_id") or unquote(snapshot.id),
            goal=doc.get("goal"),
            status=doc.get("status"),
            to_phone_masked=doc.get("to_phone_masked"),
        ))
    return CallListResponse(calls=calls, count=len(calls))
