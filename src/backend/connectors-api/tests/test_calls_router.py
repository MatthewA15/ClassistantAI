"""Tests for the /users/{user_id}/calls endpoints.

Firestore is replaced with a hand-written fake that records every write, so
these assert the document this service actually stores rather than mocking
out the thing under test. CALL-E is stubbed at the module boundary
(`calls.calle_mcp`), which is where the router's own responsibility starts
and ends.

These run against the real `app.main` app rather than a throwaway one. That
is deliberate: the 502/503 mapping lives in app/main.py's exception handlers,
not in this router, so a throwaway app would be testing a wiring that does
not exist in production.

Two tests here are load-bearing and the rest support them:

  * `test_no_response_ever_carries_the_students_full_number` -- CALL-E's
    payload contains the unmasked number and the student's name, and the
    router is the only thing standing between that payload and a caller.
  * `test_the_number_dialled_is_the_one_on_the_user_document` -- v0 dials the
    student's own verified handset and nothing else. A body field that could
    redirect the call is the failure this asserts against.
"""
import logging

import pytest
from fastapi.testclient import TestClient

import app.routers.calls as calls
from app.main import app
from app.services.calle_mcp import CalleAuthError, CalleUpstreamError

USER = "firebase-uid-1"
ENDPOINT = f"/users/{USER}/calls"
PHONE = "+15145550123"
MASKED = "+" + "\u2022" * 7 + "0123"
STUDENT_NAME = "Amelia Okonkwo"
GOAL = "Ask whether the CHEM 204 late-add petition was approved"
RUN_ID = "run-1"

# Shaped after a real completed CALL-E run. The two fields that must never
# come back out are `result.extracted.to_phones` (the unmasked number) and
# the name inside `display_goal` / `result.extracted.goal`.
COMPLETED_PAYLOAD = {
    "run_id": RUN_ID,
    "status": "COMPLETED",
    "message": "Call finished.",
    "display_goal": f"Call on behalf of {STUDENT_NAME}: {GOAL}",
    "next_step": {"action": "done"},
    "next_cursor": "cursor-2",
    "activity": [
        {
            "ts": "2026-08-30T14:02:10Z",
            "level": "info",
            "kind": "dial",
            "message": "Dialing",
            # Everything below must be projected away.
            "to_phone": PHONE,
            "internal_trace_id": "trace-abc",
        }
    ],
    "result": {
        "summary": "The petition was approved on Aug 28.",
        "transcript": "Agent: Hello...\nRegistrar: It was approved.",
        "outcome": {
            "task_completed": True,
            "completion_confidence": {"score": 0.92, "label": "high"},
            "evidence": ["Registrar confirmed approval", "Reference 88123"],
        },
        "extracted": {
            "goal": f"{STUDENT_NAME} wants the petition status",
            "to_phones": [PHONE],
            "calling": {"duration_seconds": 96},
        },
    },
}

IN_PROGRESS_PAYLOAD = {
    "run_id": RUN_ID,
    "status": "PREPARING",
    "next_step": {"action": "poll_get_call_run", "poll_after_seconds": 5},
    "result": {},
    "activity": [],
}


class _Snapshot:
    def __init__(self, doc_id: str, data: dict | None):
        self.id = doc_id
        self.exists = data is not None
        self._data = data

    def to_dict(self):
        return dict(self._data) if self._data is not None else None


class _Document:
    def __init__(self, db, path: tuple):
        self._db = db
        self._path = path

    @property
    def id(self) -> str:
        return self._path[-1]

    def collection(self, name: str):
        return _Collection(self._db, self._path + (name,))

    def get(self) -> _Snapshot:
        return _Snapshot(self.id, self._db.documents.get(self._path))

    def set(self, data: dict, merge: bool = False):
        self._db.writes.append((self._path, dict(data), merge))
        existing = self._db.documents.get(self._path) if merge else None
        merged = dict(existing or {})
        merged.update(data)
        self._db.documents[self._path] = merged


class _Collection:
    def __init__(self, db, path: tuple):
        self._db = db
        self._path = path
        self._order = None
        self._descending = False
        self._limit = None

    def document(self, doc_id: str) -> _Document:
        return _Document(self._db, self._path + (doc_id,))

    def order_by(self, field: str, direction=None):
        self._order = field
        self._descending = direction == "DESCENDING"
        return self

    def limit(self, count: int):
        self._limit = count
        return self

    def stream(self):
        children = [
            (path, data)
            for path, data in self._db.documents.items()
            if path[:-1] == self._path
        ]
        if self._order:
            children.sort(
                key=lambda item: item[1].get(self._order) or 0,
                reverse=self._descending,
            )
        if self._limit is not None:
            children = children[: self._limit]
        return [_Snapshot(path[-1], data) for path, data in children]


class _FakeFirestore:
    """Documents keyed by path tuple; every write recorded in order."""

    def __init__(self, documents: dict | None = None):
        self.documents = dict(documents or {})
        self.writes: list[tuple] = []

    def collection(self, name: str) -> _Collection:
        return _Collection(self, (name,))

    def user_path(self, user_id: str = USER) -> tuple:
        return ("users", user_id)

    def run_path(self, run_id: str = RUN_ID, user_id: str = USER) -> tuple:
        return ("users", user_id, "call_runs", run_id)


def _user(**overrides) -> dict:
    doc = {"phone_number": PHONE, "name": STUDENT_NAME}
    doc.update(overrides)
    return doc


@pytest.fixture
def db(monkeypatch):
    """Firestore, holding one onboarded student with a verified number."""
    fake = _FakeFirestore({("users", USER): _user()})
    monkeypatch.setattr(calls, "_firestore_client", lambda: fake)
    return fake


@pytest.fixture
def calle(monkeypatch):
    """CALL-E, stubbed at the module boundary. Records what it was asked."""

    class _Calle:
        def __init__(self):
            self.started: list[tuple] = []
            self.polled: list[tuple] = []
            self.start_result = {"plan_id": "plan-1", "run_id": RUN_ID}
            self.run_payload = COMPLETED_PAYLOAD

        def start_call(self, to_phone, goal, language=None, region=None):
            self.started.append((to_phone, goal, language, region))
            if isinstance(self.start_result, Exception):
                raise self.start_result
            return self.start_result

        def get_call_run(self, run_id, cursor=None, limit=None):
            self.polled.append((run_id, cursor, limit))
            if isinstance(self.run_payload, Exception):
                raise self.run_payload
            return self.run_payload

    stub = _Calle()
    monkeypatch.setattr(calls, "calle_mcp", stub)
    return stub


@pytest.fixture
def client():
    return TestClient(app)


def _written(db, path: tuple) -> list[dict]:
    return [data for written, data, _ in db.writes if written == path]


# --------------------------------------------------------------------------
# Starting a call -- and who it is allowed to reach
# --------------------------------------------------------------------------

def test_the_number_dialled_is_the_one_on_the_user_document(db, calle, client):
    response = client.post(ENDPOINT, json={"goal": GOAL})

    assert response.status_code == 201
    dialled, goal, language, region = calle.started[0]
    assert dialled == PHONE
    assert goal == GOAL
    assert (language, region) == (None, None)


def test_a_phone_number_in_the_request_body_cannot_redirect_the_call(
    db, calle, client
):
    # The body has no phone field, so an extra one is ignored rather than
    # honoured. This is the test that fails loudly if someone ever adds one.
    response = client.post(
        ENDPOINT, json={"goal": GOAL, "to_phone": "+15550009999"}
    )

    assert response.status_code == 201
    assert calle.started[0][0] == PHONE
    assert "+15550009999" not in response.text


def test_starting_a_call_returns_the_masked_number_and_never_the_real_one(
    db, calle, client
):
    response = client.post(ENDPOINT, json={"goal": GOAL})

    body = response.json()
    assert body == {
        "run_id": RUN_ID,
        "status": "started",
        "to_phone_masked": MASKED,
    }
    assert PHONE not in response.text


def test_starting_a_call_writes_the_call_run_document(db, calle, client):
    client.post(ENDPOINT, json={"goal": GOAL})

    written = _written(db, db.run_path())
    assert len(written) == 1, f"expected one write, got {len(written)}"
    doc = written[0]
    assert doc["run_id"] == RUN_ID
    assert doc["plan_id"] == "plan-1"
    assert doc["goal"] == GOAL
    assert doc["status"] == "started"
    assert doc["to_phone_masked"] == MASKED
    assert "created_at" in doc
    # The record of a call is not a place to keep the number either.
    assert PHONE not in str(doc)


def test_the_number_is_masked_in_the_log_line_too(db, calle, client, caplog):
    with caplog.at_level(logging.INFO, logger=calls.__name__):
        client.post(ENDPOINT, json={"goal": GOAL})

    assert caplog.records, "a placed call must be logged, or it cannot be traced"
    logged = "\n".join(r.getMessage() for r in caplog.records)
    assert PHONE not in logged
    assert MASKED in logged


def test_language_and_region_are_passed_through_when_given(db, calle, client):
    client.post(
        ENDPOINT, json={"goal": GOAL, "language": "en-CA", "region": "CA"}
    )

    assert calle.started[0][2:] == ("en-CA", "CA")


def test_an_unknown_user_is_a_404(db, calle, client):
    response = client.post(f"/users/nobody/calls", json={"goal": GOAL})

    assert response.status_code == 404
    assert "Firebase UID" in response.json()["detail"]
    assert calle.started == [], "CALL-E must not be reached for an unknown user"


def test_a_student_with_no_verified_number_is_a_409(db, calle, client):
    db.documents[db.user_path()] = _user(phone_number=None)

    response = client.post(ENDPOINT, json={"goal": GOAL})

    assert response.status_code == 409
    assert calle.started == []


def test_calls_turned_off_in_the_access_switches_is_a_403(db, calle, client):
    db.documents[db.user_path()] = _user(access={"calls": False})

    response = client.post(ENDPOINT, json={"goal": GOAL})

    assert response.status_code == 403
    assert calle.started == [], "a denied student's phone must never ring"


@pytest.mark.parametrize(
    "access",
    [None, {}, {"calls": True}, {"gmail_read": False}],
    ids=["absent", "empty", "true", "some-other-switch"],
)
def test_anything_other_than_an_explicit_false_still_allows_the_call(
    db, calle, client, access
):
    # The dashboard switch ships after this endpoint, so an older user
    # document must not read as "denied".
    db.documents[db.user_path()] = _user(access=access)

    assert client.post(ENDPOINT, json={"goal": GOAL}).status_code == 201


def test_a_goal_too_short_to_act_on_is_rejected(db, calle, client):
    response = client.post(ENDPOINT, json={"goal": "call"})

    assert response.status_code == 422
    assert calle.started == []


# --------------------------------------------------------------------------
# CALL-E failures map app-wide, not here
# --------------------------------------------------------------------------

def test_an_expired_calle_token_surfaces_as_503(db, calle, client):
    calle.start_result = CalleAuthError("token expired, run scripts/calle_login.py")

    response = client.post(ENDPOINT, json={"goal": GOAL})

    # 503, not 401: nothing the caller sent was wrong.
    assert response.status_code == 503
    assert "calle_login.py" in response.json()["detail"]


def test_an_upstream_calle_failure_surfaces_as_502(db, calle, client):
    calle.start_result = CalleUpstreamError("CALL-E returned HTTP 500")

    assert client.post(ENDPOINT, json={"goal": GOAL}).status_code == 502


def test_a_failed_start_writes_no_call_run_document(db, calle, client):
    calle.start_result = CalleUpstreamError("CALL-E returned HTTP 500")

    client.post(ENDPOINT, json={"goal": GOAL})

    assert db.writes == [], "a call that never started has nothing to record"


# --------------------------------------------------------------------------
# Polling a run
# --------------------------------------------------------------------------

def test_polling_a_run_the_student_does_not_own_is_a_404(db, calle, client):
    response = client.get(f"{ENDPOINT}/{RUN_ID}")

    assert response.status_code == 404
    # Indistinguishable from a run that never existed, and CALL-E is never
    # asked -- otherwise this leaks whether the id is real.
    assert calle.polled == []


def test_polling_returns_the_flattened_outcome(db, calle, client):
    db.documents[db.run_path()] = {"run_id": RUN_ID, "goal": GOAL}

    body = client.get(f"{ENDPOINT}/{RUN_ID}").json()

    assert body["status"] == "COMPLETED"
    assert body["in_progress"] is False
    assert body["summary"] == "The petition was approved on Aug 28."
    assert body["task_completed"] is True
    assert body["confidence"] == 0.92
    assert body["evidence"] == [
        "Registrar confirmed approval",
        "Reference 88123",
    ]
    assert body["duration_seconds"] == 96
    assert body["next_cursor"] == "cursor-2"
    assert "Registrar: It was approved." in body["transcript"]


def test_a_running_call_is_marked_in_progress_with_a_poll_interval(
    db, calle, client
):
    db.documents[db.run_path()] = {"run_id": RUN_ID}
    calle.run_payload = IN_PROGRESS_PAYLOAD

    body = client.get(f"{ENDPOINT}/{RUN_ID}").json()

    assert body["in_progress"] is True
    assert body["poll_after_seconds"] == 5
    # Everything the call has not produced yet is absent, not invented.
    assert body["summary"] is None
    assert body["task_completed"] is None
    assert body["evidence"] == []
    assert body["transcript"] is None


def test_activity_entries_are_projected_down_to_four_fields(db, calle, client):
    db.documents[db.run_path()] = {"run_id": RUN_ID}

    entry = client.get(f"{ENDPOINT}/{RUN_ID}").json()["activity"][0]

    assert set(entry) == {"ts", "level", "kind", "message"}


def test_no_response_ever_carries_the_students_full_number(db, calle, client):
    """The payload CALL-E returns contains both; neither may come back out."""
    db.documents[db.run_path()] = {"run_id": RUN_ID}

    response = client.get(f"{ENDPOINT}/{RUN_ID}")

    assert PHONE not in response.text
    assert STUDENT_NAME not in response.text
    assert "confirm_token" not in response.text
    assert "to_phones" not in response.text
    assert "display_goal" not in response.text


def test_polling_merges_terminal_state_onto_the_call_run_document(
    db, calle, client
):
    db.documents[db.run_path()] = {"run_id": RUN_ID, "goal": GOAL}

    client.get(f"{ENDPOINT}/{RUN_ID}")

    merged = _written(db, db.run_path())[-1]
    assert merged["status"] == "COMPLETED"
    assert merged["summary"] == "The petition was approved on Aug 28."
    assert merged["task_completed"] is True
    assert merged["duration_seconds"] == 96
    assert "last_checked_at" in merged
    # Merged, so the goal written at start time survives.
    assert db.documents[db.run_path()]["goal"] == GOAL
    # And CALL-E's payload is not what we stored.
    assert PHONE not in str(db.documents[db.run_path()])


def test_the_cursor_and_limit_reach_calle(db, calle, client):
    db.documents[db.run_path()] = {"run_id": RUN_ID}

    client.get(f"{ENDPOINT}/{RUN_ID}", params={"cursor": "c-1", "limit": 25})

    assert calle.polled[0] == (RUN_ID, "c-1", 25)


def test_a_limit_outside_the_allowed_range_is_rejected(db, calle, client):
    db.documents[db.run_path()] = {"run_id": RUN_ID}

    response = client.get(f"{ENDPOINT}/{RUN_ID}", params={"limit": 500})

    assert response.status_code == 422
    assert calle.polled == []


# --------------------------------------------------------------------------
# Listing
# --------------------------------------------------------------------------

def test_listing_returns_most_recent_first(db, calle, client):
    for run_id, created in (("run-old", 1), ("run-new", 3), ("run-mid", 2)):
        db.documents[db.run_path(run_id)] = {
            "run_id": run_id,
            "goal": GOAL,
            "status": "COMPLETED",
            "to_phone_masked": MASKED,
            "created_at": created,
        }

    body = client.get(ENDPOINT).json()

    assert [call["run_id"] for call in body["calls"]] == [
        "run-new",
        "run-mid",
        "run-old",
    ]
    assert body["count"] == 3
    assert body["calls"][0]["to_phone_masked"] == MASKED


def test_listing_honours_max_results(db, calle, client):
    for index in range(5):
        db.documents[db.run_path(f"run-{index}")] = {
            "run_id": f"run-{index}",
            "created_at": index,
        }

    body = client.get(ENDPOINT, params={"max_results": 2}).json()

    assert body["count"] == 2


def test_listing_404s_for_an_unknown_user(db, calle, client):
    assert client.get("/users/nobody/calls").status_code == 404


def test_listing_never_carries_a_full_number(db, calle, client):
    db.documents[db.run_path()] = {
        "run_id": RUN_ID,
        "goal": GOAL,
        "status": "started",
        "to_phone_masked": MASKED,
        "created_at": 1,
    }

    response = client.get(ENDPOINT)

    assert PHONE not in response.text
    assert MASKED in response.text
