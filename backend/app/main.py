"""ForgeOS gateway — FastAPI entry point."""

from __future__ import annotations

import logging
import os

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, PlainTextResponse
from starlette.middleware.base import BaseHTTPMiddleware

from app.api import artifacts as artifacts_router
from app.api import demand as demand_router
from app.api import projects as projects_router
from app.api import settings as settings_router
from app.api import ws as ws_router

logging.basicConfig(
    level=os.getenv("FORGEOS_LOG_LEVEL", "INFO"),
    format="%(asctime)s %(levelname)s [%(name)s] %(message)s",
)
logger = logging.getLogger("forgeos")

_BASE = os.path.dirname(os.path.abspath(__file__))
STATIC_DIR = os.path.normpath(os.path.join(_BASE, "..", "static"))


class NoCacheStaticMiddleware(BaseHTTPMiddleware):
    """Force browsers to re-fetch the SPA shell after every deploy."""

    async def dispatch(self, request: Request, call_next):
        response = await call_next(request)
        path = request.url.path
        if path.startswith("/assets/") or path == "/" or path.endswith(".html"):
            response.headers["Cache-Control"] = "no-cache, no-store, must-revalidate"
            response.headers["Pragma"] = "no-cache"
            response.headers["Expires"] = "0"
        return response


def create_app() -> FastAPI:
    app = FastAPI(title="ForgeOS", version="0.1.0", description="Demand-to-Delivery AI OS")

    app.add_middleware(NoCacheStaticMiddleware)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    app.include_router(settings_router.router)
    app.include_router(demand_router.router)
    app.include_router(projects_router.router)
    app.include_router(artifacts_router.router)
    app.include_router(ws_router.router)

    if os.path.isdir(STATIC_DIR):
        @app.get("/{full_path:path}", include_in_schema=False)
        async def serve_spa(full_path: str):
            if full_path.startswith("api/"):
                return PlainTextResponse("Not found", status_code=404)
            candidate = os.path.join(STATIC_DIR, full_path)
            if full_path and os.path.isfile(candidate):
                return FileResponse(candidate)
            return FileResponse(os.path.join(STATIC_DIR, "index.html"))

    return app


app = create_app()
