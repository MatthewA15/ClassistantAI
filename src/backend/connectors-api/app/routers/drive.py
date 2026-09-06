"""Google Drive connector (P2: list/search files, download content, upload into the app folder)."""
import base64
import binascii
import io
import re

from fastapi import APIRouter, HTTPException, Query
from googleapiclient.errors import HttpError
from googleapiclient.http import MediaIoBaseDownload, MediaIoBaseUpload
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
    """Download a file's content as base64 in `data`, auto-exporting Google-native Docs/Sheets/Slides to plain text, CSV, or PDF.

    The response is JSON, not binary: `data` is base64 and `mime_type` /
    `filename` describe the exported form for Google-native files.
    """
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


APP_FOLDER_NAME = "Classistant"
_FOLDER_MIME = "application/vnd.google-apps.folder"

# Uploads are agent-generated study material, not media libraries. The cap is
# here so a runaway base64 payload fails fast and cheaply, before Drive.
_MAX_UPLOAD_BYTES = 10 * 1024 * 1024

# Above this, hand the upload to Drive's resumable protocol rather than one
# request that has to succeed whole.
_RESUMABLE_ABOVE_BYTES = 1024 * 1024


class FileUploadIn(BaseModel):
    filename: str = Field(..., description="Name for the file in Drive.")
    mime_type: str = Field(...,
                           description="MIME type of the content, e.g. 'text/plain' or 'application/pdf'.")
    data: str = Field(..., description="File content encoded as base64.")


class FileUploadedResponse(BaseModel):
    file_id: str
    name: str
    web_view_link: str | None = Field(
        None, description="Browser-viewable URL for the uploaded file.")
    folder: str = Field(
        APP_FOLDER_NAME, description="The app-owned folder the file landed in.")
    size: int = Field(..., description="Size of the stored file in bytes.")
    status: str = "uploaded"


def _ensure_app_folder(svc) -> str:
    """The id of this app's own "Classistant" folder, creating it on first use.

    Everything this connector writes goes in here, because it is the only
    place it can reliably find again: under `drive.file` the app sees only
    what it created itself, so a folder made by the student -- even one with
    this exact name -- is invisible to the query below and would come back
    empty forever.
    """
    found = svc.files().list(
        q=(f"name = '{APP_FOLDER_NAME}' and mimeType = '{_FOLDER_MIME}' "
           "and trashed = false and 'root' in parents"),
        spaces="drive",
        fields="files(id,name)",
        pageSize=1,
    ).execute()
    existing = found.get("files", [])
    if existing:
        return existing[0]["id"]

    created = svc.files().create(
        body={"name": APP_FOLDER_NAME, "mimeType": _FOLDER_MIME},
        fields="id",
    ).execute()
    return created["id"]


@router.post("/files", status_code=201, response_model=FileUploadedResponse)
def upload_file(user_id: str, upload: FileUploadIn):
    """Upload a file into the student's Drive, in this app's own "Classistant" folder.

    Send the content as base64 in `data`, with the `mime_type` it should be
    stored as -- the mirror of what the download endpoint returns, so a file
    read from Drive can be written back without re-encoding.

    Everything lands in one folder named "Classistant", created on first use.
    That is not tidiness: this app can only see files and folders it created
    itself, so anywhere else is somewhere it could never find the file again.
    It cannot read, change or remove anything else in the student's Drive, and
    there is no delete endpoint here at all.

    Files are capped at 10 MB. A `403` means the student's Google account
    hasn't granted this app write access yet and has to reconnect.
    """
    try:
        content = base64.b64decode(upload.data, validate=True)
    except (ValueError, binascii.Error):
        raise HTTPException(400, "`data` is not valid base64.")
    if not content:
        raise HTTPException(400, "`data` is empty; there is nothing to upload.")
    if len(content) > _MAX_UPLOAD_BYTES:
        raise HTTPException(
            413,
            f"File is {len(content)} bytes; the limit is {_MAX_UPLOAD_BYTES} bytes.",
        )

    svc = service_for_user(user_id, "drive", "v3")
    try:
        folder_id = _ensure_app_folder(svc)
        media = MediaIoBaseUpload(
            io.BytesIO(content),
            mimetype=upload.mime_type,
            resumable=len(content) > _RESUMABLE_ABOVE_BYTES,
        )
        created = svc.files().create(
            body={"name": _safe_filename(upload.filename),
                  "parents": [folder_id]},
            media_body=media,
            fields="id,name,mimeType,modifiedTime,webViewLink,size",
        ).execute()
    except HttpError as e:
        if e.resp.status == 403:
            raise HTTPException(
                403, "No access to this file — user may need to re-consent with updated scopes")
        raise

    return FileUploadedResponse(
        file_id=created["id"],
        name=created.get("name") or _safe_filename(upload.filename),
        web_view_link=created.get("webViewLink"),
        size=int(created.get("size") or len(content)),
    )
