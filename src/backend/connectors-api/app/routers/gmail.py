"""
Gmail connector (P1: read; P2: create/edit/send drafts, triage the inbox).
"""

from datetime import datetime, timezone
from typing import Literal
from fastapi import APIRouter, HTTPException, Query
from googleapiclient.errors import HttpError
from pydantic import BaseModel, EmailStr, Field
from email.mime.text import MIMEText
import base64

from app.routers._guardrails import FieldMismatch, MismatchResponse, reject_bulk_id
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


class DraftPatchIn(BaseModel):
    """A partial edit of a draft: every editable field is optional.

    Partial from the caller's side only -- Gmail itself has no partial draft
    update, so the endpoint merges these over the draft it fetches.
    """
    to: EmailStr | None = None
    subject: str | None = None
    body: str | None = None
    user_confirmation: str = Field(
        ..., description="The user's confirmation message (e.g. 'yes, change the subject'). Must be non-empty.")


class DraftUpdatedResponse(BaseModel):
    draft_id: str
    status: str = "draft_updated"
    changed_fields: list[str] = Field(
        default_factory=list, description="The field names the caller provided; everything else was preserved.")


@router.patch("/emails/drafts/{draft_id}", response_model=DraftUpdatedResponse)
def patch_draft(user_id: str, draft_id: str, payload: DraftPatchIn):
    """Edit an existing draft in place -- fields you omit keep their current values, and nothing is sent.

    Send only what changes: omitting `subject` keeps the draft's subject
    rather than clearing it. At least one of `to`, `subject`, `body` is
    required, so an edit that changes nothing is an error rather than a
    silent success.

    This edits the draft only. It does not send anything -- the student still
    reads the draft, and sending is a separate confirmed call.

    No `expected_*` echo-back here, unlike editing or deleting a calendar
    event: a draft edit destroys nothing and is fully reversible, so a
    non-empty `user_confirmation` plus these merge semantics is enough.
    """
    if not payload.user_confirmation.strip():
        raise HTTPException(
            400, "Confirmation message is required to edit a draft.")

    provided = [f for f in ("to", "subject", "body")
                if f in payload.model_fields_set]
    if not provided:
        raise HTTPException(
            400, "No editable fields provided; send at least one of to, subject, body.")

    svc = service_for_user(user_id, "gmail", "v1")

    # 1. Fetch the existing draft -- Gmail's drafts.update REPLACES the whole
    #    message, so anything not rebuilt below would be silently blanked.
    try:
        draft = svc.users().drafts().get(userId="me", id=draft_id, format="full").execute()
    except HttpError as e:
        if e.resp.status == 404:
            raise HTTPException(404, f"Draft {draft_id} not found")
        raise

    # 2. Read what the draft currently holds, the same way send_draft does.
    msg = draft.get("message", {})
    payload_dict = msg.get("payload", {})
    headers = payload_dict.get("headers", [])

    # 3. Merge: what the caller sent wins, everything else is carried over.
    to = str(payload.to) if "to" in provided else (
        _header(headers, "To") or "")
    subject = payload.subject if "subject" in provided else (
        _header(headers, "Subject") or "")
    body = payload.body if "body" in provided else (_body(payload_dict) or "")

    # 4. Rebuild the full message and replace the draft with it.
    mime = MIMEText(body)
    mime["to"], mime["subject"] = to, subject
    raw = base64.urlsafe_b64encode(mime.as_bytes()).decode()
    updated = svc.users().drafts().update(
        userId="me", id=draft_id, body={"message": {"raw": raw}}).execute()

    return DraftUpdatedResponse(
        draft_id=updated.get("id", draft_id), changed_fields=provided)


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


class DraftMismatchResponse(MismatchResponse):
    """409 body for send_draft -- same fields as before, connector-specific `detail`."""
    detail: str = Field(default="Draft content mismatch.",
                        description="Summary of the mismatch.")


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


# Gmail's own labels. `label` on the triage endpoint is a NAME, and none of
# these names may be reached through it: the explicit verbs are the only way to
# touch inbox and read state, which leaves TRASH and SPAM with no path at all.
_SYSTEM_LABELS = {
    "INBOX", "UNREAD", "SPAM", "TRASH", "SENT", "DRAFT", "STARRED", "IMPORTANT",
    "CATEGORY_PERSONAL", "CATEGORY_SOCIAL", "CATEGORY_PROMOTIONS",
    "CATEGORY_UPDATES", "CATEGORY_FORUMS",
}

TriageAction = Literal["mark_read", "mark_unread",
                       "archive", "add_label", "remove_label"]

_LABEL_ACTIONS = ("add_label", "remove_label")

# The three explicit verbs, as the modify body each one sends.
_VERB_BODIES: dict[str, dict] = {
    "mark_read": {"removeLabelIds": ["UNREAD"]},
    "mark_unread": {"addLabelIds": ["UNREAD"]},
    "archive": {"removeLabelIds": ["INBOX"]},
}


class TriageIn(BaseModel):
    action: TriageAction = Field(
        ..., description="What to do: mark_read, mark_unread, archive, add_label or remove_label.")
    label: str | None = Field(
        None,
        description=("Label NAME (e.g. 'Deadlines'). Required for add_label and "
                     "remove_label, and rejected for the other actions."))


class TriageResponse(BaseModel):
    email_id: str
    action: str
    label: str | None = Field(
        None, description="The label name acted on; null for the non-label actions.")
    labels_before: list[str] = Field(
        default_factory=list, description="The email's label ids before the change.")
    labels_after: list[str] = Field(
        default_factory=list, description="The email's label ids after the change.")
    status: str = "triaged"


def _resolve_label(svc, name: str, *, create_missing: bool) -> str:
    """Label name -> label id, creating a user label only when asked to.

    Matching is case-insensitive because the student says "deadlines" and the
    label reads "Deadlines"; a second label differing only in case would be a
    duplicate the student never asked for.
    """
    existing = svc.users().labels().list(userId="me").execute().get("labels", [])
    for lab in existing:
        if (lab.get("name") or "").lower() != name.lower():
            continue
        if lab.get("type") == "system" or (lab.get("name") or "").upper() in _SYSTEM_LABELS:
            raise HTTPException(
                400, f"{lab.get('name')} is a Gmail system label; use the explicit actions instead.")
        return lab["id"]

    if not create_missing:
        # Nothing to remove, and creating a label in order to remove it would
        # be a strange way to do nothing.
        raise HTTPException(404, f"Label '{name}' not found")

    created = svc.users().labels().create(
        userId="me", body={"name": name}).execute()
    return created["id"]


@router.post("/emails/{email_id}/triage", response_model=TriageResponse)
def triage_email(user_id: str, email_id: str, payload: TriageIn):
    """Change one email's state: mark it read or unread, archive it, or add/remove a label.

    `label` is a label NAME, not an id. It is required for add_label and
    remove_label and rejected for the other three actions, so a request can
    never quietly mean something other than it says. add_label creates the
    label when the student doesn't have it yet; remove_label on a label that
    doesn't exist is a 404, because there is nothing to remove.

    `archive` takes the email out of the inbox. It does NOT delete it: the mail
    stays in All Mail and search still finds it. There is deliberately no
    delete and no trash action here, and Gmail's own labels (INBOX, UNREAD,
    SPAM, TRASH, SENT, STARRED, IMPORTANT, CATEGORY_*) cannot be reached
    through `label` -- the three verbs above are the only way to touch inbox
    and read state, which leaves the student's mail impossible to destroy from
    this endpoint.

    No confirmation is required, unlike sending a draft or deleting an event:
    every action here is reversible in one click in Gmail, and
    `labels_before`/`labels_after` report exactly what changed.

    One email per call.
    """
    needs_label = payload.action in _LABEL_ACTIONS
    label = (payload.label or "").strip()
    if needs_label and not label:
        raise HTTPException(400, f"`label` is required for {payload.action}.")
    if not needs_label and payload.label is not None:
        raise HTTPException(
            400, f"`label` is not accepted for {payload.action}; that action names its own target.")
    if needs_label and label.upper() in _SYSTEM_LABELS:
        raise HTTPException(
            400, f"{label} is a Gmail system label; use the explicit actions instead.")
    reject_bulk_id(
        email_id, "One email_id per request; bulk triage is not supported.")

    svc = service_for_user(user_id, "gmail", "v1")

    # Read first: labels_before is the record of what the email looked like,
    # and it cannot be recovered after the modify.
    try:
        msg = svc.users().messages().get(
            userId="me", id=email_id, format="metadata").execute()
    except HttpError as e:
        if e.resp.status == 404:
            raise HTTPException(404, f"Email {email_id} not found")
        raise
    labels_before = msg.get("labelIds", [])

    if needs_label:
        label_id = _resolve_label(
            svc, label, create_missing=payload.action == "add_label")
        key = "addLabelIds" if payload.action == "add_label" else "removeLabelIds"
        body = {key: [label_id]}
    else:
        body = _VERB_BODIES[payload.action]

    modified = svc.users().messages().modify(
        userId="me", id=email_id, body=body).execute()

    return TriageResponse(
        email_id=modified.get("id", email_id),
        action=payload.action,
        label=label or None,
        labels_before=labels_before,
        labels_after=modified.get("labelIds", []),
    )
