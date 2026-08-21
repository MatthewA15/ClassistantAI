"""Google Calendar connector (P1: list events, create events)."""
from datetime import datetime, timezone
from fastapi import APIRouter, Query
from pydantic import BaseModel

from app.services.google_creds import service_for_user

router = APIRouter(prefix="/users/{user_id}/calendar", tags=["calendar"])


@router.get("/events")
def list_events(
    user_id: str,
    time_min: str | None = Query(None, description="RFC3339, defaults to now"),
    time_max: str | None = Query(None, description="RFC3339"),
    max_results: int = Query(25, le=100),
):
    """P1. Upcoming events, expanded (recurring -> instances), ordered by start."""
    svc = service_for_user(user_id, "calendar", "v3")
    resp = svc.events().list(
        calendarId="primary",
        timeMin=time_min or datetime.now(timezone.utc).isoformat(),
        timeMax=time_max,
        maxResults=max_results,
        singleEvents=True,
        orderBy="startTime",
    ).execute()
    events = [{
        "id": e["id"],
        "summary": e.get("summary"),
        "description": e.get("description"),
        "start": e.get("start"),
        "end": e.get("end"),
        "location": e.get("location"),
        "html_link": e.get("htmlLink"),
    } for e in resp.get("items", [])]
    return {"events": events, "count": len(events)}


class EventIn(BaseModel):
    summary: str
    start: str            # RFC3339, e.g. "2026-08-25T14:00:00-04:00"
    end: str
    description: str | None = None
    location: str | None = None
    timezone: str = "America/Toronto"


@router.post("/events", status_code=201)
def create_event(user_id: str, event: EventIn):
    """P1. Used by the agent to push syllabus deadlines / exam dates into the calendar."""
    svc = service_for_user(user_id, "calendar", "v3")
    body = {
        "summary": event.summary,
        "description": event.description,
        "location": event.location,
        "start": {"dateTime": event.start, "timeZone": event.timezone},
        "end": {"dateTime": event.end, "timeZone": event.timezone},
    }
    created = svc.events().insert(calendarId="primary", body=body).execute()
    return {"event_id": created["id"], "html_link": created.get("htmlLink"), "status": "created"}
