"""Gmail connector (P1: read; P2: create drafts).

Drafts only, never auto-send (team decision Aug 19): the agent may prepare an
email to a prof, but the student clicks send.
"""
from fastapi import APIRouter, Query
from pydantic import BaseModel, EmailStr
from email.mime.text import MIMEText
import base64

from app.services.google_creds import service_for_user

router = APIRouter(prefix="/users/{user_id}", tags=["gmail"])


def _header(headers: list[dict], name: str) -> str | None:
    return next((h["value"] for h in headers if h["name"].lower() == name.lower()), None)


@router.get("/emails")
def list_emails(
    user_id: str,
    max_results: int = Query(10, le=50),
    q: str | None = Query(None, description="Gmail search query, e.g. 'from:prof after:2026/08/01'"),
):
    """P1. Recent emails with metadata + snippet (enough for the agent to rank/summarize)."""
    svc = service_for_user(user_id, "gmail", "v1")
    resp = svc.users().messages().list(userId="me", maxResults=max_results, q=q).execute()
    out = []
    for m in resp.get("messages", []):
        msg = svc.users().messages().get(
            userId="me", id=m["id"], format="metadata",
            metadataHeaders=["From", "To", "Subject", "Date"],
        ).execute()
        headers = msg["payload"]["headers"]
        out.append({
            "id": msg["id"],
            "thread_id": msg["threadId"],
            "from": _header(headers, "From"),
            "subject": _header(headers, "Subject"),
            "date": _header(headers, "Date"),
            "snippet": msg.get("snippet"),
            "labels": msg.get("labelIds", []),
        })
    return {"emails": out, "count": len(out)}


class DraftIn(BaseModel):
    to: EmailStr
    subject: str
    body: str


@router.post("/emails/drafts", status_code=201)
def create_draft(user_id: str, draft: DraftIn):
    """P2. Creates a Gmail draft. This service intentionally has no send endpoint."""
    svc = service_for_user(user_id, "gmail", "v1")
    mime = MIMEText(draft.body)
    mime["to"], mime["subject"] = draft.to, draft.subject
    raw = base64.urlsafe_b64encode(mime.as_bytes()).decode()
    created = svc.users().drafts().create(userId="me", body={"message": {"raw": raw}}).execute()
    return {"draft_id": created["id"], "status": "draft_created"}
