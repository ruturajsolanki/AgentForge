"""Artifact download/preview routes."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import Response

from app.auth import AuthContext, require_auth
from app.storage import get_store

router = APIRouter(prefix="/artifacts", tags=["artifacts"])


@router.get("/{key:path}")
async def get_artifact(
    key: str,
    ctx: AuthContext = Depends(require_auth),
) -> Response:
    """Return raw artifact bytes (dev mode) or redirect to a signed URL (prod)."""
    if not key.startswith(f"tenants/{ctx.tenant_id}/"):
        raise HTTPException(403, "Cross-tenant access denied")
    store = get_store()
    try:
        data = await store.get_object(key)
    except FileNotFoundError as exc:
        raise HTTPException(404, "Artifact not found") from exc

    ctype = "application/octet-stream"
    lower = key.lower()
    if lower.endswith(".html"):
        ctype = "text/html"
    elif lower.endswith((".js", ".jsx", ".ts", ".tsx")):
        ctype = "application/javascript"
    elif lower.endswith(".css"):
        ctype = "text/css"
    elif lower.endswith(".json"):
        ctype = "application/json"
    elif lower.endswith(".md") or lower.endswith(".txt"):
        ctype = "text/plain"
    elif lower.endswith(".svg"):
        ctype = "image/svg+xml"

    return Response(content=data, media_type=ctype)
