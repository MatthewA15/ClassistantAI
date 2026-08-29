"""Google Docs connector (P2: create a doc, e.g. an agent-generated study plan).

Team decision Aug 19: agent-created artifacts live in Drive (email would be
too disorganized), so this creates a real Doc the student can open/share.
"""
import logging

from fastapi import APIRouter
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
