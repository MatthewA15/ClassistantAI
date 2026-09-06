"""Tests for PATCH /users/{user_id}/emails/drafts/{draft_id}.

Same recorder shape as `test_docs_router.py`: a fake Google client captures
the exact body sent to `drafts.update`.

The load-bearing tests here decode that body's raw MIME and assert on the
real header values. Gmail's `drafts.update` REPLACES the whole message -- it
has no partial update -- so an implementation that builds a MIME out of only
the fields the caller sent would blank the rest of the draft and still return
200. Asserting on the decoded To/Subject/body is the only thing that catches
that.
"""
import base64
import email

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from googleapiclient.errors import HttpError

import app.routers.gmail as gmail

USER = "firebase-uid-1"
DRAFT_ID = "draft-abc123"
DRAFTS = f"/users/{USER}/emails/drafts"

ORIGINAL_TO = "prof@uwaterloo.ca"
ORIGINAL_SUBJECT = "Extension request for A3"
ORIGINAL_BODY = "Hi Professor,\n\nCould I have until Friday?\n\nThanks"


def _b64(text: str) -> str:
    return base64.urlsafe_b64encode(text.encode()).decode()


class _Executable:
    def __init__(self, result):
        self._result = result

    def execute(self):
        return self._result


class _Raiser:
    def __init__(self, error):
        self._error = error

    def execute(self):
        raise self._error


class _FakeDrafts:
    def __init__(self, calls, draft, get_error=None):
        self.calls = calls
        self.draft = draft
        self.get_error = get_error

    def get(self, userId, id, format):  # noqa: A002,N803 -- Google's parameter names
        self.calls.append(("get", id, format))
        if self.get_error is not None:
            return _Raiser(self.get_error)
        return _Executable(self.draft)

    def update(self, userId, id, body):  # noqa: N803
        self.calls.append(("update", id, body))
        return _Executable({"id": id})


class _FakeUsers:
    def __init__(self, calls, draft, get_error):
        self._drafts = _FakeDrafts(calls, draft, get_error)

    def drafts(self):
        return self._drafts


class _FakeService:
    def __init__(self, calls, draft, get_error=None):
        self._users = _FakeUsers(calls, draft, get_error)

    def users(self):
        return self._users


@pytest.fixture
def draft():
    """The draft Gmail is currently holding, in `format="full"` shape."""
    return {
        "id": DRAFT_ID,
        "message": {
            "id": "msg-1",
            "threadId": "thread-1",
            "payload": {
                "mimeType": "text/plain",
                "headers": [
                    {"name": "To", "value": ORIGINAL_TO},
                    {"name": "Subject", "value": ORIGINAL_SUBJECT},
                ],
                "body": {"data": _b64(ORIGINAL_BODY)},
            },
        },
    }


@pytest.fixture
def calls(monkeypatch, draft):
    """Records every Google call the router makes."""
    recorded = []
    monkeypatch.setattr(
        gmail,
        "service_for_user",
        lambda user_id, api, version: _FakeService(recorded, draft),
    )
    return recorded


@pytest.fixture
def client():
    api = FastAPI()
    api.include_router(gmail.router)
    return TestClient(api)


def only(calls, kind):
    matching = [c for c in calls if c[0] == kind]
    assert len(matching) == 1, f"expected one {kind}, got {len(matching)}"
    return matching[0]


def updated_message(calls):
    """The message actually handed to drafts.update, decoded from its raw MIME."""
    raw = only(calls, "update")[2]["message"]["raw"]
    return email.message_from_bytes(base64.urlsafe_b64decode(raw))


def message_body(message):
    return message.get_payload(decode=True).decode()


CONFIRMED = {"user_confirmation": "yes, update it"}


# --------------------------------------------------------------------------
# fetch -> merge -> rebuild: the fields the caller left out must survive
# --------------------------------------------------------------------------

def test_patching_the_body_preserves_to_and_subject(calls, client):
    new_body = "Hi Professor,\n\nCould I have until Monday instead?\n\nThanks"
    response = client.patch(
        f"{DRAFTS}/{DRAFT_ID}", json={"body": new_body, **CONFIRMED})

    assert response.status_code == 200
    message = updated_message(calls)
    # drafts.update replaces the entire message, so these headers only survive
    # if the endpoint merged them back in from the fetched draft.
    assert message["To"] == ORIGINAL_TO
    assert message["Subject"] == ORIGINAL_SUBJECT
    assert message_body(message) == new_body

    body = response.json()
    assert body["status"] == "draft_updated"
    assert body["changed_fields"] == ["body"]


def test_patching_the_subject_preserves_to_and_body(calls, client):
    response = client.patch(
        f"{DRAFTS}/{DRAFT_ID}",
        json={"subject": "Extension request for A3 (revised)", **CONFIRMED},
    )

    assert response.status_code == 200
    message = updated_message(calls)
    assert message["Subject"] == "Extension request for A3 (revised)"
    assert message["To"] == ORIGINAL_TO
    # The student's actual writing, which they never asked to change.
    assert message_body(message) == ORIGINAL_BODY
    assert response.json()["changed_fields"] == ["subject"]


def test_patching_the_recipient_preserves_subject_and_body(calls, client):
    response = client.patch(
        f"{DRAFTS}/{DRAFT_ID}", json={"to": "ta@uwaterloo.ca", **CONFIRMED})

    assert response.status_code == 200
    message = updated_message(calls)
    assert message["To"] == "ta@uwaterloo.ca"
    assert message["Subject"] == ORIGINAL_SUBJECT
    assert message_body(message) == ORIGINAL_BODY


def test_patch_reads_the_draft_before_replacing_it(calls, client):
    client.patch(f"{DRAFTS}/{DRAFT_ID}", json={"body": "new", **CONFIRMED})

    # The read has to come first and has to be the full payload, or there is
    # nothing to merge from.
    assert [c[0] for c in calls] == ["get", "update"]
    assert only(calls, "get")[1:] == (DRAFT_ID, "full")
    assert only(calls, "update")[1] == DRAFT_ID


def test_patch_returns_the_id_gmail_gave_back(calls, client):
    response = client.patch(
        f"{DRAFTS}/{DRAFT_ID}", json={"body": "new", **CONFIRMED})
    assert response.json()["draft_id"] == DRAFT_ID


def test_patching_everything_lists_every_changed_field(calls, client):
    response = client.patch(
        f"{DRAFTS}/{DRAFT_ID}",
        json={"to": "ta@uwaterloo.ca", "subject": "New", "body": "New body",
              **CONFIRMED},
    )

    assert response.json()["changed_fields"] == ["to", "subject", "body"]


# --------------------------------------------------------------------------
# refusals -- all of them before any Google call
# --------------------------------------------------------------------------

def test_patch_without_a_confirmation_never_touches_google(calls, client):
    response = client.patch(
        f"{DRAFTS}/{DRAFT_ID}", json={"body": "new", "user_confirmation": "  "})

    assert response.status_code == 400
    assert calls == []


def test_patch_with_no_editable_fields_never_touches_google(calls, client):
    response = client.patch(f"{DRAFTS}/{DRAFT_ID}", json=CONFIRMED)

    # An edit that changes nothing must not read back as a successful edit.
    assert response.status_code == 400
    assert calls == []


# --------------------------------------------------------------------------
# a draft that is not there
# --------------------------------------------------------------------------

class _Resp:
    status = 404
    reason = "Not Found"


@pytest.fixture
def missing_draft(monkeypatch):
    """service_for_user hands back a client whose drafts.get 404s."""
    recorded = []
    error = HttpError(_Resp(), b'{"error": {"message": "Not Found"}}')
    monkeypatch.setattr(
        gmail,
        "service_for_user",
        lambda user_id, api, version: _FakeService(recorded, None, error),
    )
    return recorded


def test_patch_of_an_unknown_draft_is_a_404(missing_draft, client):
    response = client.patch(
        f"{DRAFTS}/nope", json={"body": "new", **CONFIRMED})

    assert response.status_code == 404
    assert "nope" in response.json()["detail"]
    # Nothing was written in response to a draft that is not there.
    assert [c for c in missing_draft if c[0] == "update"] == []
