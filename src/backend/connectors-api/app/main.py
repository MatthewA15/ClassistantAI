"""Classistant AI connector service — FastAPI layer between the ADK agents and Google APIs.

Deployed separately on Cloud Run (ADR-0003); the ADK agent calls these
endpoints as tools. See API_CONTRACT.md for the frozen contract.
"""
from fastapi import FastAPI

from app.auth.router import router as auth_router
from app.routers.gmail import router as gmail_router
from app.routers.calendar import router as calendar_router
from app.routers.drive import router as drive_router
from app.routers.docs_service import router as docs_router

app = FastAPI(title="Classistant AI Connectors", version="0.3.0")

app.include_router(auth_router)
app.include_router(gmail_router)
app.include_router(calendar_router)
app.include_router(drive_router)
app.include_router(docs_router)


@app.get("/health", tags=["meta"])
def health():
    return {"status": "ok"}
