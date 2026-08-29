"""Google Calendar connector (P1: list events, create events)."""
from datetime import datetime, timezone
from fastapi import APIRouter, Query
from pydantic import BaseModel, Field

from app.services.google_creds import service_for_user

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
    """List upcoming primary-calendar events, expanding recurring series into individual instances sorted by start time."""
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
    timezone: str = "America/Toronto"


class EventCreatedResponse(BaseModel):
    event_id: str
    html_link: str | None = Field(
        None, description="Link to the created event.")
    status: str = "created"


@router.post("/events", status_code=201, response_model=EventCreatedResponse)
def create_event(user_id: str, event: EventIn):
    """Create a new event on the user's primary calendar (e.g. a syllabus deadline or exam date)."""
    svc = service_for_user(user_id, "calendar", "v3")
    body = {
        "summary": event.summary,
        "description": event.description,
        "location": event.location,
        "start": {"dateTime": event.start, "timeZone": event.timezone},
        "end": {"dateTime": event.end, "timeZone": event.timezone},
    }
    created = svc.events().insert(calendarId="primary", body=body).execute()
    return EventCreatedResponse(event_id=created["id"], html_link=created.get("htmlLink"))
