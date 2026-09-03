"""Tests for the /users/{user_id}/calendar endpoints.

Same approach as test_docs_router.py: the Google client is swapped for a
recorder, so these assert the exact calendarId and parameters that would go
over the wire rather than mocking the thing under test.

The load-bearing test is `test_default_read_is_primary_only`. The agent is
already calling GET /events with none of the v0.7 parameters, and that request
has to keep reading `primary` and must never touch calendarList, which a token
granted before the calendarlist scope cannot call.
"""
import json

import httplib2
import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from googleapiclient.errors import HttpError

import app.routers.calendar as calendar

USER = "firebase-uid-1"
BASE = f"/users/{USER}/calendar"

PRIMARY = {"id": "primary-id", "summary": "Me", "primary": True, "accessRole": "owner"}
COURSE = {"id": "course-id", "summary": "COMP 250", "accessRole": "reader"}
CLUB = {"id": "club-id", "summary": "Chess", "accessRole": "writer"}


def http_error(status: int) -> HttpError:
    resp = httplib2.Response({"status": status, "reason": "x"})
    return HttpError(resp, json.dumps({"error": {"message": "x"}}).encode())


def event(event_id: str, *, date_time: str | None = None, date: str | None = None) -> dict:
    start = {"dateTime": date_time} if date_time else {"date": date}
    return {"id": event_id, "summary": event_id, "start": start, "end": start}


# Three calendars. Chosen so the merged order is not the per-calendar order and
# not the string order of the raw start values:
#   c2  all-day 2026-09-10           -> 2026-09-10T00:00Z
#   c1  2026-09-09T23:30:00-04:00    -> 2026-09-10T03:30Z
#   p1  2026-09-10T09:00:00-04:00    -> 2026-09-10T13:00Z
#   k1  2026-09-11T08:00:00+01:00    -> 2026-09-11T07:00Z
EVENTS = {
    "primary": {"summary": "Me", "items": [event("p1", date_time="2026-09-10T09:00:00-04:00")]},
    "primary-id": {"summary": "Me", "items": [event("p1", date_time="2026-09-10T09:00:00-04:00")]},
    "course-id": {
        "summary": "COMP 250",
        "items": [
            event("c1", date_time="2026-09-09T23:30:00-04:00"),
            event("c2", date="2026-09-10"),
        ],
    },
    "club-id": {"summary": "Chess", "items": [event("k1", date_time="2026-09-11T08:00:00+01:00")]},
}


class _Executable:
    def __init__(self, result=None, error=None):
        self._result, self._error = result, error

    def execute(self):
        if self._error is not None:
            raise self._error
        return self._result


class _FakeCalendarList:
    def __init__(self, calls, calendars, error):
        self.calls, self.calendars, self.error = calls, calendars, error

    def list(self, **kwargs):
        self.calls.append(("calendarList.list", kwargs))
        if self.error is not None:
            return _Executable(error=self.error)
        return _Executable({"items": self.calendars})


class _FakeEvents:
    def __init__(self, calls, event_errors, insert_error):
        self.calls, self.event_errors, self.insert_error = calls, event_errors, insert_error

    def list(self, **kwargs):
        self.calls.append(("events.list", kwargs))
        cid = kwargs["calendarId"]
        if cid in self.event_errors:
            return _Executable(error=self.event_errors[cid])
        cal = EVENTS.get(cid)
        if cal is None:
            return _Executable(error=http_error(404))
        return _Executable({"summary": cal["summary"], "items": cal["items"]})

    def insert(self, **kwargs):
        self.calls.append(("events.insert", kwargs))
        if self.insert_error is not None:
            return _Executable(error=self.insert_error)
        return _Executable({"id": "evt-new", "htmlLink": "https://calendar.google.com/evt-new"})


class _FakeService:
    def __init__(self, calls, calendars, list_error, event_errors, insert_error):
        self._cl = _FakeCalendarList(calls, calendars, list_error)
        self._ev = _FakeEvents(calls, event_errors, insert_error)

    def calendarList(self):  # noqa: N802 -- Google's method name
        return self._cl

    def events(self):
        return self._ev


@pytest.fixture
def install(monkeypatch):
    """Installs a fake Google client and returns the list it records into."""
    def _install(
        calendars=(CLUB, COURSE, PRIMARY),
        list_error=None,
        event_errors=None,
        insert_error=None,
    ):
        recorded = []
        monkeypatch.setattr(
            calendar,
            "service_for_user",
            lambda user_id, api, version: _FakeService(
                recorded, list(calendars), list_error, event_errors or {}, insert_error),
        )
        return recorded
    return _install


@pytest.fixture
def client():
    api = FastAPI()
    api.include_router(calendar.router)
    return TestClient(api)


def calls_named(calls, name):
    return [c for c in calls if c[0] == name]


# --------------------------------------------------------------------------
# GET /events, unchanged defaults
# --------------------------------------------------------------------------

def test_default_read_is_primary_only(client, install):
    calls = install()

    r = client.get(f"{BASE}/events")

    assert r.status_code == 200
    assert calls_named(calls, "calendarList.list") == [], "a default read must not need the new scope"
    lists = calls_named(calls, "events.list")
    assert len(lists) == 1
    assert lists[0][1]["calendarId"] == "primary"
    assert lists[0][1]["singleEvents"] is True
    assert lists[0][1]["orderBy"] == "startTime"

    body = r.json()
    assert body["count"] == 1
    assert body["events"][0]["id"] == "p1"
    # The two new fields are the only difference from v0.6 on a default read.
    assert body["events"][0]["calendar_id"] == "primary"
    assert body["events"][0]["calendar_summary"] == "Me"


def test_calendar_id_reads_that_calendar(client, install):
    calls = install()

    r = client.get(f"{BASE}/events", params={"calendar_id": "course-id"})

    assert r.status_code == 200
    assert calls_named(calls, "events.list")[0][1]["calendarId"] == "course-id"
    assert {e["calendar_summary"] for e in r.json()["events"]} == {"COMP 250"}


def test_named_calendar_that_does_not_exist_is_404(client, install):
    install()
    r = client.get(f"{BASE}/events", params={"calendar_id": "nope"})
    assert r.status_code == 404


def test_named_calendar_403_asks_for_reconsent(client, install):
    install(event_errors={"course-id": http_error(403)})
    r = client.get(f"{BASE}/events", params={"calendar_id": "course-id"})
    assert r.status_code == 403
    assert "re-consent" in r.json()["detail"]


# --------------------------------------------------------------------------
# GET /calendars
# --------------------------------------------------------------------------

def test_list_calendars_primary_first_then_by_name(client, install):
    calls = install(calendars=(CLUB, COURSE, PRIMARY))

    r = client.get(f"{BASE}/calendars")

    assert r.status_code == 200
    assert calls_named(calls, "calendarList.list")[0][1]["minAccessRole"] == "reader"
    body = r.json()
    assert body["count"] == 3
    assert [c["id"] for c in body["calendars"]] == ["primary-id", "club-id", "course-id"]
    assert body["calendars"][0]["primary"] is True
    assert body["calendars"][1]["access_role"] == "writer"


def test_list_calendars_403_means_the_token_predates_the_scope(client, install):
    install(list_error=http_error(403))
    r = client.get(f"{BASE}/calendars")
    assert r.status_code == 403
    assert "re-consent" in r.json()["detail"]


# --------------------------------------------------------------------------
# GET /events?all_calendars=true
# --------------------------------------------------------------------------

def test_all_calendars_merges_across_offsets_and_caps(client, install):
    calls = install()

    r = client.get(f"{BASE}/events", params={"all_calendars": "true", "max_results": 3})

    assert r.status_code == 200
    assert len(calls_named(calls, "calendarList.list")) == 1
    assert {c[1]["calendarId"] for c in calls_named(calls, "events.list")} == {
        "primary-id", "course-id", "club-id"}

    body = r.json()
    # Four events exist; capped at three, in true chronological order rather
    # than per-calendar or string order (see the table above EVENTS).
    assert body["count"] == 3
    assert [e["id"] for e in body["events"]] == ["c2", "c1", "p1"]
    assert body["events"][0]["calendar_summary"] == "COMP 250"
    assert body["events"][2]["calendar_id"] == "primary-id"


def test_all_calendars_ignores_calendar_id(client, install):
    calls = install()
    client.get(f"{BASE}/events", params={"all_calendars": "true", "calendar_id": "nope"})
    assert "nope" not in {c[1]["calendarId"] for c in calls_named(calls, "events.list")}


def test_all_calendars_skips_a_calendar_that_was_unshared(client, install):
    install(event_errors={"club-id": http_error(403)})

    r = client.get(f"{BASE}/events", params={"all_calendars": "true"})

    assert r.status_code == 200
    ids = [e["id"] for e in r.json()["events"]]
    assert "k1" not in ids
    assert set(ids) == {"c2", "c1", "p1"}


def test_all_calendars_403_on_the_list_is_reconsent(client, install):
    install(list_error=http_error(403))
    r = client.get(f"{BASE}/events", params={"all_calendars": "true"})
    assert r.status_code == 403


# --------------------------------------------------------------------------
# POST /events
# --------------------------------------------------------------------------

BODY = {"summary": "Midterm", "start": "2026-10-01T09:00:00-04:00", "end": "2026-10-01T11:00:00-04:00"}


def test_create_event_defaults_to_primary(client, install):
    calls = install()

    r = client.post(f"{BASE}/events", json=BODY)

    assert r.status_code == 201
    insert = calls_named(calls, "events.insert")[0][1]
    assert insert["calendarId"] == "primary"
    assert insert["body"]["summary"] == "Midterm"
    assert r.json() == {
        "event_id": "evt-new",
        "html_link": "https://calendar.google.com/evt-new",
        "status": "created",
    }


def test_create_event_on_a_named_calendar(client, install):
    calls = install()
    r = client.post(f"{BASE}/events", json={**BODY, "calendar_id": "club-id"})
    assert r.status_code == 201
    assert calls_named(calls, "events.insert")[0][1]["calendarId"] == "club-id"


def test_create_event_on_a_read_only_calendar_is_403(client, install):
    install(insert_error=http_error(403))
    r = client.post(f"{BASE}/events", json={**BODY, "calendar_id": "course-id"})
    assert r.status_code == 403
    assert "writer or owner" in r.json()["detail"]


# --------------------------------------------------------------------------
# The merge key on its own
# --------------------------------------------------------------------------

def test_start_key_orders_all_day_before_timed_and_unparseable_last():
    def ev(**start):
        return calendar.CalendarEvent(id="x", start=calendar.EventStartEnd(**start))

    all_day = ev(date="2026-09-10")
    early = ev(date_time="2026-09-09T23:30:00-04:00")   # 03:30Z on the 10th
    zulu = ev(date_time="2026-09-10T13:00:00Z")
    broken = ev(date_time="not a date")
    none = calendar.CalendarEvent(id="x")

    ordered = sorted([broken, zulu, none, early, all_day], key=calendar._start_key)
    assert ordered[:3] == [all_day, early, zulu]
    assert set(map(id, ordered[3:])) == {id(broken), id(none)}
