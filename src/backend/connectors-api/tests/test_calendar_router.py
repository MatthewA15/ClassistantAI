"""Tests for the guarded Calendar write endpoints.

Same shape as `test_docs_router.py`: the Google client is replaced with a
recorder, so these assert the exact body that would go over the wire -- and,
just as load-bearing for a write endpoint, that *no* call went over the wire
when a guardrail fired.
"""
import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

import app.routers.calendar as calendar

USER = "firebase-uid-1"
EVENT_ID = "evt-abc123"
EVENTS = f"/users/{USER}/calendar/events"
SUMMARY = "CS 246 Lecture"


class _Executable:
    def __init__(self, result):
        self._result = result

    def execute(self):
        return self._result


class _FakeEvents:
    def __init__(self, calls, fetched):
        self.calls = calls
        self.fetched = fetched

    def get(self, calendarId, eventId):  # noqa: N803 -- Google's parameter names
        self.calls.append(("get", calendarId, eventId))
        return _Executable(self.fetched)

    def insert(self, calendarId, body):  # noqa: N803
        self.calls.append(("insert", calendarId, body))
        return _Executable({"id": EVENT_ID, "htmlLink": "https://cal/evt"})

    def patch(self, calendarId, eventId, body):  # noqa: N803
        self.calls.append(("patch", calendarId, eventId, body))
        return _Executable({"id": eventId, "htmlLink": "https://cal/evt"})


class _FakeService:
    def __init__(self, calls, fetched):
        self._events = _FakeEvents(calls, fetched)

    def events(self):
        return self._events


@pytest.fixture
def fetched():
    """The event Google is currently holding; tests mutate this before calling."""
    return {
        "id": EVENT_ID,
        "summary": SUMMARY,
        "start": {"dateTime": "2026-09-08T14:00:00-04:00", "timeZone": "America/Toronto"},
        "end": {"dateTime": "2026-09-08T15:00:00-04:00", "timeZone": "America/Toronto"},
        "location": "MC 4020",
        "htmlLink": "https://cal/evt",
    }


@pytest.fixture
def calls(monkeypatch, fetched):
    """Records every Google call the router makes."""
    recorded = []
    monkeypatch.setattr(
        calendar,
        "service_for_user",
        lambda user_id, api, version: _FakeService(recorded, fetched),
    )
    return recorded


@pytest.fixture
def client():
    api = FastAPI()
    api.include_router(calendar.router)
    return TestClient(api)


def only(calls, kind):
    """The single recorded call of `kind`."""
    matching = [c for c in calls if c[0] == kind]
    assert len(matching) == 1, f"expected one {kind}, got {len(matching)}"
    return matching[0]


def patch_body(calls):
    return only(calls, "patch")[3]


CONFIRMED = {"user_confirmation": "yes, move it", "expected_summary": SUMMARY}


# --------------------------------------------------------------------------
# PATCH -- partial update
# --------------------------------------------------------------------------

def test_patch_sends_only_the_fields_the_caller_named(calls, client):
    response = client.patch(
        f"{EVENTS}/{EVENT_ID}",
        json={"summary": "CS 246 Midterm Review",
              "start": "2026-09-08T15:00:00-04:00", **CONFIRMED},
    )

    assert response.status_code == 200
    # Exactly these two keys: description, location and end were never
    # mentioned, so events.patch must not carry (and blank out) them.
    assert patch_body(calls) == {
        "summary": "CS 246 Midterm Review",
        "start": {"dateTime": "2026-09-08T15:00:00-04:00", "timeZone": "America/Toronto"},
    }
    body = response.json()
    assert body["status"] == "updated"
    assert body["changed_fields"] == ["summary", "start"]
    assert body["event_id"] == EVENT_ID


def test_patch_targets_the_event_from_the_path(calls, client):
    client.patch(f"{EVENTS}/{EVENT_ID}", json={"location": "MC 4021", **CONFIRMED})
    assert only(calls, "patch")[1:3] == ("primary", EVENT_ID)


# --------------------------------------------------------------------------
# PATCH -- the guardrail
# --------------------------------------------------------------------------

def test_patch_with_a_stale_expected_summary_is_a_409_and_writes_nothing(calls, client):
    response = client.patch(
        f"{EVENTS}/{EVENT_ID}",
        json={"summary": "New title", "user_confirmation": "yes",
              "expected_summary": "CS 246 Tutorial"},
    )

    assert response.status_code == 409
    detail = response.json()["detail"]
    assert detail["mismatches"] == [
        {"field": "summary", "expected": SUMMARY, "got": "CS 246 Tutorial"}
    ]
    # The whole point: the event is untouched, so the agent can re-read and re-ask.
    assert [c for c in calls if c[0] == "patch"] == []


def test_patch_without_a_confirmation_never_touches_google(calls, client):
    response = client.patch(
        f"{EVENTS}/{EVENT_ID}",
        json={"summary": "New title", "user_confirmation": "   ",
              "expected_summary": SUMMARY},
    )

    assert response.status_code == 400
    # Not even the read: an unconfirmed edit is refused before we look anything up.
    assert calls == []


def test_patch_refuses_a_comma_joined_event_id(calls, client):
    response = client.patch(f"{EVENTS}/a,b", json={"summary": "New", **CONFIRMED})

    assert response.status_code == 400
    assert calls == []
