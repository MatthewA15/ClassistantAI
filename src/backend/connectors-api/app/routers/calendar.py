"""Google Calendar connector (P1: list events, create events; P2: edit and delete).

The edit and delete endpoints are guarded the same way `send_draft` is:
the agent echoes back the event's current summary and the student's
confirmation, and a stale echo is a `409` with no write performed.
"""
from datetime import datetime, timezone
from fastapi import APIRouter, HTTPException, Query
from googleapiclient.errors import HttpError
from pydantic import BaseModel, Field

from app.routers._guardrails import FieldMismatch, MismatchResponse, reject_bulk_id
from app.services.google_creds import service_for_user

DEFAULT_TIMEZONE = "America/Toronto"

router = APIRouter(prefix="/users/{user_id}/calendar", tags=["calendar"])


class EventStartEnd(BaseModel):
    """Google Calendar start/end block (dateTime or date + optional timeZone)."""
    date: str | None = Field(None, description="All-day date (yyyy-MM-dd).")
    date_time: str | None = Field(
        None, alias="dateTime", description="RFC3339 timestamp.")
    time_zone: str | None = Field(
        None, alias="timeZone", description="IANA tz, e.g. America/Toronto.")

    model_config = {"populate_by_name": True}


class CalendarEvent(BaseModel):
    id: str
    summary: str | None = None
    description: str | None = None
    start: EventStartEnd | None = None
    end: EventStartEnd | None = None
    location: str | None = None
    html_link: str | None = Field(
        None, alias="htmlLink", description="Link to the event in Calendar UI.")

    model_config = {"populate_by_name": True}


class EventListResponse(BaseModel):
    events: list[CalendarEvent]
    count: int


@router.get("/events", response_model=EventListResponse)
def list_events(
    user_id: str,
    time_min: str | None = Query(None, description="RFC3339, defaults to now"),
    time_max: str | None = Query(None, description="RFC3339"),
    max_results: int = Query(25, le=100),
):
    """List upcoming primary-calendar events, expanding recurring series into individual instances sorted by start time.

    Because series are expanded, an `id` returned here is often an INSTANCE
    id of a recurring event (it looks like "seriesid_20260908T140000Z"), not
    the series itself. Read the edit/delete endpoints before acting on one.
    """
    svc = service_for_user(user_id, "calendar", "v3")
    resp = svc.events().list(
        calendarId="primary",
        timeMin=time_min or datetime.now(timezone.utc).isoformat(),
        timeMax=time_max,
        maxResults=max_results,
        singleEvents=True,
        orderBy="startTime",
    ).execute()
    events = [CalendarEvent.model_validate(e) for e in resp.get("items", [])]
    return EventListResponse(events=events, count=len(events))


class EventIn(BaseModel):
    summary: str
    start: str            # RFC3339, e.g. "2026-08-25T14:00:00-04:00"
    end: str
    description: str | None = None
    location: str | None = None
    timezone: str = DEFAULT_TIMEZONE
    recurrence: list[str] | None = Field(
        None,
        description=("Google-format RRULE strings, e.g. "
                     "['RRULE:FREQ=WEEKLY;BYDAY=TU,TH;UNTIL=20261215T000000Z']. "
                     "Omit for a one-off event."))


class EventCreatedResponse(BaseModel):
    event_id: str
    html_link: str | None = Field(
        None, description="Link to the created event.")
    status: str = "created"


@router.post("/events", status_code=201, response_model=EventCreatedResponse)
def create_event(user_id: str, event: EventIn):
    """Create a new event on the user's primary calendar (e.g. a syllabus deadline or exam date).

    For something that repeats -- a weekly lecture, lab or tutorial -- pass
    `recurrence` as Google RRULE strings, e.g.
    ["RRULE:FREQ=WEEKLY;BYDAY=TU,TH;UNTIL=20261215T000000Z"],
    with `start`/`end` describing the FIRST occurrence. That creates one
    recurring series the student can later move or cancel as a whole,
    rather than a dozen unrelated events.
    """
    svc = service_for_user(user_id, "calendar", "v3")
    body = {
        "summary": event.summary,
        "description": event.description,
        "location": event.location,
        "start": {"dateTime": event.start, "timeZone": event.timezone},
        "end": {"dateTime": event.end, "timeZone": event.timezone},
    }
    if event.recurrence:
        body["recurrence"] = event.recurrence
    created = svc.events().insert(calendarId="primary", body=body).execute()
    return EventCreatedResponse(event_id=created["id"], html_link=created.get("htmlLink"))


class EventPatchIn(BaseModel):
    """A partial edit: every editable field is optional, only what you send is changed.

    `user_confirmation` and `expected_summary` are the guardrail and are always
    required -- see the endpoint docstring.
    """
    summary: str | None = Field(None, description="New title for the event.")
    start: str | None = Field(
        None, description="New start, RFC3339, e.g. '2026-09-08T14:00:00-04:00'.")
    end: str | None = Field(
        None, description="New end, RFC3339, e.g. '2026-09-08T15:00:00-04:00'.")
    description: str | None = Field(
        None, description="New description (the event's notes).")
    location: str | None = Field(None, description="New location.")
    timezone: str | None = Field(
        None, description="IANA tz applied to `start`/`end`; ignored on its own.")
    recurrence: list[str] | None = Field(
        None,
        description=("Google-format RRULE strings, e.g. "
                     "['RRULE:FREQ=WEEKLY;BYDAY=TU,TH;UNTIL=20261215T000000Z']. "
                     "Only meaningful on a series master, not on a single instance."))
    user_confirmation: str = Field(
        ..., description="The user's confirmation message (e.g. 'yes, move it to 3pm'). Must be non-empty.")
    expected_summary: str = Field(
        ..., description="The event's summary as you currently believe it to be. A mismatch is a 409.")


class EventUpdatedResponse(BaseModel):
    event_id: str
    html_link: str | None = Field(
        None, description="Link to the event in the Calendar UI.")
    status: str = "updated"
    changed_fields: list[str] = Field(
        default_factory=list, description="The field names actually sent to Google.")
    is_recurring_instance: bool = Field(
        False, description="True if the id edited was ONE occurrence of a recurring series.")
    is_series_master: bool = Field(
        False, description="True if the id edited was the series itself -- the edit applies to EVERY occurrence.")
    recurring_event_id: str | None = Field(
        None, description="The series id, when the event edited was one of its instances.")


class EventMismatchResponse(MismatchResponse):
    """409 body for the guarded event endpoints."""
    detail: str = Field(default="Event content mismatch.",
                        description="Summary of the mismatch.")


def _reject_bulk(event_id: str) -> None:
    return reject_bulk_id(
        event_id, "One event_id per request; bulk edits and deletes are not supported.")


def _fetch_event(svc, event_id: str) -> dict:
    try:
        return svc.events().get(calendarId="primary", eventId=event_id).execute()
    except HttpError as e:
        if e.resp.status == 404:
            raise HTTPException(404, f"Event {event_id} not found")
        raise


def _check_summary(event: dict, expected_summary: str) -> None:
    """409 unless the agent's picture of the event still matches Google's."""
    current = event.get("summary") or ""
    if expected_summary != current:
        raise HTTPException(
            409,
            detail=EventMismatchResponse(mismatches=[FieldMismatch(
                field="summary", expected=current, got=expected_summary,
            )]).model_dump(),
        )


@router.patch("/events/{event_id}", response_model=EventUpdatedResponse,
              responses={409: {"model": EventMismatchResponse, "description": "Event content mismatch."}})
def patch_event(user_id: str, event_id: str, payload: EventPatchIn):
    """Edit one existing event in place -- only the fields you send are changed, everything else is left as it is.

    Always send `expected_summary` (the event's summary as you believe it to
    be) and `user_confirmation` (what the student said when they approved this
    edit). If `expected_summary` doesn't match what Google holds, nothing is
    changed and you get a 409 naming the real summary: re-read the event and
    re-confirm with the student instead of retrying.

    Omit a field to leave it alone -- sending `null` is not how you clear a
    field, and sending the whole event back is not how you change one thing.
    `timezone` only takes effect alongside `start` or `end`; on its own it
    changes nothing. At least one editable field is required.

    RECURRING EVENTS -- read before editing one. `list_events` expands
    series, so the ids it returns are usually INSTANCE ids of a recurring
    event ("seriesid_20260908T140000Z"). Patching an instance id changes
    ONE occurrence; patching the bare series id (the part before the
    underscore, also returned here as `recurring_event_id`) changes EVERY
    occurrence. These are different edits and you cannot tell which the
    student wants from the request alone -- ask them ("just this Tuesday,
    or every week?") and act on their answer. `recurrence` itself is only
    meaningful on the series master.

    The response reports `is_recurring_instance`, `is_series_master` and
    `recurring_event_id` for what you actually touched, so tell the student
    which of the two happened.

    One event per call: an `event_id` containing a comma or whitespace is
    rejected, so ask the student one edit at a time rather than batching.
    """
    if not payload.user_confirmation.strip():
        raise HTTPException(400, "Confirmation message is required to edit.")
    _reject_bulk(event_id)

    svc = service_for_user(user_id, "calendar", "v3")
    event = _fetch_event(svc, event_id)
    _check_summary(event, payload.expected_summary)

    # events.patch is a true partial update: send only what the caller named,
    # so a field the agent never mentioned is never overwritten.
    provided = payload.model_fields_set
    tz = payload.timezone or DEFAULT_TIMEZONE
    body: dict = {}
    if "summary" in provided:
        body["summary"] = payload.summary
    if "description" in provided:
        body["description"] = payload.description
    if "location" in provided:
        body["location"] = payload.location
    if "start" in provided:
        body["start"] = {"dateTime": payload.start, "timeZone": tz}
    if "end" in provided:
        body["end"] = {"dateTime": payload.end, "timeZone": tz}
    if "recurrence" in provided:
        body["recurrence"] = payload.recurrence
    if not body:
        raise HTTPException(
            400,
            "No editable fields provided; send at least one of "
            "summary, start, end, description, location, recurrence "
            "(`timezone` applies to start/end and changes nothing alone).",
        )

    updated = svc.events().patch(
        calendarId="primary", eventId=event_id, body=body).execute()
    # Report what was actually touched: an instance edit and a series edit
    # look identical from the request, and the student needs to be told
    # which one happened. Read the patched copy first -- a patch that *adds*
    # recurrence only shows there -- then fall back to the event as fetched.
    recurring_event_id = updated.get(
        "recurringEventId") or event.get("recurringEventId")
    return EventUpdatedResponse(
        event_id=updated.get("id", event_id),
        html_link=updated.get("htmlLink"),
        changed_fields=list(body),
        is_recurring_instance=bool(recurring_event_id),
        is_series_master=bool(updated.get("recurrence")
                              or event.get("recurrence")),
        recurring_event_id=recurring_event_id,
    )


class EventDeleteIn(BaseModel):
    """The guardrail, and nothing else -- a delete has no editable fields.

    Sent in the JSON body of the DELETE request.
    """
    user_confirmation: str = Field(
        ..., description="The user's confirmation message (e.g. 'yes, cancel it'). Must be non-empty.")
    expected_summary: str = Field(
        ..., description="The event's summary as you currently believe it to be. A mismatch is a 409.")


class DeletedEvent(BaseModel):
    """What was removed, captured before the delete -- the record the student gets."""
    id: str
    summary: str | None = None
    start: EventStartEnd | None = None
    end: EventStartEnd | None = None
    location: str | None = None
    is_recurring_instance: bool = Field(
        False, description="True if what was deleted was ONE occurrence of a recurring series.")
    is_series_master: bool = Field(
        False, description="True if what was deleted was the series itself -- EVERY occurrence is gone.")
    recurring_event_id: str | None = Field(
        None, description="The series id, when the event deleted was one of its instances.")


class EventDeletedResponse(BaseModel):
    status: str = "deleted"
    deleted_event: DeletedEvent = Field(
        ..., description="The event as it was immediately before deletion.")


@router.delete("/events/{event_id}", response_model=EventDeletedResponse,
               responses={409: {"model": EventMismatchResponse, "description": "Event content mismatch."}})
def delete_event(user_id: str, event_id: str, payload: EventDeleteIn):
    """Delete one existing event from the user's primary calendar. This cannot be undone.

    Send `expected_summary` (the event's summary as you believe it to be) and
    `user_confirmation` (what the student said when they approved this
    deletion) in the JSON body. If `expected_summary` doesn't match what Google
    holds, nothing is deleted and you get a 409 naming the real summary --
    you are looking at a stale read, so re-read the event and re-confirm with
    the student rather than retrying.

    RECURRING EVENTS -- read before deleting one. `list_events` expands series,
    so the ids it returns are usually INSTANCE ids of a recurring event
    ("seriesid_20260908T140000Z"). Deleting an instance id cancels ONE
    occurrence; deleting the bare series id (the part before the underscore)
    removes EVERY occurrence for the term, in one irreversible call. Ask the
    student which they mean -- "just next Tuesday's class, or the whole
    series?" -- and act only on their answer.

    The response returns `deleted_event`: what the event was immediately
    before it was removed, including `is_recurring_instance`,
    `is_series_master` and `recurring_event_id`. Relay it to the student as
    the record of what is gone; nothing else records it.

    One event per call: an `event_id` containing a comma or whitespace is
    rejected. There is no bulk delete, deliberately.
    """
    if not payload.user_confirmation.strip():
        raise HTTPException(400, "Confirmation message is required to delete.")
    _reject_bulk(event_id)

    svc = service_for_user(user_id, "calendar", "v3")
    event = _fetch_event(svc, event_id)
    _check_summary(event, payload.expected_summary)

    # Capture it first: after the delete there is nowhere left to read this
    # from, and the student is owed a record of what was cancelled.
    recurring_event_id = event.get("recurringEventId")
    deleted = DeletedEvent(
        id=event.get("id", event_id),
        summary=event.get("summary"),
        start=event.get("start"),
        end=event.get("end"),
        location=event.get("location"),
        is_recurring_instance=bool(recurring_event_id),
        is_series_master=bool(event.get("recurrence")),
        recurring_event_id=recurring_event_id,
    )

    svc.events().delete(calendarId="primary", eventId=event_id).execute()
    return EventDeletedResponse(deleted_event=deleted)
