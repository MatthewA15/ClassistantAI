import os
from contextlib import asynccontextmanager

import uvicorn
from fastapi import FastAPI
from google.adk.cli.fast_api import get_fast_api_app

# Get the directory where main.py is located
AGENT_DIR = os.path.dirname(os.path.abspath(__file__))
# TODO: Update to Vertex AI
SESSION_SERVICE_URI = "sqlite+aiosqlite:///./sessions.db"


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Server lifecycle: close every per-user obscura subprocess on shutdown.

    McpToolset.close() tears down async transports bound to the running
    event loop, so it must run *before* the loop exits — atexit is too late
    (the loop is closed by then and the child processes get orphaned).
    Uvicorn runs this shutdown phase on the live loop when it receives
    SIGTERM/SIGINT, which is exactly the window we need.

    The import is deferred so `main.py` stays importable (e.g. for tooling)
    without pulling in the whole agent package.
    """
    yield

    from app.browser_tools import aclose_all_toolsets

    await aclose_all_toolsets()


app: FastAPI = get_fast_api_app(
    agents_dir=AGENT_DIR,
    session_service_uri=SESSION_SERVICE_URI,
    web=False,
    lifespan=lifespan,
)

if __name__ == "__main__":
    # Use the PORT environment variable provided by Cloud Run, defaulting to 8080
    uvicorn.run(app, host="0.0.0.0", port=int(os.environ.get("PORT", 8080)))
