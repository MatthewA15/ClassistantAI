"""Google Drive connector (P2: list/search files, download content)."""
import base64
import io
import re

from fastapi import APIRouter, HTTPException, Query
from googleapiclient.errors import HttpError
from googleapiclient.http import MediaIoBaseDownload
from pydantic import BaseModel, Field

from app.services.google_creds import service_for_user

router = APIRouter(prefix="/users/{user_id}/drive", tags=["drive"])


class DriveFile(BaseModel):
    id: str
    name: str | None = None
    mime_type: str | None = Field(None, alias="mimeType")
    modified_time: str | None = Field(None, alias="modifiedTime")
    web_view_link: str | None = Field(
        None, alias="webViewLink", description="Browser-viewable URL.")

    model_config = {"populate_by_name": True}


class FileListResponse(BaseModel):
    files: list[DriveFile]
    count: int


@router.get("/files", response_model=FileListResponse)
def list_files(
    user_id: str,
    q: str | None = Query(
        None, description="Drive query, e.g. \"name contains 'syllabus'\""),
    max_results: int = Query(20, le=100),
):
    """List files in the user's Drive, optionally filtered by a Google Drive query, returning metadata for locating syllabi or study plans."""
    svc = service_for_user(user_id, "drive", "v3")
    resp = svc.files().list(
        q=q, pageSize=max_results, orderBy="modifiedTime desc",
        fields="files(id,name,mimeType,modifiedTime,webViewLink)",
    ).execute()
    files = [DriveFile.model_validate(f) for f in resp.get("files", [])]
    return FileListResponse(files=files, count=len(files))


# Google-native files have no bytes of their own; export to an agent-friendly format.
_EXPORTS = {
    "application/vnd.google-apps.document": ("text/plain", ".txt"),
    "application/vnd.google-apps.spreadsheet": ("text/csv", ".csv"),
    "application/vnd.google-apps.presentation": ("application/pdf", ".pdf"),
}


def _safe_filename(name: str) -> str:
    return re.sub(r'["\r\n]', "", name).strip() or "download"


class DownloadResponse(BaseModel):
    mime_type: str = Field(
        ..., description="MIME type of the file (or export format for Google-native files).")
    content_size: int = Field(...,
                              description="Size of the file content in bytes.")
    filename: str = Field(...,
                          description="Suggested filename for the download.")
    data: str = Field(..., description="File content encoded as base64.")


@router.get("/files/{file_id}/download", response_model=DownloadResponse)
def download_file(user_id: str, file_id: str):
    """Download a file's raw bytes, auto-exporting Google-native Docs/Sheets/Slides to plain text, CSV, or PDF."""
    svc = service_for_user(user_id, "drive", "v3")
    try:
        meta = svc.files().get(fileId=file_id, fields="name,mimeType,size").execute()
        name, mime = meta["name"], meta["mimeType"]
        if mime.startswith("application/vnd.google-apps."):
            if mime not in _EXPORTS:
                raise HTTPException(
                    415, f"Unsupported Google-native type: {mime}")
            mime, ext = _EXPORTS[mime]
            name = re.sub(r"\.[^.]*$", "", name) + ext
            req = svc.files().export_media(fileId=file_id, mimeType=mime)
        else:
            req = svc.files().get_media(fileId=file_id)
        buf = io.BytesIO()
        downloader = MediaIoBaseDownload(buf, req)
        done = False
        while not done:
            _, done = downloader.next_chunk()
    except HttpError as e:
        if e.resp.status == 404:
            raise HTTPException(404, f"File {file_id} not found")
        if e.resp.status == 403:
            raise HTTPException(
                403, "No access to this file — user may need to re-consent with updated scopes")
        raise
    content = buf.getvalue()
    return DownloadResponse(
        mime_type=mime,
        content_size=len(content),
        filename=_safe_filename(name),
        data=base64.b64encode(content).decode(),
    )
