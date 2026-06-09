"""Task API — granular sub-work inside a demand."""

from __future__ import annotations

import uuid
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import AuthContext, require_auth
from app.auth.dependency import require_role
from app.db import get_session
from app.db.audit import record
from app.db.repositories import TaskRepository
from app.notifications import notify

router = APIRouter(prefix="/api/tasks", tags=["tasks"])


class TaskCreate(BaseModel):
    demand_id: str
    title: str
    description: Optional[str] = None
    owner_id: Optional[str] = None
    swon_id: Optional[str] = None
    parent_task_id: Optional[str] = None
    priority: str = "medium"
    est_hours: Optional[float] = None
    sla_due_at: Optional[str] = None


class TaskStatusUpdate(BaseModel):
    status: str
    blocked_reason: Optional[str] = None
    reason: Optional[str] = None


class TaskUpdateBody(BaseModel):
    body: str
    kind: str = "comment"
    payload: Optional[dict] = None


class HandoffBody(BaseModel):
    to_user_id: str
    reason: Optional[str] = None


@router.get("")
async def list_tasks(
    demand_id: Optional[str] = None,
    owner_id: Optional[str] = None,
    status: Optional[str] = None,
    limit: int = 100,
    offset: int = 0,
    ctx: AuthContext = Depends(require_auth),
    session: AsyncSession = Depends(get_session),
):
    repo = TaskRepository(session)
    if demand_id:
        rows = await repo.list_for_demand(uuid.UUID(demand_id))
    elif owner_id:
        rows = await repo.list_for_owner(uuid.UUID(owner_id))
    else:
        rows = await repo.list_for_owner(ctx.user_id)
    if status:
        rows = [t for t in rows if t.status == status]
    total = len(rows)
    rows = rows[offset:offset + limit]
    return [_ser(t) for t in rows]


@router.get("/{task_id}")
async def get_task(
    task_id: str,
    ctx: AuthContext = Depends(require_auth),
    session: AsyncSession = Depends(get_session),
):
    repo = TaskRepository(session)
    t = await repo.get_by_public_id(task_id)
    if not t:
        try:
            t = await repo.get(uuid.UUID(task_id))
        except ValueError:
            pass
    if not t:
        raise HTTPException(404, "Task not found")
    return _ser(t)


@router.post("")
async def create_task(
    body: TaskCreate,
    ctx: AuthContext = require_role("manager", "leader", "middleware"),
    session: AsyncSession = Depends(get_session),
):
    from datetime import datetime
    repo = TaskRepository(session)
    sla = datetime.fromisoformat(body.sla_due_at) if body.sla_due_at else None
    t = await repo.create(
        tenant_id=ctx.tenant_id,
        demand_id=uuid.UUID(body.demand_id),
        title=body.title,
        description=body.description,
        owner_id=uuid.UUID(body.owner_id) if body.owner_id else None,
        swon_id=uuid.UUID(body.swon_id) if body.swon_id else None,
        parent_task_id=uuid.UUID(body.parent_task_id) if body.parent_task_id else None,
        priority=body.priority,
        est_hours=body.est_hours,
        sla_due_at=sla,
    )
    await record(session, tenant_id=ctx.tenant_id, entity_kind="task",
                 entity_id=str(t.id), action="created", actor_id=ctx.user_id)
    await session.commit()
    return _ser(t)


@router.patch("/{task_id}/status")
async def update_task_status(
    task_id: str,
    body: TaskStatusUpdate,
    ctx: AuthContext = Depends(require_auth),
    session: AsyncSession = Depends(get_session),
):
    repo = TaskRepository(session)
    t = await repo.get_by_public_id(task_id)
    if not t:
        raise HTTPException(404, "Task not found")
    old_status = t.status
    extra = {}
    if body.blocked_reason:
        extra["blocked_reason"] = body.blocked_reason
    await repo.update_status(t.id, body.status, **extra)
    await record(session, tenant_id=ctx.tenant_id, entity_kind="task",
                 entity_id=str(t.id), action="status_change", actor_id=ctx.user_id,
                 diff={"before": old_status, "after": body.status})
    await session.commit()
    return {"ok": True, "status": body.status}


@router.post("/{task_id}/updates")
async def add_task_update(
    task_id: str,
    body: TaskUpdateBody,
    ctx: AuthContext = Depends(require_auth),
    session: AsyncSession = Depends(get_session),
):
    repo = TaskRepository(session)
    t = await repo.get_by_public_id(task_id)
    if not t:
        raise HTTPException(404, "Task not found")
    tu = await repo.add_update(
        tenant_id=ctx.tenant_id,
        task_id=t.id,
        author_id=ctx.user_id,
        body=body.body,
        kind=body.kind,
        payload=body.payload,
    )
    await session.commit()
    return {"id": str(tu.id), "kind": tu.kind, "body": tu.body}


@router.get("/{task_id}/timeline")
async def task_timeline(
    task_id: str,
    ctx: AuthContext = Depends(require_auth),
    session: AsyncSession = Depends(get_session),
):
    repo = TaskRepository(session)
    t = await repo.get_by_public_id(task_id)
    if not t:
        raise HTTPException(404, "Task not found")
    updates = await repo.list_updates(t.id)
    handoffs = await repo.list_handoffs(t.id)
    events = []
    for u in updates:
        events.append({"type": "update", "kind": u.kind, "body": u.body,
                        "author_id": str(u.author_id) if u.author_id else None,
                        "created_at": u.created_at.isoformat()})
    for h in handoffs:
        events.append({"type": "handoff",
                        "from_user_id": str(h.from_user_id) if h.from_user_id else None,
                        "to_user_id": str(h.to_user_id) if h.to_user_id else None,
                        "reason": h.reason, "accepted": h.accepted,
                        "created_at": h.created_at.isoformat()})
    events.sort(key=lambda e: e["created_at"])
    return events


@router.post("/{task_id}/handoff")
async def request_handoff(
    task_id: str,
    body: HandoffBody,
    ctx: AuthContext = Depends(require_auth),
    session: AsyncSession = Depends(get_session),
):
    repo = TaskRepository(session)
    t = await repo.get_by_public_id(task_id)
    if not t:
        raise HTTPException(404, "Task not found")
    h = await repo.add_handoff(
        tenant_id=ctx.tenant_id,
        task_id=t.id,
        from_user_id=ctx.user_id,
        to_user_id=uuid.UUID(body.to_user_id),
        reason=body.reason,
    )
    await record(session, tenant_id=ctx.tenant_id, entity_kind="task",
                 entity_id=str(t.id), action="handoff", actor_id=ctx.user_id,
                 diff={"to_user_id": body.to_user_id, "reason": body.reason})
    await notify(
        session,
        tenant_id=ctx.tenant_id,
        user_id=uuid.UUID(body.to_user_id),
        kind="handoff",
        title=f"Task handoff: {t.title}",
        body=body.reason or f"Task {t.public_id} has been handed off to you.",
        entity_kind="task",
        entity_id=t.public_id,
    )
    await session.commit()
    return {"id": str(h.id), "accepted": h.accepted}


def _ser(t):
    return {
        "id": str(t.id),
        "public_id": t.public_id,
        "demand_id": str(t.demand_id),
        "swon_id": str(t.swon_id) if t.swon_id else None,
        "parent_task_id": str(t.parent_task_id) if t.parent_task_id else None,
        "title": t.title,
        "description": t.description,
        "owner_id": str(t.owner_id) if t.owner_id else None,
        "status": t.status,
        "priority": t.priority,
        "est_hours": t.est_hours,
        "actual_hours": t.actual_hours,
        "sla_due_at": t.sla_due_at.isoformat() if t.sla_due_at else None,
        "blocked_reason": t.blocked_reason,
        "created_at": t.created_at.isoformat() if t.created_at else None,
        "completed_at": t.completed_at.isoformat() if t.completed_at else None,
    }
