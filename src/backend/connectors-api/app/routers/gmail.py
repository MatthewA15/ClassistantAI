"""
Gmail connector (P1: read; P2: create drafts, send drafts).
"""

from datetime import datetime, timezone
from fastapi import APIRouter, HTTPException, Query
from googleapiclient.errors import HttpError
from pydantic import BaseModel, EmailStr, Field
from email.mime.text import MIMEText
import base64

from app.services.google_creds import service_for_user

router = APIRouter(prefix="/users/{user_id}", tags=["gmail"])


class EmailSummary(BaseModel):
    id: str
    thread_id: str = Field(...)
    from_: str | None = Field(None, serialization_alias="from")
    subject: str | None = None
    date: str | None = None
    snippet: str | None = None
    labels: list[str] = Field(default_factory=list)

    model_config = {"populate_by_name": True}


class EmailListResponse(BaseModel):
    emails: list[EmailSummary]
    count: int


def _header(headers: list[dict], name: str) -> str | None:
    return next((h["value"] for h in headers if h["name"].lower() == name.lower()), None)


@router.get("/emails", response_model=EmailListResponse)
def list_emails(
    user_id: str,
    max_results: int = Query(10, le=50),
    q: str | None = Query(
        None, description="Gmail search query, e.g. 'from:prof after:2026/08/01'"),
):
    """List recent inbox emails with headers and snippet, optionally filtered by a Gmail search query, for the agent to rank and summarize."""
    svc = service_for_user(user_id, "gmail", "v1")
    resp = svc.users().messages().list(
        userId="me", maxResults=max_results, q=q).execute()
    out = []
    for m in resp.get("messages", []):
        msg = svc.users().messages().get(
            userId="me", id=m["id"], format="metadata",
            metadataHeaders=["From", "To", "Subject", "Date"],
        ).execute()
        headers = msg["payload"]["headers"]
        out.append(EmailSummary(
            id=msg["id"],
            thread_id=msg["threadId"],
            from_=_header(headers, "From"),
            subject=_header(headers, "Subject"),
            date=_header(headers, "Date"),
            snippet=msg.get("snippet"),
            labels=msg.get("labelIds", []),
        ))
    return EmailListResponse(emails=out, count=len(out))


def _decode(part: dict) -> str | None:
    data = part.get("body", {}).get("data")
    return base64.urlsafe_b64decode(data).decode(errors="replace") if data else None


def _walk(part: dict):
    """Yield every leaf part; Gmail nests multipart/alternative inside multipart/mixed etc."""
    subparts = part.get("parts")
    if subparts:
        for sub in subparts:
            yield from _walk(sub)
    else:
        yield part


def _body(payload: dict) -> str | None:
    """Prefer text/plain, fall back to text/html as-is. Attachments (no data) are skipped."""
    html = None
    for part in _walk(payload):
        mime = part.get("mimeType", "")
        text = _decode(part)
        if text is None:
            continue
        if mime == "text/plain":
            return text
        if mime == "text/html" and html is None:
            html = text
    return html


class EmailDetail(BaseModel):
    id: str
    thread_id: str = Field(...)
    from_: str | None = Field(None, serialization_alias="from")
    to: str | None = None
    subject: str | None = None
    date: str | None = None
    labels: list[str] = Field(default_factory=list)
    snippet: str | None = None
    body: str | None = Field(
        None, description="Decoded plain-text body (falls back to HTML).")

    model_config = {"populate_by_name": True}


@router.get("/emails/{email_id}", response_model=EmailDetail)
def get_email(user_id: str, email_id: str):
    """Fetch a single email by ID with headers and decoded plain-text body (falls back to HTML if no plain part)."""
    svc = service_for_user(user_id, "gmail", "v1")
    try:
        msg = svc.users().messages().get(userId="me", id=email_id, format="full").execute()
    except HttpError as e:
        if e.resp.status == 404:
            raise HTTPException(404, f"Email {email_id} not found")
        raise
    headers = msg["payload"].get("headers", [])
    return EmailDetail(
        id=msg["id"],
        thread_id=msg["threadId"],
        from_=_header(headers, "From"),
        to=_header(headers, "To"),
        subject=_header(headers, "Subject"),
        date=_header(headers, "Date"),
        labels=msg.get("labelIds", []),
        snippet=msg.get("snippet"),
        body=_body(msg["payload"]),
    )


class DraftIn(BaseModel):
    to: EmailStr
    subject: str
    body: str


class DraftCreatedResponse(BaseModel):
    draft_id: str
    status: str = "draft_created"


@router.post("/emails/drafts", status_code=201, response_model=DraftCreatedResponse)
def create_draft(user_id: str, draft: DraftIn):
    """Create a Gmail draft (to, subject, body) that the student reviews and sends — this service intentionally has no send endpoint."""
    svc = service_for_user(user_id, "gmail", "v1")
    mime = MIMEText(draft.body)
    mime["to"], mime["subject"] = draft.to, draft.subject
    raw = base64.urlsafe_b64encode(mime.as_bytes()).decode()
    created = svc.users().drafts().create(
        userId="me", body={"message": {"raw": raw}}).execute()
    return DraftCreatedResponse(draft_id=created["id"])


class DraftSendIn(BaseModel):
    to: EmailStr = Field(..., description="Must match the draft's To header.")
    subject: str = Field(...,
                         description="Must match the draft's Subject header.")
    body: str = Field(...,
                      description="Must match the draft's body text exactly.")
    user_confirmation: str = Field(
        ..., description="The user's confirmation message (e.g. 'yes, send it'). Must be non-empty.")


class DraftSentResponse(BaseModel):
    message_id: str
    thread_id: str
    sent_at: str = Field(...,
                         description="RFC3339 timestamp of when Gmail processed the send.")
    status: str = "sent"


class FieldMismatch(BaseModel):
    field: str = Field(...,
                       description="The field that failed to match (e.g. 'to', 'subject', 'body').")
    expected: str = Field(..., description="The value found in the draft.")
    got: str = Field(..., description="The value provided in the request.")


class DraftMismatchResponse(BaseModel):
    detail: str = Field(default="Draft content mismatch.",
                        description="Summary of the mismatch.")
    mismatches: list[FieldMismatch] = Field(
        default_factory=list, description="Per-field mismatch details.")


@router.post("/emails/drafts/{draft_id}/send", status_code=200, response_model=DraftSentResponse,
             responses={409: {"model": DraftMismatchResponse, "description": "Draft content mismatch."}})
def send_draft(user_id: str, draft_id: str, payload: DraftSendIn):
    """Send an existing Gmail draft — the request body must exactly match the draft's to/subject/body, and include the user's confirmation."""
    if not payload.user_confirmation.strip():
        raise HTTPException(400, "Confirmation message is required to send.")

    svc = service_for_user(user_id, "gmail", "v1")

    # 1. Fetch the existing draft with full payload (headers + parts).
    try:
        draft = svc.users().drafts().get(userId="me", id=draft_id, format="full").execute()
    except HttpError as e:
        if e.resp.status == 404:
            raise HTTPException(404, f"Draft {draft_id} not found")
        raise

    # 2. Extract To, Subject, and body from the deserialized message payload.
    msg = draft.get("message", {})
    payload_dict = msg.get("payload", {})
    headers = payload_dict.get("headers", [])
    draft_to = _header(headers, "To") or ""
    draft_subject = _header(headers, "Subject") or ""
    draft_body = _body(payload_dict) or ""

    # 3. Validate that the request matches the draft exactly.
    mismatches = []
    if payload.to != draft_to:
        mismatches.append(FieldMismatch(
            field="to", expected=draft_to, got=str(payload.to)))
    if payload.subject != draft_subject:
        mismatches.append(FieldMismatch(
            field="subject", expected=draft_subject, got=payload.subject))
    if payload.body != draft_body:
        mismatches.append(FieldMismatch(
            field="body", expected=draft_body, got=payload.body))
    if mismatches:
        raise HTTPException(
            409,
            detail=DraftMismatchResponse(mismatches=mismatches).model_dump(),
        )

    # 4. Send the draft.
    sent = svc.users().drafts().send(
        userId="me", body={"id": draft_id}).execute()
    sent_at = datetime.now(timezone.utc).isoformat()

    return DraftSentResponse(
        message_id=sent["id"],
        thread_id=sent["threadId"],
        sent_at=sent_at,
    )
