"""Google Calendar connector (P1: list calendars, list events, create events).

Every read and write used to be pinned to ``calendarId="primary"``. That was
not a choice so much as the only thing the grant allowed: ``calendar.events``
can read and write events on any calendar the student can reach, but it cannot
*list* those calendars, so there was no way to learn a second one existed. A
student whose course deadlines live on a "School" calendar, or on one a TA
shares with the class, looked to Classy like a student with an empty term
(issue #49).

The frontend now also requests ``calendar.calendarlist.readonly`` -- the one
read-only scope that names calendars and touches nothing else -- and this
router uses it: ``GET /calendars`` lists them, ``GET /events`` can read one by
id or all of them merged, and ``POST /events`` can write to one by id. Every
default is still ``primary``, so a caller that sends nothing new gets exactly
what it got before.

Tokens granted before that scope was added cannot list calendars. Google
answers ``calendarList.list`` with 403 for them, which is surfaced here as a
403 telling the caller the student has to reconnect (the frontend's
/dashboard/access has the button). See docs/design/24-every-calendar.md.
"""
from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException, Query
from googleapiclient.errors import HttpError
from pydantic import BaseModel, Field

from app.services.google_creds import service_for_user

router = APIRouter(prefix="/users/{user_id}/calendar", tags=["calendar"])

# Same shape as drive.py's 403, and the same meaning: the scope set the token
# was minted under is older than the one the code needs.
_RECONSENT = (
    "No access to the calendar list — user may need to re-consent with updated scopes"
)


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
    # Which calendar this came from. Always set, including for `primary`, so a
    # merged read across calendars stays attributable and a caller can write
    # back to the right one.
    calendar_id: str | None = Field(
        None, description="Id of the calendar the event lives on.")
    calendar_summary: str | None = Field(
        None, description="That calendar's display name, when known.")

    model_config = {"populate_by_name": True}


class EventListResponse(BaseModel):
    events: list[CalendarEvent]
    count: int


class CalendarSummary(BaseModel):
    id: str
    summary: str | None = None
    primary: bool = False
    # No alias, on purpose. FastAPI serialises response models by alias, so an
    # `accessRole` alias here would put Google's camelCase into our JSON where
    # the contract promises `access_role`. The rename happens in `_summary`.
    access_role: str | None = Field(
        None, description="reader | writer | owner. Only writer and owner can take a POST.")


def _summary(c: dict) -> "CalendarSummary":
    return CalendarSummary(
        id=c["id"],
        summary=c.get("summary"),
        primary=bool(c.get("primary", False)),
        access_role=c.get("accessRole"),
    )


class CalendarListResponse(BaseModel):
    calendars: list[CalendarSummary]
    count: int


def _list_calendars(svc) -> list[dict]:
    """Every calendar the student can at least read, primary first, then by name.

    Raises 403 when the token predates the calendarlist scope; that is the only
    error this call produces in practice, and it is the student's to fix.
    """
    items: list[dict] = []
    page_token = None
    try:
        while True:
            resp = svc.calendarList().list(
                minAccessRole="reader", pageToken=page_token).execute()
            items.extend(resp.get("items", []))
            page_token = resp.get("nextPageToken")
            if not page_token:
                break
    except HttpError as e:
        if e.resp.status == 403:
            raise HTTPException(403, _RECONSENT)
        raise
    items.sort(key=lambda c: (not c.get("primary", False), (c.get("summary") or "").lower()))
    return items


def _start_key(ev: CalendarEvent) -> datetime:
    """A comparable start for merging across calendars.

    Google gives a dateTime for timed events and a bare date for all-day ones,
    and events from different calendars carry different offsets, so the strings
    cannot be sorted as strings. Everything is parsed to an aware datetime; an
    all-day date becomes midnight UTC, which puts it ahead of the timed events
    of the same day, and anything unparseable sorts last rather than raising.
    """
    raw = (ev.start.date_time or ev.start.date) if ev.start else None
    if not raw:
        return datetime.max.replace(tzinfo=timezone.utc)
    try:
        parsed = datetime.fromisoformat(raw.replace("Z", "+00:00"))
    except ValueError:
        return datetime.max.replace(tzinfo=timezone.utc)
    return parsed if parsed.tzinfo else parsed.replace(tzinfo=timezone.utc)


@router.get("/calendars", response_model=CalendarListResponse)
def list_calendars(user_id: str):
    """List every calendar on the student's account: their own, plus any shared with them (a course calendar, a TA's office hours). Primary first."""
    svc = service_for_user(user_id, "calendar", "v3")
    items = _list_calendars(svc)
    return CalendarListResponse(calendars=[_summary(c) for c in items], count=len(items))


@router.get("/events", response_model=EventListResponse)
def list_events(
    user_id: str,
    time_min: str | None = Query(None, description="RFC3339, defaults to now"),
    time_max: str | None = Query(None, description="RFC3339"),
    max_results: int = Query(25, le=100),
    calendar_id: str = Query(
        "primary",
        description="Which calendar to read: an id from GET /calendars, or `primary`. "
                    "Ignored when all_calendars is true."),
    all_calendars: bool = Query(
        False,
        description="Read every calendar the student can see and merge the results, "
                    "sorted by start and capped at max_results."),
):
    """List upcoming events, expanding recurring series into individual instances sorted by start time. Reads the primary calendar unless `calendar_id` names another or `all_calendars` is set."""
    svc = service_for_user(user_id, "calendar", "v3")
    time_min = time_min or datetime.now(timezone.utc).isoformat()

    if all_calendars:
        calendars = [(c["id"], c.get("summary")) for c in _list_calendars(svc)]
    else:
        calendars = [(calendar_id, None)]

    events: list[CalendarEvent] = []
    for cid, summary in calendars:
        try:
            resp = svc.events().list(
                calendarId=cid,
                timeMin=time_min,
                timeMax=time_max,
                maxResults=max_results,
                singleEvents=True,
                orderBy="startTime",
            ).execute()
        except HttpError as e:
            # In a merged read, a calendar that was unshared between the list
            # call and this one is not worth failing the whole response for.
            # Asked for by name, the same errors are the caller's to hear.
            if all_calendars and e.resp.status in (403, 404):
                continue
            if e.resp.status == 404:
                raise HTTPException(404, f"Calendar {cid} not found")
            if e.resp.status == 403:
                raise HTTPException(
                    403, "No access to this calendar — user may need to re-consent with updated scopes")
            raise
        # events.list returns the calendar's own title as `summary` on the
        # response, which is what fills the name in for a single-calendar read.
        calendar_summary = summary or resp.get("summary")
        for item in resp.get("items", []):
            events.append(CalendarEvent.model_validate(
                {**item, "calendar_id": cid, "calendar_summary": calendar_summary}))

    if all_calendars:
        events.sort(key=_start_key)
        events = events[:max_results]
    return EventListResponse(events=events, count=len(events))


class EventIn(BaseModel):
    summary: str
    start: str            # RFC3339, e.g. "2026-08-25T14:00:00-04:00"
    end: str
    description: str | None = None
    location: str | None = None
    timezone: str = "America/Toronto"
    # Where to write it. `primary` unless the caller has a reason, and a reason
    # is an id from GET /calendars with access_role writer or owner.
    calendar_id: str = "primary"


class EventCreatedResponse(BaseModel):
    event_id: str
    html_link: str | None = Field(
        None, description="Link to the created event.")
    status: str = "created"


@router.post("/events", status_code=201, response_model=EventCreatedResponse)
def create_event(user_id: str, event: EventIn):
    """Create a new event (e.g. a syllabus deadline or exam date) on the user's primary calendar, or on the calendar named by `calendar_id`."""
    svc = service_for_user(user_id, "calendar", "v3")
    body = {
        "summary": event.summary,
        "description": event.description,
        "location": event.location,
        "start": {"dateTime": event.start, "timeZone": event.timezone},
        "end": {"dateTime": event.end, "timeZone": event.timezone},
    }
    try:
        created = svc.events().insert(calendarId=event.calendar_id, body=body).execute()
    except HttpError as e:
        if e.resp.status == 404:
            raise HTTPException(404, f"Calendar {event.calendar_id} not found")
        if e.resp.status == 403:
            raise HTTPException(
                403, "No write access to this calendar — pick one with access_role writer or owner")
        raise
    return EventCreatedResponse(event_id=created["id"], html_link=created.get("htmlLink"))
