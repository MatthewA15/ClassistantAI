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
EMAIL_ID = "msg-abc123"

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


class _FakeMessages:
    def __init__(self, calls, message, get_error=None):
        self.calls = calls
        self.message = message
        self.get_error = get_error

    def get(self, userId, id, format):  # noqa: A002,N803 -- Google's parameter names
        self.calls.append(("message.get", id, format))
        if self.get_error is not None:
            return _Raiser(self.get_error)
        return _Executable(self.message)

    def modify(self, userId, id, body):  # noqa: N803
        self.calls.append(("modify", id, body))
        # Apply the change the way Gmail would, so labels_after is a real
        # answer rather than an echo of whatever the endpoint felt like.
        labels = list((self.message or {}).get("labelIds", []))
        for label_id in body.get("addLabelIds", []):
            if label_id not in labels:
                labels.append(label_id)
        for label_id in body.get("removeLabelIds", []):
            if label_id in labels:
                labels.remove(label_id)
        return _Executable({"id": id, "labelIds": labels})


class _FakeLabels:
    def __init__(self, calls, labels):
        self.calls = calls
        self.labels = labels

    def list(self, userId):  # noqa: N803
        self.calls.append(("labels.list",))
        return _Executable({"labels": self.labels})

    def create(self, userId, body):  # noqa: N803
        self.calls.append(("labels.create", body))
        return _Executable({"id": "Label_new", "name": body["name"], "type": "user"})


class _FakeUsers:
    def __init__(self, calls, draft, message, labels, draft_error, message_error):
        self._drafts = _FakeDrafts(calls, draft, draft_error)
        self._messages = _FakeMessages(calls, message, message_error)
        self._labels = _FakeLabels(calls, labels or [])

    def drafts(self):
        return self._drafts

    def messages(self):
        return self._messages

    def labels(self):
        return self._labels


class _FakeService:
    def __init__(self, calls, draft=None, message=None, labels=None,
                 draft_error=None, message_error=None):
        self._users = _FakeUsers(
            calls, draft, message, labels, draft_error, message_error)

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
def message():
    """The email Gmail is currently holding, in `format="metadata"` shape."""
    return {"id": EMAIL_ID, "labelIds": ["INBOX", "UNREAD"]}


@pytest.fixture
def labels():
    """The student's label list, as users.labels.list returns it."""
    return [
        {"id": "Label_7", "name": "Deadlines", "type": "user"},
        {"id": "INBOX", "name": "INBOX", "type": "system"},
        {"id": "TRASH", "name": "TRASH", "type": "system"},
    ]


@pytest.fixture
def calls(monkeypatch, draft, message, labels):
    """Records every Google call the router makes."""
    recorded = []
    monkeypatch.setattr(
        gmail,
        "service_for_user",
        lambda user_id, api, version: _FakeService(
            recorded, draft=draft, message=message, labels=labels),
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
        lambda user_id, api, version: _FakeService(recorded, draft_error=error),
    )
    return recorded


def test_patch_of_an_unknown_draft_is_a_404(missing_draft, client):
    response = client.patch(
        f"{DRAFTS}/nope", json={"body": "new", **CONFIRMED})

    assert response.status_code == 404
    assert "nope" in response.json()["detail"]
    # Nothing was written in response to a draft that is not there.
    assert [c for c in missing_draft if c[0] == "update"] == []


# --------------------------------------------------------------------------
# triage -- explicit verbs, nothing that can destroy mail
# --------------------------------------------------------------------------

TRIAGE = f"/users/{USER}/emails/{EMAIL_ID}/triage"


def triage(client, **json):
    return client.post(TRIAGE, json=json)


def label_calls(calls):
    return [c for c in calls if c[0].startswith("labels.")]


def test_mark_read_removes_only_the_unread_label(calls, client):
    response = triage(client, action="mark_read")

    assert response.status_code == 200
    # Exactly this, and nothing else: no addLabelIds, no INBOX, no drive-by
    # changes to state the student did not ask about.
    assert only(calls, "modify")[2] == {"removeLabelIds": ["UNREAD"]}
    assert label_calls(calls) == []
    assert response.json()["action"] == "mark_read"
    assert response.json()["label"] is None


def test_mark_unread_adds_the_unread_label(calls, client):
    triage(client, action="mark_unread")
    assert only(calls, "modify")[2] == {"addLabelIds": ["UNREAD"]}


def test_archive_removes_the_inbox_label_and_nothing_else(calls, client):
    response = triage(client, action="archive")

    assert response.status_code == 200
    # Archive is a label removal, not a delete -- TRASH must not appear here.
    assert only(calls, "modify")[2] == {"removeLabelIds": ["INBOX"]}


def test_triage_reports_the_labels_either_side_of_the_change(calls, client):
    body = triage(client, action="mark_read").json()

    assert body["labels_before"] == ["INBOX", "UNREAD"]
    assert body["labels_after"] == ["INBOX"]
    assert body["status"] == "triaged"
    assert body["email_id"] == EMAIL_ID


def test_add_label_matches_an_existing_label_case_insensitively(calls, client):
    # The student says "deadlines"; the label reads "Deadlines".
    response = triage(client, action="add_label", label="deadlines")

    assert response.status_code == 200
    assert only(calls, "modify")[2] == {"addLabelIds": ["Label_7"]}
    # Creating a second label differing only in case would be a duplicate the
    # student never asked for.
    assert [c for c in calls if c[0] == "labels.create"] == []
    assert response.json()["label"] == "deadlines"


def test_add_label_creates_the_label_before_applying_it(calls, client):
    response = triage(client, action="add_label", label="Readings")

    assert response.status_code == 200
    kinds = [c[0] for c in calls]
    assert kinds.index("labels.create") < kinds.index("modify")
    assert only(calls, "labels.create")[1] == {"name": "Readings"}
    assert only(calls, "modify")[2] == {"addLabelIds": ["Label_new"]}


def test_remove_label_applies_the_existing_label_id(calls, client):
    triage(client, action="remove_label", label="Deadlines")
    assert only(calls, "modify")[2] == {"removeLabelIds": ["Label_7"]}


def test_remove_label_of_an_unknown_label_is_a_404(calls, client):
    response = triage(client, action="remove_label", label="Nonexistent")

    assert response.status_code == 404
    # Creating a label in order to remove it would be a strange way to do
    # nothing, so nothing was created and nothing was modified.
    assert [c for c in calls if c[0] == "labels.create"] == []
    assert [c for c in calls if c[0] == "modify"] == []


def test_a_system_label_cannot_be_reached_through_the_label_field(calls, client):
    response = triage(client, action="add_label", label="trash")

    assert response.status_code == 400
    # Refused on the name alone: TRASH is never even looked up, so there is no
    # path from this endpoint to the student's bin.
    assert label_calls(calls) == []
    assert [c for c in calls if c[0] == "modify"] == []


def test_every_system_label_name_is_refused(calls, client):
    for name in ("INBOX", "unread", "Spam", "SENT", "STARRED", "important",
                 "CATEGORY_PROMOTIONS"):
        response = triage(client, action="add_label", label=name)
        assert response.status_code == 400, name
    assert [c for c in calls if c[0] == "modify"] == []


def test_a_label_sent_with_a_verb_action_is_refused(calls, client):
    response = triage(client, action="mark_read", label="Deadlines")

    # Silently ignoring it would leave the agent believing it labelled the mail.
    assert response.status_code == 400
    assert calls == []


def test_a_label_action_without_a_label_is_refused(calls, client):
    response = triage(client, action="add_label")

    assert response.status_code == 400
    assert calls == []


def test_a_blank_label_is_not_a_label(calls, client):
    response = triage(client, action="add_label", label="   ")

    assert response.status_code == 400
    assert calls == []


def test_an_unknown_action_is_rejected_by_validation(calls, client):
    response = triage(client, action="delete")

    # There is no delete verb, and Literal makes that a schema fact the agent's
    # generated tool can see rather than a runtime surprise.
    assert response.status_code == 422
    assert calls == []


def test_triage_refuses_a_comma_joined_email_id(calls, client):
    response = client.post(
        f"/users/{USER}/emails/a,b/triage", json={"action": "mark_read"})

    assert response.status_code == 400
    assert calls == []


@pytest.fixture
def missing_email(monkeypatch, draft, labels):
    """service_for_user hands back a client whose messages.get 404s."""
    recorded = []
    error = HttpError(_Resp(), b'{"error": {"message": "Not Found"}}')
    monkeypatch.setattr(
        gmail,
        "service_for_user",
        lambda user_id, api, version: _FakeService(
            recorded, draft=draft, labels=labels, message_error=error),
    )
    return recorded


def test_triage_of_an_unknown_email_is_a_404(missing_email, client):
    response = client.post(
        f"/users/{USER}/emails/nope/triage", json={"action": "archive"})

    assert response.status_code == 404
    assert "nope" in response.json()["detail"]
    assert [c for c in missing_email if c[0] == "modify"] == []
