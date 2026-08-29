"""Google Docs connector (P2: create a doc, e.g. an agent-generated study plan).

Team decision Aug 19: agent-created artifacts live in Drive (email would be
too disorganized), so this creates a real Doc the student can open/share.
"""
from fastapi import APIRouter
from pydantic import BaseModel, Field

from app.services.google_creds import service_for_user

router = APIRouter(prefix="/users/{user_id}/docs", tags=["docs"])


class DocIn(BaseModel):
    title: str
    content: str  # plain text; agent formats with newlines


class DocCreatedResponse(BaseModel):
    doc_id: str = Field(..., description="Google Docs documentId.")
    url: str = Field(..., description="Editable URL for the new Doc.")
    status: str = "created"


@router.post("", status_code=201, response_model=DocCreatedResponse)
def create_doc(user_id: str, doc: DocIn):
    """Create a Google Doc with the given title and plain-text content (e.g. an agent-generated study plan)."""
    svc = service_for_user(user_id, "docs", "v1")
    created = svc.documents().create(body={"title": doc.title}).execute()
    doc_id = created["documentId"]
    if doc.content:
        svc.documents().batchUpdate(
            documentId=doc_id,
            body={"requests": [
                {"insertText": {"location": {"index": 1}, "text": doc.content}}]},
        ).execute()
    return DocCreatedResponse(
        doc_id=doc_id,
        url=f"https://docs.google.com/document/d/{doc_id}/edit",
    )
