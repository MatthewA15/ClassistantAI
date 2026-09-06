"""Tests for POST /users/{user_id}/drive/files.

Recorder pattern, as in `test_docs_router.py`: the Google client is a fake
that captures the exact calls, so these assert what would go over the wire.

The two that matter are the folder ones. Under `drive.file` this app can only
see what it created itself, so the "Classistant" folder has to be found by the
app's own query and created when it is absent -- a file uploaded to the wrong
parent (or to no parent) is a file this connector can never find again.
"""
import base64

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from googleapiclient.errors import HttpError

import app.routers.drive as drive

USER = "firebase-uid-1"
FILES = f"/users/{USER}/drive/files"
FOLDER_ID = "folder-classistant"
FILE_ID = "file-xyz789"

CONTENT = b"Week 1 study plan\n- read chapter 2\n"


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


class _FakeFiles:
    def __init__(self, calls, folders, create_error=None):
        self.calls = calls
        self.folders = folders
        self.create_error = create_error

    def list(self, q, spaces, fields, pageSize):  # noqa: N803 -- Google's parameter names
        self.calls.append(("list", q, spaces))
        return _Executable({"files": self.folders})

    def create(self, body, fields, media_body=None):  # noqa: N803
        kind = "create_folder" if media_body is None else "create_file"
        self.calls.append((kind, body, media_body))
        if self.create_error is not None:
            return _Raiser(self.create_error)
        if kind == "create_folder":
            return _Executable({"id": FOLDER_ID})
        return _Executable({
            "id": FILE_ID,
            "name": body["name"],
            "mimeType": "text/plain",
            "modifiedTime": "2026-09-05T12:00:00.000Z",
            "webViewLink": f"https://drive.google.com/file/d/{FILE_ID}/view",
            # Drive returns size as a string.
            "size": "34",
        })


class _FakeService:
    def __init__(self, calls, folders, create_error=None):
        self._files = _FakeFiles(calls, folders, create_error)

    def files(self):
        return self._files


@pytest.fixture
def folders():
    """What the app's own folder query finds. Empty means first upload ever."""
    return [{"id": FOLDER_ID, "name": "Classistant"}]


@pytest.fixture
def calls(monkeypatch, folders):
    recorded = []
    monkeypatch.setattr(
        drive,
        "service_for_user",
        lambda user_id, api, version: _FakeService(recorded, folders),
    )
    return recorded


@pytest.fixture
def client():
    api = FastAPI()
    api.include_router(drive.router)
    return TestClient(api)


def upload(client, content=CONTENT, filename="week1-plan.txt", mime_type="text/plain"):
    return client.post(FILES, json={
        "filename": filename,
        "mime_type": mime_type,
        "data": base64.b64encode(content).decode(),
    })


def only(calls, kind):
    matching = [c for c in calls if c[0] == kind]
    assert len(matching) == 1, f"expected one {kind}, got {len(matching)}"
    return matching[0]


# --------------------------------------------------------------------------
# the app-owned folder
# --------------------------------------------------------------------------

def test_an_existing_folder_is_reused_not_recreated(calls, client):
    response = upload(client)

    assert response.status_code == 201
    assert [c for c in calls if c[0] == "create_folder"] == []
    # Into the folder that was found, not into the Drive root.
    assert only(calls, "create_file")[1]["parents"] == [FOLDER_ID]
    assert response.json()["folder"] == "Classistant"


def test_the_folder_is_created_first_when_there_is_none(calls, client, folders):
    folders.clear()

    response = upload(client)

    assert response.status_code == 201
    kinds = [c[0] for c in calls]
    assert kinds == ["list", "create_folder", "create_file"]
    folder_body = only(calls, "create_folder")[1]
    assert folder_body == {
        "name": "Classistant",
        "mimeType": "application/vnd.google-apps.folder",
    }
    # The file lands in the folder that was just made.
    assert only(calls, "create_file")[1]["parents"] == [FOLDER_ID]


def test_the_folder_query_only_matches_this_apps_own_untrashed_folder(calls, client):
    upload(client)

    _, q, spaces = only(calls, "list")
    assert "name = 'Classistant'" in q
    assert "mimeType = 'application/vnd.google-apps.folder'" in q
    assert "trashed = false" in q
    assert "'root' in parents" in q
    assert spaces == "drive"


# --------------------------------------------------------------------------
# the upload itself
# --------------------------------------------------------------------------

def test_the_uploaded_content_and_type_reach_drive(calls, client):
    upload(client, content=CONTENT, mime_type="text/markdown")

    _, body, media = only(calls, "create_file")
    assert body["name"] == "week1-plan.txt"
    assert media.mimetype() == "text/markdown"
    assert media.size() == len(CONTENT)


def test_a_small_upload_is_not_resumable_and_a_large_one_is(calls, client):
    upload(client, content=b"x" * 1024)
    assert only(calls, "create_file")[2].resumable() is False

    calls.clear()
    upload(client, content=b"x" * (drive._RESUMABLE_ABOVE_BYTES + 1))
    assert only(calls, "create_file")[2].resumable() is True


def test_the_filename_is_sanitised(calls, client):
    upload(client, filename='we"ek\r\n1.txt')
    assert only(calls, "create_file")[1]["name"] == "week1.txt"


def test_the_response_describes_the_stored_file(calls, client):
    body = upload(client).json()

    assert body == {
        "file_id": FILE_ID,
        "name": "week1-plan.txt",
        "web_view_link": f"https://drive.google.com/file/d/{FILE_ID}/view",
        "folder": "Classistant",
        # Drive's string size, as an int the agent can compare.
        "size": 34,
        "status": "uploaded",
    }


# --------------------------------------------------------------------------
# refusals -- all of them before any Google call
# --------------------------------------------------------------------------

def test_invalid_base64_is_a_400_before_any_google_call(calls, client):
    response = client.post(FILES, json={
        "filename": "notes.txt", "mime_type": "text/plain",
        "data": "this is not base64!!",
    })

    assert response.status_code == 400
    assert calls == []


def test_empty_data_is_a_400(calls, client):
    response = client.post(FILES, json={
        "filename": "notes.txt", "mime_type": "text/plain", "data": ""})

    assert response.status_code == 400
    assert calls == []


def test_a_file_over_the_cap_is_a_413_before_any_google_call(calls, client):
    response = upload(client, content=b"x" * (drive._MAX_UPLOAD_BYTES + 1))

    assert response.status_code == 413
    # The cap exists to fail fast and cheaply, which it does not do if the
    # bytes have already been handed to Drive.
    assert calls == []


# --------------------------------------------------------------------------
# a grant that predates the write scope
# --------------------------------------------------------------------------

class _Resp:
    status = 403
    reason = "Forbidden"


@pytest.fixture
def forbidden(monkeypatch, folders):
    recorded = []
    error = HttpError(_Resp(), b'{"error": {"message": "Insufficient Permission"}}')
    monkeypatch.setattr(
        drive,
        "service_for_user",
        lambda user_id, api, version: _FakeService(recorded, folders, error),
    )
    return recorded


def test_a_403_from_google_asks_for_re_consent(forbidden, client):
    response = upload(client)

    assert response.status_code == 403
    # The same wording download_file already uses, so one message covers both.
    assert "re-consent" in response.json()["detail"]
