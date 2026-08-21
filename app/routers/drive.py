"""Google Drive connector (P2: list/search files)."""
from fastapi import APIRouter, Query

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
