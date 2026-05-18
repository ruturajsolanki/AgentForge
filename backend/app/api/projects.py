"""Project file routes — surfaces a demand's artifact tree to the IDE.

The IDE expects a folder-aware view at ``/api/projects/{public_id}/files``.
Internally every file lives in S3/MinIO under the prefix
``tenants/{tenant_id}/projects/{public_id}/<relative path>``. We strip that
prefix on the way out and re-add it on the way in so the IDE can pretend
the project is a normal filesystem.
"""

from __future__ import annotations

import os
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import AuthContext, require_auth
from app.db import get_session
from app.db.models import Artifact, DemandRequest
from app.preview import preview_manager
from app.storage import get_store

router = APIRouter(prefix="/api/projects", tags=["projects"])


async def _resolve_prefix(
    public_id: str,
    ctx: AuthContext,
    session: AsyncSession,
) -> str:
    """Returns the canonical S3 prefix for this demand or 404s."""
    stmt = select(DemandRequest).where(
        DemandRequest.public_id == public_id,
        DemandRequest.tenant_id == ctx.tenant_id,
    )
    demand = (await session.execute(stmt)).scalar_one_or_none()
    if not demand:
        raise HTTPException(status_code=404, detail="Project not found")
    prefix = demand.artifacts_prefix
    if not prefix:
        prefix = f"tenants/{ctx.tenant_id}/projects/{public_id}"
    return prefix.rstrip("/") + "/"


def _safe_join(prefix: str, path: str) -> str:
    """Join prefix+path while preventing traversal."""
    rel = path.lstrip("/").replace("\\", "/")
    if ".." in rel.split("/"):
        raise HTTPException(status_code=400, detail="Invalid path")
    return prefix + rel


def _guess_mime(path: str) -> str:
    p = path.lower()
    if p.endswith(".html"): return "text/html"
    if p.endswith((".js", ".jsx", ".ts", ".tsx")): return "application/javascript"
    if p.endswith(".css"): return "text/css"
    if p.endswith(".json"): return "application/json"
    if p.endswith((".md", ".txt", ".env")): return "text/plain"
    if p.endswith(".svg"): return "image/svg+xml"
    return "application/octet-stream"


# ── List ───────────────────────────────────────────────────────────────


def _build_tree(rels: list[tuple[str, int]]) -> list[dict]:
    """Build a nested ``FileNode[]`` tree from flat (rel_path, size) tuples.
    Shape matches ``frontend/src/components/ide/FileTree.tsx::FileNode``."""
    root: dict[str, dict] = {}  # path -> node
    for rel, size in rels:
        parts = rel.split("/")
        # Walk through ancestors, creating directory nodes as we go.
        for i in range(1, len(parts)):
            dir_path = "/".join(parts[:i])
            if dir_path not in root:
                root[dir_path] = {
                    "name": parts[i - 1],
                    "path": dir_path,
                    "type": "directory",
                    "children": [],
                }
        root[rel] = {
            "name": parts[-1],
            "path": rel,
            "type": "file",
            "size": size,
        }

    # Attach each non-top node to its parent's children list.
    top: list[dict] = []
    for path, node in root.items():
        if "/" in path:
            parent = root["/".join(path.split("/")[:-1])]
            parent["children"].append(node)
        else:
            top.append(node)

    # Sort each level: directories first, then files, alphabetically.
    def sort_level(nodes: list[dict]) -> None:
        nodes.sort(key=lambda n: (n["type"] != "directory", n["name"].lower()))
        for n in nodes:
            if n["type"] == "directory":
                sort_level(n["children"])

    sort_level(top)
    return top


@router.get("/{public_id}/files")
async def list_files(
    public_id: str,
    ctx: AuthContext = Depends(require_auth),
    session: AsyncSession = Depends(get_session),
):
    """Return a nested ``FileNode[]`` tree for the project's artifacts.
    The IDE consumes the bare array directly."""
    prefix = await _resolve_prefix(public_id, ctx, session)
    store = get_store()
    keys = await store.list_objects(prefix.rstrip("/"))

    # Hide internal sentinels like .gitkeep that we use to materialise dirs.
    rels: list[tuple[str, int]] = []
    for k in keys:
        if not k.startswith(prefix):
            continue
        rel = k[len(prefix):]
        if not rel or rel.endswith("/.gitkeep"):
            continue
        rels.append((rel, 0))  # size unknown without an extra head; ok for the tree.
    rels.sort(key=lambda x: x[0])
    return _build_tree(rels)


# ── Read ───────────────────────────────────────────────────────────────


@router.get("/{public_id}/files/{path:path}")
async def read_file(
    public_id: str,
    path: str,
    ctx: AuthContext = Depends(require_auth),
    session: AsyncSession = Depends(get_session),
) -> dict:
    prefix = await _resolve_prefix(public_id, ctx, session)
    key = _safe_join(prefix, path)
    store = get_store()
    try:
        data = await store.get_object(key)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail="File not found") from exc
    try:
        content = data.decode("utf-8")
        is_binary = False
    except UnicodeDecodeError:
        import base64
        content = base64.b64encode(data).decode("ascii")
        is_binary = True
    return {
        "path": path,
        "content": content,
        "binary": is_binary,
        "size": len(data),
        "mime": _guess_mime(path),
    }


# ── Write ──────────────────────────────────────────────────────────────


class WriteBody(BaseModel):
    content: str
    binary: bool = False


@router.put("/{public_id}/files/{path:path}")
async def write_file(
    public_id: str,
    path: str,
    body: WriteBody,
    ctx: AuthContext = Depends(require_auth),
    session: AsyncSession = Depends(get_session),
) -> dict:
    prefix = await _resolve_prefix(public_id, ctx, session)
    key = _safe_join(prefix, path)
    if body.binary:
        import base64
        data = base64.b64decode(body.content)
    else:
        data = body.content.encode("utf-8")
    store = get_store()
    await store.put_object(key, data, content_type=_guess_mime(path))
    # If a live preview is running, push the edit through so Vite HMR sees it.
    await preview_manager.sync_file(public_id, path, data)

    # Mirror into the artifacts table so reuse detection sees IDE edits.
    existing = await session.execute(
        select(Artifact).where(Artifact.storage_key == key)
    )
    art = existing.scalar_one_or_none()
    if art is None:
        # Find the project's demand row to attach to.
        demand = (await session.execute(
            select(DemandRequest).where(
                DemandRequest.public_id == public_id,
                DemandRequest.tenant_id == ctx.tenant_id,
            )
        )).scalar_one()
        art = Artifact(
            tenant_id=ctx.tenant_id,
            demand_id=demand.id,
            path=path,
            storage_key=key,
            size_bytes=len(data),
            content_type=_guess_mime(path),
        )
        session.add(art)
    else:
        art.size_bytes = len(data)
        art.content_type = _guess_mime(path)
    await session.commit()
    return {"path": path, "size": len(data), "saved": True}


# ── Create / mkdir ─────────────────────────────────────────────────────


class CreateBody(BaseModel):
    path: str
    type: str = "file"  # "file" | "dir"
    content: str = ""


@router.post("/{public_id}/files")
async def create_entry(
    public_id: str,
    body: CreateBody,
    ctx: AuthContext = Depends(require_auth),
    session: AsyncSession = Depends(get_session),
) -> dict:
    prefix = await _resolve_prefix(public_id, ctx, session)
    rel = body.path.lstrip("/")
    if body.type == "dir":
        # S3 has no real dirs — we drop a zero-byte .gitkeep so the path exists.
        key = _safe_join(prefix, os.path.join(rel, ".gitkeep"))
        await get_store().put_object(key, b"", content_type="text/plain")
        return {"path": rel, "type": "dir", "created": True}
    key = _safe_join(prefix, rel)
    data = body.content.encode("utf-8")
    await get_store().put_object(key, data, content_type=_guess_mime(rel))
    return {"path": rel, "type": "file", "size": len(data), "created": True}


# ── Delete ─────────────────────────────────────────────────────────────


@router.delete("/{public_id}/files/{path:path}")
async def delete_file(
    public_id: str,
    path: str,
    ctx: AuthContext = Depends(require_auth),
    session: AsyncSession = Depends(get_session),
) -> dict:
    prefix = await _resolve_prefix(public_id, ctx, session)
    store = get_store()
    target = _safe_join(prefix, path)

    # If `target` is a directory, recursively delete every child.
    children = await store.list_objects(target.rstrip("/") + "/")
    if children:
        for k in children:
            try:
                await store.delete_object(k)
            except FileNotFoundError:
                pass
        return {"path": path, "deleted": len(children)}

    try:
        await store.delete_object(target)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail="File not found") from exc
    return {"path": path, "deleted": 1}


# ── Rename ─────────────────────────────────────────────────────────────


class RenameBody(BaseModel):
    old_path: str
    new_path: str


@router.post("/{public_id}/files/rename")
async def rename_file(
    public_id: str,
    body: RenameBody,
    ctx: AuthContext = Depends(require_auth),
    session: AsyncSession = Depends(get_session),
) -> dict:
    prefix = await _resolve_prefix(public_id, ctx, session)
    store = get_store()
    old_key = _safe_join(prefix, body.old_path)
    new_key = _safe_join(prefix, body.new_path)
    try:
        data = await store.get_object(old_key)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail="Source not found") from exc
    await store.put_object(new_key, data, content_type=_guess_mime(body.new_path))
    await store.delete_object(old_key)
    return {"old_path": body.old_path, "new_path": body.new_path}


# ── Live preview (real Vite dev server, one per project) ───────────────


@router.get("/{public_id}/server/status")
async def server_status(
    public_id: str,
    _ctx: AuthContext = Depends(require_auth),
) -> dict:
    return preview_manager.status(public_id)


@router.post("/{public_id}/server/start")
async def server_start(
    public_id: str,
    ctx: AuthContext = Depends(require_auth),
    session: AsyncSession = Depends(get_session),
) -> dict:
    prefix = await _resolve_prefix(public_id, ctx, session)
    return await preview_manager.start(public_id, prefix.rstrip("/"))


@router.post("/{public_id}/server/stop")
async def server_stop(
    public_id: str,
    _ctx: AuthContext = Depends(require_auth),
) -> dict:
    return await preview_manager.stop(public_id)


@router.post("/{public_id}/server/restart")
async def server_restart(
    public_id: str,
    ctx: AuthContext = Depends(require_auth),
    session: AsyncSession = Depends(get_session),
) -> dict:
    prefix = await _resolve_prefix(public_id, ctx, session)
    return await preview_manager.restart(public_id, prefix.rstrip("/"))
