"""Audit event API — read-only access to the activity log with pagination."""

from __future__ import annotations

from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, Query
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import AuthContext, require_auth
from app.db import get_session
from app.db.models import AuditEvent
from app.db.repositories import AuditRepository

router = APIRouter(prefix="/api/audit", tags=["audit"])


@router.get("")
async def list_audit_events(
    entity_kind: Optional[str] = None,
    entity_id: Optional[str] = None,
    action: Optional[str] = None,
    actor: Optional[str] = None,
    since: Optional[str] = None,
    limit: int = Query(default=50, le=500),
    offset: int = Query(default=0, ge=0),
    ctx: AuthContext = Depends(require_auth),
    session: AsyncSession = Depends(get_session),
):
    repo = AuditRepository(session)
    since_dt = datetime.fromisoformat(since) if since else None

    if entity_kind and entity_id:
        rows = await repo.list_for_entity(entity_kind, entity_id, limit=limit)
    else:
        rows = await repo.list_for_tenant(
            ctx.tenant_id,
            entity_kind=entity_kind,
            since=since_dt,
            limit=limit,
            offset=offset,
        )

    total_q = select(func.count()).select_from(AuditEvent).where(
        AuditEvent.tenant_id == ctx.tenant_id,
    )
    if entity_kind:
        total_q = total_q.where(AuditEvent.entity_kind == entity_kind)
    total = (await session.execute(total_q)).scalar() or 0

    items = [
        {
            "id": str(ev.id),
            "entity_kind": ev.entity_kind,
            "entity_id": ev.entity_id,
            "actor_id": str(ev.actor_id) if ev.actor_id else None,
            "action": ev.action,
            "diff": ev.diff,
            "reason": ev.reason if hasattr(ev, "reason") else None,
            "created_at": ev.created_at.isoformat() if ev.created_at else None,
        }
        for ev in rows
    ]

    return {
        "items": items,
        "total": total,
        "limit": limit,
        "offset": offset,
        "has_more": (offset + limit) < total,
    }
