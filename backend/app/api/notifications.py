"""Notification feed API — per-user durable notifications."""

from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import AuthContext, require_auth
from app.db import get_session
from app.db.repositories import NotificationRepository

router = APIRouter(prefix="/api/notifications", tags=["notifications"])


def _serialize(n) -> dict:
    return {
        "id": str(n.id),
        "kind": n.kind,
        "title": n.title,
        "body": n.body,
        "entity_kind": n.entity_kind,
        "entity_id": n.entity_id,
        "read": n.read,
        "created_at": n.created_at.isoformat() if n.created_at else None,
    }


@router.get("")
async def list_notifications(
    unread_only: bool = Query(default=False),
    limit: int = Query(default=50, le=200),
    ctx: AuthContext = Depends(require_auth),
    session: AsyncSession = Depends(get_session),
) -> dict:
    repo = NotificationRepository(session)
    rows = await repo.list_for_user(
        ctx.tenant_id, ctx.user_id, unread_only=unread_only, limit=limit
    )
    unread = await repo.unread_count(ctx.tenant_id, ctx.user_id)
    return {
        "items": [_serialize(n) for n in rows],
        "unread_count": unread,
    }


@router.post("/{notification_id}/read")
async def mark_read(
    notification_id: str,
    ctx: AuthContext = Depends(require_auth),
    session: AsyncSession = Depends(get_session),
) -> dict:
    try:
        nid = uuid.UUID(notification_id)
    except ValueError as exc:
        raise HTTPException(400, "Invalid notification id") from exc
    repo = NotificationRepository(session)
    await repo.mark_read(ctx.tenant_id, nid)
    await session.commit()
    unread = await repo.unread_count(ctx.tenant_id, ctx.user_id)
    return {"ok": True, "unread_count": unread}


@router.post("/read-all")
async def mark_all_read(
    ctx: AuthContext = Depends(require_auth),
    session: AsyncSession = Depends(get_session),
) -> dict:
    repo = NotificationRepository(session)
    await repo.mark_all_read(ctx.tenant_id, ctx.user_id)
    await session.commit()
    return {"ok": True, "unread_count": 0}
