"""Google Docs connector (P2: create a doc and edit it, e.g. an agent-generated study plan).

Team decision Aug 19: agent-created artifacts live in Drive (email would be
too disorganized), so this creates a real Doc the student can open/share.
"""
import logging
from typing import Literal

from fastapi import APIRouter, HTTPException
from googleapiclient.errors import HttpError
from pydantic import BaseModel, Field

from app.services.google_creds import service_for_user
from app.services.markdown_to_requests import (
    MarkdownConversionError,
    markdown_to_requests,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/users/{user_id}/docs", tags=["docs"])


class DocIn(BaseModel):
    title: str
    content: str  # plain text; agent formats with newlines
    markdown: bool = False  # opt in to rendering `content` as markdown


class DocCreatedResponse(BaseModel):
    doc_id: str = Field(..., description="Google Docs documentId.")
    url: str = Field(..., description="Editable URL for the new Doc.")
    status: str = "created"
    formatting_applied: bool = Field(
        True,
        description=(
            "False only when `markdown: true` was requested and the conversion "
            "failed -- the Doc was still created, with `content` inserted as "
            "unformatted plain text. True when markdown rendered successfully, "
            "and True when no formatting was requested."
        ),
    )


@router.post("", status_code=201, response_model=DocCreatedResponse)
def create_doc(user_id: str, doc: DocIn):
    """Create a Google Doc with the given title and content (e.g. an agent-generated study plan).

    `content` is inserted verbatim unless `markdown` is true, in which case it
    is parsed and rendered with real Docs headings, bold, links and lists.
    """
    svc = service_for_user(user_id, "docs", "v1")
    created = svc.documents().create(body={"title": doc.title}).execute()
    doc_id = created["documentId"]
    formatting_applied = True
    if doc.content:
        requests = None
        if doc.markdown:
            try:
                requests = markdown_to_requests(doc.content)
            except MarkdownConversionError:
                # Losing the document because a heading was malformed is the
                # wrong trade: fall back to the plain insert and say so in the
                # response. Content never reaches the log -- only its size.
                logger.exception(
                    "markdown conversion failed; inserting unformatted text "
                    "(doc_id=%s, content_chars=%d)",
                    doc_id,
                    len(doc.content),
                )
                formatting_applied = False
        if requests is None:
            requests = [
                {"insertText": {"location": {"index": 1}, "text": doc.content}}]
        if requests:
            svc.documents().batchUpdate(
                documentId=doc_id,
                body={"requests": requests},
            ).execute()
    # Returned as the model, not a dict: `response_model` filters anything not
    # declared on DocCreatedResponse, so a loose key here would be dropped
    # silently and a failed conversion would be invisible to the agent.
    return DocCreatedResponse(
        doc_id=doc_id,
        url=f"https://docs.google.com/document/d/{doc_id}/edit",
        formatting_applied=formatting_applied,
    )


class DocPatchIn(BaseModel):
    content: str = Field(...,
                         description="The text to write. Parsed as markdown when `markdown` is true.")
    mode: Literal["append", "replace"] = Field(
        ...,
        description=("append: add `content` at the end, removing nothing. "
                     "replace: discard the document's entire contents first. No default -- say which."))
    markdown: bool = Field(
        False, description="Render `content` as markdown. Mirrors the default on POST /docs.")
    user_confirmation: str | None = Field(
        None,
        description=("The user's confirmation (e.g. 'yes, rewrite it'). Required and non-empty "
                     "for mode='replace'; not needed for append."))


class DocUpdatedResponse(BaseModel):
    doc_id: str = Field(..., description="Google Docs documentId.")
    url: str = Field(..., description="Editable URL for the Doc.")
    mode: str = Field(..., description="The mode that was applied.")
    status: str = "updated"
    formatting_applied: bool = Field(
        True,
        description=(
            "False only when `markdown: true` was requested and the conversion "
            "failed -- the edit still landed, with `content` written as "
            "unformatted plain text. True when markdown rendered successfully, "
            "and True when no formatting was requested."
        ),
    )


def _body_end_index(document: dict) -> int:
    """The document body's end index, in the UTF-16 code units Docs counts.

    Read from the last structural element, never measured here. Docs indices
    are UTF-16 code units rather than Python characters -- one emoji is a
    single `len()` character but TWO indices -- so an index recomputed from
    the document's text with `len()` points at the wrong place and silently
    corrupts the edit. Google already reports this number in the right unit,
    and the only way to get it wrong is to work it out again.

    (`markdown_to_requests` measures its own text, and measures it with
    `utf16_len` for exactly this reason.)
    """
    content = (document.get("body") or {}).get("content") or []
    if not content:
        # An empty body is still one mandatory newline sitting at index 1.
        return 2
    return content[-1].get("endIndex", 2)


@router.patch("/{doc_id}", response_model=DocUpdatedResponse)
def patch_doc(user_id: str, doc_id: str, patch: DocPatchIn):
    """Edit an existing Google Doc: append to the end of it, or replace everything in it.

    `mode` is required and has no default, because the two are not
    interchangeable and the difference is the student's document:

      - "append" adds `content` at the end and removes NOTHING. Everything
        already written stays exactly where it is. Begin `content` with a
        newline if it should start its own paragraph instead of continuing the
        last one.
      - "replace" DISCARDS the document's entire current contents and writes
        `content` in their place. This service cannot undo that.

    So "replace" requires `user_confirmation` -- what the student said when
    they agreed to lose what is in the document -- and "append" requires none.
    That is the same line the calendar endpoints draw: the destructive action
    is confirmed, the additive one is not.

    `content` is written verbatim unless `markdown` is true, in which case it
    is rendered with real Docs headings, bold, links and lists. If that
    conversion fails the text still lands, unformatted, and
    `formatting_applied` comes back false -- a malformed heading never costs
    the student their edit.
    """
    if patch.mode == "replace" and not (patch.user_confirmation or "").strip():
        raise HTTPException(
            400, "Confirmation message is required to replace a document's contents.")

    svc = service_for_user(user_id, "docs", "v1")
    try:
        document = svc.documents().get(documentId=doc_id).execute()
    except HttpError as e:
        if e.resp.status == 404:
            raise HTTPException(404, f"Document {doc_id} not found")
        if e.resp.status == 403:
            raise HTTPException(
                403, "No access to this file — user may need to re-consent with updated scopes")
        raise

    end_index = _body_end_index(document)
    requests: list[dict] = []

    if patch.mode == "replace":
        # Index 1 is the first editable position, and the newline at
        # end_index - 1 is the body's own: Docs refuses to delete it, so the
        # range stops just short. A document with nothing in it yet has
        # nothing to delete, and an empty range is an error rather than a
        # no-op, so the request is omitted entirely.
        if end_index - 1 > 1:
            requests.append({
                "deleteContentRange": {
                    "range": {"startIndex": 1, "endIndex": end_index - 1}
                }
            })
        insert_at = 1
    else:
        insert_at = end_index - 1

    formatting_applied = True
    if patch.content:
        content_requests = None
        if patch.markdown:
            try:
                content_requests = markdown_to_requests(
                    patch.content, insert_index=insert_at)
            except MarkdownConversionError:
                # Same trade create_doc makes: the edit is worth more than its
                # formatting. Content never reaches the log -- only its size.
                logger.exception(
                    "markdown conversion failed; inserting unformatted text "
                    "(doc_id=%s, mode=%s, content_chars=%d)",
                    doc_id,
                    patch.mode,
                    len(patch.content),
                )
                formatting_applied = False
        if content_requests is None:
            content_requests = [
                {"insertText": {"location": {"index": insert_at}, "text": patch.content}}]
        # After the delete, so the insert lands in the emptied document.
        requests.extend(content_requests)

    if requests:
        svc.documents().batchUpdate(
            documentId=doc_id, body={"requests": requests}).execute()

    return DocUpdatedResponse(
        doc_id=doc_id,
        url=f"https://docs.google.com/document/d/{doc_id}/edit",
        mode=patch.mode,
        formatting_applied=formatting_applied,
    )
