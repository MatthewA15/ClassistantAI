"""Tests for the /users/{user_id}/docs endpoint.

The Google client is replaced with a recorder that captures the exact
batchUpdate body, so these assert what would go over the wire without
mocking out the thing under test.

The load-bearing test here is `test_markdown_false_sends_exactly_todays_request`:
the agent is already calling this endpoint, and the flag defaulting to false has
to mean byte-for-byte no change.
"""
import logging

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

import app.routers.docs_service as docs_service
from app.services.markdown_to_requests import MarkdownConversionError, utf16_len
from googleapiclient.errors import HttpError

DOC_ID = "doc-abc123"
USER = "firebase-uid-1"
ENDPOINT = f"/users/{USER}/docs"


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


class _FakeDocuments:
    def __init__(self, calls, document=None, get_error=None):
        self.calls = calls
        self.document = document
        self.get_error = get_error

    def create(self, body):
        self.calls.append(("create", body))
        return _Executable({"documentId": DOC_ID})

    def get(self, documentId):  # noqa: N803 -- Google's parameter name
        self.calls.append(("get", documentId))
        if self.get_error is not None:
            return _Raiser(self.get_error)
        return _Executable(self.document)

    def batchUpdate(self, documentId, body):  # noqa: N803 -- Google's parameter name
        self.calls.append(("batchUpdate", documentId, body))
        return _Executable({})


class _FakeService:
    def __init__(self, calls, document=None, get_error=None):
        self._documents = _FakeDocuments(calls, document, get_error)

    def documents(self):
        return self._documents


EXISTING_TEXT = "Week 1 plan\nRead chapter 2"


def a_document(text: str) -> dict:
    """A `documents.get` response holding `text`, indexed the way Docs indexes.

    The body starts at index 1 and ends with Docs' own newline, and the end
    index counts UTF-16 code units -- which is why this measures with
    `utf16_len` and not `len`. Building the fixture the way Google builds the
    real thing is what lets the emoji test below mean anything.
    """
    return {
        "documentId": DOC_ID,
        "body": {
            "content": [
                {"startIndex": 0, "endIndex": 1, "sectionBreak": {}},
                {
                    "startIndex": 1,
                    "endIndex": 1 + utf16_len(text) + 1,  # text, then its newline
                    "paragraph": {"elements": [{"textRun": {"content": text + "\n"}}]},
                },
            ]
        },
    }


@pytest.fixture
def document():
    """The doc Google is currently holding, for the PATCH tests."""
    return a_document(EXISTING_TEXT)


@pytest.fixture
def calls(monkeypatch, document):
    """Records every Google call the router makes."""
    recorded = []
    monkeypatch.setattr(
        docs_service,
        "service_for_user",
        lambda user_id, api, version: _FakeService(recorded, document),
    )
    return recorded


@pytest.fixture
def client():
    api = FastAPI()
    api.include_router(docs_service.router)
    return TestClient(api)


def batch_requests(calls):
    """The `requests` list from the single batchUpdate call."""
    batches = [c for c in calls if c[0] == "batchUpdate"]
    assert len(batches) == 1, f"expected one batchUpdate, got {len(batches)}"
    return batches[0][2]["requests"]


# --------------------------------------------------------------------------
# the existing contract must not move
# --------------------------------------------------------------------------

def test_markdown_false_sends_exactly_todays_request(calls, client):
    content = "# Not a heading\n\n**not bold**\n- not a bullet"
    response = client.post(
        ENDPOINT, json={"title": "Plan", "content": content, "markdown": False}
    )

    assert response.status_code == 201
    # Byte-for-byte the request this endpoint has always sent: one insertText
    # carrying the content verbatim, markdown syntax and all.
    assert batch_requests(calls) == [
        {"insertText": {"location": {"index": 1}, "text": content}}
    ]


def test_markdown_field_is_optional_and_defaults_to_the_old_behaviour(calls, client):
    content = "# Still literal"
    response = client.post(ENDPOINT, json={"title": "Plan", "content": content})

    assert response.status_code == 201
    assert batch_requests(calls) == [
        {"insertText": {"location": {"index": 1}, "text": content}}
    ]


def test_response_keeps_its_existing_fields(calls, client):
    response = client.post(ENDPOINT, json={"title": "Plan", "content": "hi"})
    body = response.json()

    assert body["doc_id"] == DOC_ID
    assert body["url"] == f"https://docs.google.com/document/d/{DOC_ID}/edit"
    assert body["status"] == "created"
    # Added, not renamed: the agent's existing reads are untouched. This is
    # also the regression test for the response_model trap -- the field is
    # declared on DocCreatedResponse, so it survives FastAPI's filtering. A
    # loose dict key would be dropped here and raise KeyError.
    assert body["formatting_applied"] is True


def test_document_is_created_with_the_title(calls, client):
    client.post(ENDPOINT, json={"title": "Week 1 Plan", "content": ""})
    assert ("create", {"title": "Week 1 Plan"}) in calls


def test_empty_content_sends_no_batch_update(calls, client):
    response = client.post(ENDPOINT, json={"title": "Plan", "content": ""})
    assert response.status_code == 201
    assert [c for c in calls if c[0] == "batchUpdate"] == []


# --------------------------------------------------------------------------
# the new path
# --------------------------------------------------------------------------

def test_markdown_true_sends_converted_requests(calls, client):
    response = client.post(
        ENDPOINT,
        json={"title": "Plan", "content": "# Plan\n\n- one\n- two", "markdown": True},
    )

    assert response.status_code == 201
    assert response.json()["formatting_applied"] is True

    requests = batch_requests(calls)
    assert requests[0] == {
        "insertText": {"location": {"index": 1}, "text": "Plan\none\ntwo"}
    }
    kinds = [next(iter(r)) for r in requests]
    assert kinds == ["insertText", "updateParagraphStyle", "createParagraphBullets"]


def test_markdown_true_with_no_renderable_text_sends_no_batch_update(calls, client):
    # A thematic break carries no text, so there is nothing to insert.
    response = client.post(
        ENDPOINT, json={"title": "Plan", "content": "---", "markdown": True}
    )

    assert response.status_code == 201
    assert [c for c in calls if c[0] == "batchUpdate"] == []
    # Nothing failed -- there was simply nothing to format.
    assert response.json()["formatting_applied"] is True


# --------------------------------------------------------------------------
# failure falls back rather than losing the document
# --------------------------------------------------------------------------

@pytest.fixture
def failing_converter(monkeypatch):
    # **_kwargs: create_doc calls the converter positionally, patch_doc passes
    # insert_index too. One stub has to stand in for both call sites.
    def boom(_content, **_kwargs):
        raise MarkdownConversionError("markdown conversion failed in ValueError")

    monkeypatch.setattr(docs_service, "markdown_to_requests", boom)


def test_converter_failure_falls_back_to_the_plain_insert(calls, client, failing_converter):
    content = "# Malformed **thing"
    response = client.post(
        ENDPOINT, json={"title": "Plan", "content": content, "markdown": True}
    )

    assert response.status_code == 201
    assert batch_requests(calls) == [
        {"insertText": {"location": {"index": 1}, "text": content}}
    ]


def test_converter_failure_is_reported_in_the_response(calls, client, failing_converter):
    response = client.post(
        ENDPOINT, json={"title": "Plan", "content": "# x", "markdown": True}
    )

    body = response.json()
    assert body["formatting_applied"] is False
    # The document still exists and is still usable.
    assert body["doc_id"] == DOC_ID
    assert body["status"] == "created"


def test_converter_failure_logs_the_failure_but_never_the_content(
    calls, client, failing_converter, caplog
):
    secret = "the student's private revision timetable"
    with caplog.at_level(logging.ERROR, logger=docs_service.__name__):
        client.post(
            ENDPOINT,
            json={"title": "Plan", "content": f"# {secret}", "markdown": True},
        )

    assert caplog.records, "the fallback must be logged, or it cannot be debugged"
    logged = "\n".join(r.getMessage() + (r.exc_text or "") for r in caplog.records)
    assert secret not in logged
    # Still enough to debug: which document, how much content, and a traceback.
    assert DOC_ID in logged
    assert "MarkdownConversionError" in logged


# --------------------------------------------------------------------------
# PATCH -- append adds, replace destroys
# --------------------------------------------------------------------------

PATCH_ENDPOINT = f"{ENDPOINT}/{DOC_ID}"
END_INDEX = 1 + utf16_len(EXISTING_TEXT) + 1
CONFIRMED = {"user_confirmation": "yes, rewrite it"}


def patch_requests(calls):
    """The `requests` list from the single batchUpdate the PATCH sent."""
    return batch_requests(calls)


def test_append_inserts_at_the_end_and_deletes_nothing(calls, client):
    response = client.patch(
        PATCH_ENDPOINT, json={"content": "\nRead chapter 3", "mode": "append"}
    )

    assert response.status_code == 200
    requests = patch_requests(calls)
    # Just short of the body's own final newline, which cannot be written past.
    assert requests == [
        {"insertText": {"location": {"index": END_INDEX - 1},
                        "text": "\nRead chapter 3"}}
    ]
    # The whole promise of append: nothing already in the document is touched.
    assert not any("deleteContentRange" in r for r in requests)
    body = response.json()
    assert body["mode"] == "append"
    assert body["status"] == "updated"
    assert body["url"] == f"https://docs.google.com/document/d/{DOC_ID}/edit"


def test_replace_deletes_the_body_first_then_writes_at_the_start(calls, client):
    response = client.patch(
        PATCH_ENDPOINT,
        json={"content": "A fresh plan", "mode": "replace", **CONFIRMED},
    )

    assert response.status_code == 200
    requests = patch_requests(calls)
    # Order is the whole correctness argument: insert-then-delete would delete
    # what was just written.
    assert requests[0] == {
        "deleteContentRange": {"range": {"startIndex": 1, "endIndex": END_INDEX - 1}}
    }
    assert requests[1] == {
        "insertText": {"location": {"index": 1}, "text": "A fresh plan"}
    }
    assert len(requests) == 2
    assert response.json()["mode"] == "replace"


def test_replace_and_append_are_one_batch_each(calls, client):
    client.patch(PATCH_ENDPOINT,
                 json={"content": "x", "mode": "replace", **CONFIRMED})
    # One batchUpdate, so the delete and the insert cannot half-apply.
    assert len([c for c in calls if c[0] == "batchUpdate"]) == 1


def test_replace_of_an_empty_document_skips_the_delete(calls, client, document):
    document.clear()
    document.update(a_document(""))

    response = client.patch(
        PATCH_ENDPOINT, json={"content": "First words", "mode": "replace", **CONFIRMED}
    )

    assert response.status_code == 200
    # There is nothing to delete, and an empty range is an error rather than a
    # no-op, so only the insert goes.
    assert patch_requests(calls) == [
        {"insertText": {"location": {"index": 1}, "text": "First words"}}
    ]


# --------------------------------------------------------------------------
# the confirmation, on the destructive mode only
# --------------------------------------------------------------------------

def test_replace_without_a_confirmation_never_touches_google(calls, client):
    response = client.patch(
        PATCH_ENDPOINT,
        json={"content": "A fresh plan", "mode": "replace", "user_confirmation": "   "},
    )

    assert response.status_code == 400
    # Not even the read: an unconfirmed replace is refused before we look.
    assert calls == []


def test_replace_with_no_confirmation_field_at_all_is_refused(calls, client):
    response = client.patch(
        PATCH_ENDPOINT, json={"content": "A fresh plan", "mode": "replace"})

    assert response.status_code == 400
    assert calls == []


def test_append_needs_no_confirmation(calls, client):
    response = client.patch(
        PATCH_ENDPOINT, json={"content": "more", "mode": "append"})

    # Append removes nothing, so asking the student to confirm it would be
    # asking about a change that cannot lose anything.
    assert response.status_code == 200
    assert len([c for c in calls if c[0] == "batchUpdate"]) == 1


def test_mode_is_required_and_has_no_default(calls, client):
    response = client.patch(PATCH_ENDPOINT, json={"content": "more"})

    # Neither mode is a safe guess, so the agent has to say which it means.
    assert response.status_code == 422
    assert calls == []


def test_an_unknown_mode_is_rejected_by_validation(calls, client):
    response = client.patch(
        PATCH_ENDPOINT, json={"content": "more", "mode": "prepend"})

    assert response.status_code == 422
    assert calls == []


# --------------------------------------------------------------------------
# UTF-16: the indices Docs counts are not the characters Python counts
# --------------------------------------------------------------------------

def test_indices_are_utf16_code_units_not_python_characters(calls, client, document):
    # One mortarboard: a single Python character occupying TWO Docs indices.
    text = "\U0001F393 Week 1 goals"
    document.clear()
    document.update(a_document(text))

    client.patch(PATCH_ENDPOINT, json={"content": " done", "mode": "append"})

    end_index = 1 + utf16_len(text) + 1
    assert patch_requests(calls) == [
        {"insertText": {"location": {"index": end_index - 1}, "text": " done"}}
    ]
    # And the same arithmetic done with len() would have written one index
    # early -- inside the document's last word, silently.
    wrong = 1 + len(text) + 1
    assert end_index - 1 != wrong - 1


def test_replace_deletes_the_whole_range_of_a_document_with_emoji(calls, client, document):
    text = "\U0001F393 Week 1 goals"
    document.clear()
    document.update(a_document(text))

    client.patch(PATCH_ENDPOINT,
                 json={"content": "new", "mode": "replace", **CONFIRMED})

    delete = patch_requests(calls)[0]["deleteContentRange"]["range"]
    # Short by one and the emoji's second code unit survives as a lone
    # surrogate; long by one and Docs rejects the whole batch.
    assert delete == {"startIndex": 1, "endIndex": 1 + utf16_len(text)}


# --------------------------------------------------------------------------
# markdown, on the same terms POST /docs set
# --------------------------------------------------------------------------

def test_markdown_append_offsets_every_index_by_the_insertion_point(calls, client):
    response = client.patch(
        PATCH_ENDPOINT,
        json={"content": "# Week 2\n\n- one\n- two", "mode": "append", "markdown": True},
    )

    assert response.status_code == 200
    requests = patch_requests(calls)
    insert_at = END_INDEX - 1
    assert requests[0] == {
        "insertText": {"location": {"index": insert_at}, "text": "Week 2\none\ntwo"}
    }
    # Styles land on the text that was just inserted, not at the top of the
    # document: every range is shifted by the insertion point.
    assert requests[1]["updateParagraphStyle"]["range"]["startIndex"] == insert_at
    assert [next(iter(r)) for r in requests] == [
        "insertText", "updateParagraphStyle", "createParagraphBullets"
    ]


def test_markdown_defaults_off_matching_post_docs(calls, client):
    client.patch(PATCH_ENDPOINT,
                 json={"content": "# Not a heading", "mode": "append"})

    assert patch_requests(calls) == [
        {"insertText": {"location": {"index": END_INDEX - 1},
                        "text": "# Not a heading"}}
    ]


def test_a_failed_conversion_still_writes_the_text(calls, client, failing_converter):
    content = "# Malformed **thing"
    response = client.patch(
        PATCH_ENDPOINT,
        json={"content": content, "mode": "append", "markdown": True},
    )

    assert response.status_code == 200
    assert patch_requests(calls) == [
        {"insertText": {"location": {"index": END_INDEX - 1}, "text": content}}
    ]
    # The edit landed; only its formatting did not.
    assert response.json()["formatting_applied"] is False


def test_a_failed_conversion_on_replace_still_deletes_and_writes(calls, client, failing_converter):
    response = client.patch(
        PATCH_ENDPOINT,
        json={"content": "# x", "mode": "replace", "markdown": True, **CONFIRMED},
    )

    requests = patch_requests(calls)
    assert requests[0]["deleteContentRange"]["range"]["startIndex"] == 1
    assert requests[1] == {
        "insertText": {"location": {"index": 1}, "text": "# x"}}
    assert response.json()["formatting_applied"] is False


def test_a_successful_conversion_reports_formatting_applied(calls, client):
    response = client.patch(
        PATCH_ENDPOINT,
        json={"content": "# Week 2", "mode": "append", "markdown": True},
    )
    assert response.json()["formatting_applied"] is True


# --------------------------------------------------------------------------
# a document that isn't there, or isn't ours
# --------------------------------------------------------------------------

class _Resp:
    def __init__(self, status):
        self.status = status
        self.reason = "Error"


def _failing_get(monkeypatch, status):
    recorded = []
    error = HttpError(_Resp(status), b'{"error": {"message": "nope"}}')
    monkeypatch.setattr(
        docs_service,
        "service_for_user",
        lambda user_id, api, version: _FakeService(recorded, None, error),
    )
    return recorded


def test_patch_of_an_unknown_document_is_a_404(monkeypatch, client):
    calls = _failing_get(monkeypatch, 404)

    response = client.patch(PATCH_ENDPOINT, json={"content": "x", "mode": "append"})

    assert response.status_code == 404
    assert DOC_ID in response.json()["detail"]
    assert [c for c in calls if c[0] == "batchUpdate"] == []


def test_patch_without_access_asks_for_re_consent(monkeypatch, client):
    calls = _failing_get(monkeypatch, 403)

    response = client.patch(PATCH_ENDPOINT, json={"content": "x", "mode": "append"})

    assert response.status_code == 403
    # The wording drive.py already uses, so one message covers both connectors.
    assert "re-consent" in response.json()["detail"]
    assert [c for c in calls if c[0] == "batchUpdate"] == []
