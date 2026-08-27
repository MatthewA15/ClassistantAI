"""Google Drive connector (P2: list/search files, download content)."""
import io
import re

from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import Response
from googleapiclient.errors import HttpError
from googleapiclient.http import MediaIoBaseDownload

from app.services.google_creds import service_for_user

router = APIRouter(prefix="/users/{user_id}/drive", tags=["drive"])


@router.get("/files")
def list_files(
    user_id: str,
    q: str | None = Query(None, description="Drive query, e.g. \"name contains 'syllabus'\""),
    max_results: int = Query(20, le=100),
):
    """P2. Metadata only — enough for the agent to locate a syllabus or study plan."""
    svc = service_for_user(user_id, "drive", "v3")
    resp = svc.files().list(
        q=q, pageSize=max_results, orderBy="modifiedTime desc",
        fields="files(id,name,mimeType,modifiedTime,webViewLink)",
    ).execute()
    return {"files": resp.get("files", []), "count": len(resp.get("files", []))}


# Google-native files have no bytes of their own; export to an agent-friendly format.
_EXPORTS = {
    "application/vnd.google-apps.document": ("text/plain", ".txt"),
    "application/vnd.google-apps.spreadsheet": ("text/csv", ".csv"),
    "application/vnd.google-apps.presentation": ("application/pdf", ".pdf"),
}


def _safe_filename(name: str) -> str:
    return re.sub(r'["\r\n]', "", name).strip() or "download"


@router.get("/files/{file_id}/download")
def download_file(user_id: str, file_id: str):
    """P2. Raw file bytes. Docs/Sheets/Slides are auto-exported (txt/csv/pdf)."""
    svc = service_for_user(user_id, "drive", "v3")
    try:
        meta = svc.files().get(fileId=file_id, fields="name,mimeType,size").execute()
        name, mime = meta["name"], meta["mimeType"]
        if mime.startswith("application/vnd.google-apps."):
            if mime not in _EXPORTS:
                raise HTTPException(415, f"Unsupported Google-native type: {mime}")
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
            raise HTTPException(403, "No access to this file — user may need to re-consent with updated scopes")
        raise
    return Response(
        content=buf.getvalue(),
        media_type=mime,
        headers={"Content-Disposition": f'attachment; filename="{_safe_filename(name)}"'},
    )
