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
from app.services.markdown_to_requests import MarkdownConversionError

DOC_ID = "doc-abc123"
USER = "firebase-uid-1"
ENDPOINT = f"/users/{USER}/docs"


class _Executable:
    def __init__(self, result):
        self._result = result

    def execute(self):
        return self._result


class _FakeDocuments:
    def __init__(self, calls):
        self.calls = calls

    def create(self, body):
        self.calls.append(("create", body))
        return _Executable({"documentId": DOC_ID})

    def batchUpdate(self, documentId, body):  # noqa: N803 -- Google's parameter name
        self.calls.append(("batchUpdate", documentId, body))
        return _Executable({})


class _FakeService:
    def __init__(self, calls):
        self._documents = _FakeDocuments(calls)

    def documents(self):
        return self._documents


@pytest.fixture
def calls(monkeypatch):
    """Records every Google call the router makes."""
    recorded = []
    monkeypatch.setattr(
        docs_service,
        "service_for_user",
        lambda user_id, api, version: _FakeService(recorded),
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
    # Added, not renamed: the agent's existing reads are untouched.
    assert body["formatting_skipped"] is False


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
    assert response.json()["formatting_skipped"] is False

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
    assert response.json()["formatting_skipped"] is False


# --------------------------------------------------------------------------
# failure falls back rather than losing the document
# --------------------------------------------------------------------------

@pytest.fixture
def failing_converter(monkeypatch):
    def boom(_content):
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
    assert body["formatting_skipped"] is True
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
