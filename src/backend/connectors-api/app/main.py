"""Classistant AI connector service — FastAPI layer between the ADK agents and Google APIs.

Deployed separately on Cloud Run (ADR-0003); the ADK agent calls these
endpoints as tools. See API_CONTRACT.md for the frozen contract.
"""
from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse

from app.routers.gmail import router as gmail_router
from app.routers.calendar import router as calendar_router
from app.routers.drive import router as drive_router
from app.routers.docs_service import router as docs_router
from app.routers.calls import router as calls_router
from app.services.calle_mcp import (
    CalleAuthError,
    CalleNotConfigured,
    CalleUpstreamError,
)
from app.services.firestore_creds import CredentialFormatError, CredentialNotFound

app = FastAPI(title="Classistant AI Connectors", version="0.8.0")

app.include_router(gmail_router)
app.include_router(calendar_router)
app.include_router(drive_router)
app.include_router(docs_router)
app.include_router(calls_router)


# Credential lookup errors (app/services/firestore_creds.py) surface here as
# plain HTTP errors so routers don't need to know about Firestore/KMS.
@app.exception_handler(CredentialNotFound)
async def _credential_not_found(request: Request, exc: CredentialNotFound):
    return JSONResponse(status_code=404, content={"detail": str(exc)})


@app.exception_handler(CredentialFormatError)
async def _credential_format_error(request: Request, exc: CredentialFormatError):
    return JSONResponse(status_code=500, content={"detail": str(exc)})


# CALL-E failures (app/services/calle_mcp.py) surface the same way, so a
# router never has to know how the call was placed. Neither of the first two
# is the caller's fault: a missing or expired service token is an operator
# rotation, so they answer 503 (try later, nothing you sent was wrong) rather
# than 401/403, which would blame the request.
@app.exception_handler(CalleNotConfigured)
async def _calle_not_configured(request: Request, exc: CalleNotConfigured):
    return JSONResponse(status_code=503, content={"detail": str(exc)})


@app.exception_handler(CalleAuthError)
async def _calle_auth_error(request: Request, exc: CalleAuthError):
    return JSONResponse(status_code=503, content={"detail": str(exc)})


@app.exception_handler(CalleUpstreamError)
async def _calle_upstream_error(request: Request, exc: CalleUpstreamError):
    return JSONResponse(status_code=502, content={"detail": str(exc)})


@app.get("/health", tags=["meta"])
def health():
    return {"status": "ok"}
