"""Dashboard API — comprehensive data for Executive, Manager, Team Leader dashboards."""

from __future__ import annotations

from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, Query
from sqlalchemy import case, cast, func, select, Integer
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import AuthContext, require_auth
from app.auth.dependency import require_role
from app.db import get_session
from app.db.models import (
    AuditEvent,
    DemandRequest,
    SwonRecord,
    Task,
    TeamMember,
    WonRecord,
)

router = APIRouter(prefix="/api/dashboard", tags=["dashboard"])

_utc = timezone.utc


def _week_ago() -> datetime:
    return datetime.now(_utc) - timedelta(days=7)


def _month_ago() -> datetime:
    return datetime.now(_utc) - timedelta(days=30)


@router.get("/executive")
async def executive_dashboard(
    ctx: AuthContext = require_role("higher_manager", "manager", "executive"),
    session: AsyncSession = Depends(get_session),
):
    """Organization-wide KPIs for the executive view."""
    tid = ctx.tenant_id

    demand_q = select(DemandRequest).where(DemandRequest.tenant_id == tid)
    demands = (await session.execute(demand_q)).scalars().all()

    total = len(demands)
    by_stage: dict[str, int] = {}
    active = 0
    closed = 0
    failed_count = 0
    delayed = 0
    now = datetime.now(_utc)

    for d in demands:
        by_stage[d.stage] = by_stage.get(d.stage, 0) + 1
        if d.stage in ("executing", "monitoring", "explaining", "allocating", "understanding", "deciding", "awaiting_approval"):
            active += 1
            age = (now - d.created_at.replace(tzinfo=_utc)).days if d.created_at else 0
            if age > 14 and d.stage not in ("completed", "failed", "cancelled"):
                delayed += 1
        elif d.stage == "completed":
            closed += 1
        elif d.stage in ("failed", "cancelled"):
            failed_count += 1

    task_total = (await session.execute(
        select(func.count()).select_from(Task).where(Task.tenant_id == tid)
    )).scalar() or 0
    tasks_done = (await session.execute(
        select(func.count()).select_from(Task).where(Task.tenant_id == tid, Task.status == "Done")
    )).scalar() or 0
    tasks_blocked = (await session.execute(
        select(func.count()).select_from(Task).where(Task.tenant_id == tid, Task.status == "Blocked")
    )).scalar() or 0

    sla_breaches = (await session.execute(
        select(func.count()).select_from(Task).where(
            Task.tenant_id == tid,
            Task.sla_due_at < now,
            Task.status.notin_(["Done"]),
        )
    )).scalar() or 0

    swon_count = (await session.execute(
        select(func.count()).select_from(SwonRecord).where(SwonRecord.tenant_id == tid)
    )).scalar() or 0
    won_count = (await session.execute(
        select(func.count()).select_from(WonRecord).where(WonRecord.tenant_id == tid)
    )).scalar() or 0

    total_team = (await session.execute(
        select(func.count()).select_from(TeamMember).where(TeamMember.tenant_id == tid)
    )).scalar() or 0
    assigned_team = (await session.execute(
        select(func.count()).select_from(TeamMember).where(
            TeamMember.tenant_id == tid,
            TeamMember.current_project != "Available",
        )
    )).scalar() or 0

    resource_utilization = round((assigned_team / total_team * 100) if total_team > 0 else 0, 1)
    delivery_rate = round((closed / total * 100) if total > 0 else 0, 1)
    task_completion_rate = round((tasks_done / task_total * 100) if task_total > 0 else 0, 1)

    trend_data = []
    for i in range(6, -1, -1):
        d = now - timedelta(days=i)
        day_label = d.strftime("%a")
        count = sum(
            1 for dm in demands
            if dm.created_at and dm.created_at.replace(tzinfo=_utc).date() == d.date()
        )
        trend_data.append({"day": day_label, "count": count})

    recent_completed = [
        {
            "id": str(d.id),
            "public_id": d.public_id,
            "stage": d.stage,
            "raw_text": d.raw_text[:120] if d.raw_text else "",
            "completed_at": d.completed_at.isoformat() if d.completed_at else None,
        }
        for d in sorted(
            [dm for dm in demands if dm.stage == "completed"],
            key=lambda x: x.completed_at or datetime.min.replace(tzinfo=_utc),
            reverse=True,
        )[:10]
    ]

    return {
        "total_demands": total,
        "active_demands": active,
        "closed_demands": closed,
        "failed_demands": failed_count,
        "delayed_demands": delayed,
        "stage_breakdown": by_stage,
        "task_total": task_total,
        "tasks_done": tasks_done,
        "tasks_blocked": tasks_blocked,
        "sla_breaches": sla_breaches,
        "swon_count": swon_count,
        "won_count": won_count,
        "resource_utilization": resource_utilization,
        "total_team": total_team,
        "assigned_team": assigned_team,
        "delivery_rate": delivery_rate,
        "task_completion_rate": task_completion_rate,
        "demand_trend": trend_data,
        "recent_completed": recent_completed,
    }


@router.get("/manager")
async def manager_dashboard(
    ctx: AuthContext = require_role("manager", "higher_manager"),
    session: AsyncSession = Depends(get_session),
):
    """Manager-level visibility: demands, workload, SLA, escalations, approvals."""
    tid = ctx.tenant_id
    now = datetime.now(_utc)

    demands = (await session.execute(
        select(DemandRequest)
        .where(DemandRequest.tenant_id == tid)
        .order_by(DemandRequest.created_at.desc())
        .limit(100)
    )).scalars().all()

    tasks = (await session.execute(
        select(Task).where(Task.tenant_id == tid)
    )).scalars().all()

    pending_approvals = [
        {
            "id": str(d.id), "public_id": d.public_id,
            "raw_text": d.raw_text[:120] if d.raw_text else "",
            "created_at": d.created_at.isoformat() if d.created_at else None,
        }
        for d in demands if d.stage == "awaiting_approval"
    ]

    sla_breaches = [
        {
            "id": str(t.id), "public_id": t.public_id,
            "title": t.title, "status": t.status,
            "sla_due_at": t.sla_due_at.isoformat() if t.sla_due_at else None,
            "demand_id": str(t.demand_id),
        }
        for t in tasks
        if t.sla_due_at and t.sla_due_at.replace(tzinfo=_utc) < now and t.status != "Done"
    ]

    blocked_tasks = [
        {
            "id": str(t.id), "public_id": t.public_id,
            "title": t.title, "blocked_reason": t.blocked_reason,
            "demand_id": str(t.demand_id),
        }
        for t in tasks if t.status == "Blocked"
    ]

    by_stage: dict[str, int] = {}
    for d in demands:
        by_stage[d.stage] = by_stage.get(d.stage, 0) + 1

    owner_workload: dict[str, dict] = {}
    for t in tasks:
        oid = str(t.owner_id) if t.owner_id else "unassigned"
        if oid not in owner_workload:
            owner_workload[oid] = {"total": 0, "done": 0, "in_progress": 0, "blocked": 0}
        owner_workload[oid]["total"] += 1
        if t.status == "Done":
            owner_workload[oid]["done"] += 1
        elif t.status == "InProgress":
            owner_workload[oid]["in_progress"] += 1
        elif t.status == "Blocked":
            owner_workload[oid]["blocked"] += 1

    members = (await session.execute(
        select(TeamMember).where(TeamMember.tenant_id == tid)
    )).scalars().all()

    team_allocation = [
        {
            "id": str(m.id), "name": m.name, "role": m.role,
            "availability": m.availability,
            "current_project": m.current_project,
        }
        for m in members
    ]

    demand_list = [
        {
            "id": str(d.id), "public_id": d.public_id,
            "stage": d.stage,
            "raw_text": d.raw_text[:120] if d.raw_text else "",
            "created_at": d.created_at.isoformat() if d.created_at else None,
            "updated_at": d.updated_at.isoformat() if d.updated_at else None,
            "age_days": (now - d.created_at.replace(tzinfo=_utc)).days if d.created_at else 0,
        }
        for d in demands[:50]
    ]

    return {
        "demands": demand_list,
        "stage_breakdown": by_stage,
        "pending_approvals": pending_approvals,
        "sla_breaches": sla_breaches,
        "blocked_tasks": blocked_tasks,
        "team_workload": owner_workload,
        "team_allocation": team_allocation,
        "summary": {
            "total_demands": len(demands),
            "active_demands": sum(1 for d in demands if d.stage in ("executing", "monitoring", "explaining", "allocating", "understanding", "deciding", "awaiting_approval")),
            "total_tasks": len(tasks),
            "tasks_done": sum(1 for t in tasks if t.status == "Done"),
            "tasks_in_progress": sum(1 for t in tasks if t.status == "InProgress"),
            "total_blocked": len(blocked_tasks),
            "total_sla_breaches": len(sla_breaches),
            "pending_approval_count": len(pending_approvals),
        },
    }


@router.get("/leader")
async def leader_dashboard(
    ctx: AuthContext = require_role("leader", "manager", "higher_manager"),
    session: AsyncSession = Depends(get_session),
):
    """Team leader: assignments, individual progress, work distribution, health, blocked."""
    tid = ctx.tenant_id
    now = datetime.now(_utc)

    tasks = (await session.execute(
        select(Task).where(Task.tenant_id == tid)
    )).scalars().all()

    demands = (await session.execute(
        select(DemandRequest)
        .where(
            DemandRequest.tenant_id == tid,
            DemandRequest.stage.in_(["executing", "monitoring", "explaining"]),
        )
    )).scalars().all()

    member_progress: dict[str, dict] = {}
    for t in tasks:
        oid = str(t.owner_id) if t.owner_id else "unassigned"
        if oid not in member_progress:
            member_progress[oid] = {"total": 0, "done": 0, "in_progress": 0, "blocked": 0, "todo": 0, "review": 0}
        member_progress[oid]["total"] += 1
        status_key = {"Done": "done", "InProgress": "in_progress", "Blocked": "blocked", "Todo": "todo", "Review": "review"}.get(t.status, "todo")
        member_progress[oid][status_key] += 1

    work_distribution = {
        "Todo": sum(1 for t in tasks if t.status == "Todo"),
        "InProgress": sum(1 for t in tasks if t.status == "InProgress"),
        "Review": sum(1 for t in tasks if t.status == "Review"),
        "Blocked": sum(1 for t in tasks if t.status == "Blocked"),
        "Done": sum(1 for t in tasks if t.status == "Done"),
    }

    blocked_tasks = [
        {
            "id": str(t.id), "public_id": t.public_id,
            "title": t.title, "blocked_reason": t.blocked_reason,
            "owner_id": str(t.owner_id) if t.owner_id else None,
            "demand_id": str(t.demand_id),
            "sla_due_at": t.sla_due_at.isoformat() if t.sla_due_at else None,
        }
        for t in tasks if t.status == "Blocked"
    ]

    sla_at_risk = [
        {
            "id": str(t.id), "public_id": t.public_id,
            "title": t.title, "status": t.status,
            "sla_due_at": t.sla_due_at.isoformat() if t.sla_due_at else None,
            "owner_id": str(t.owner_id) if t.owner_id else None,
        }
        for t in tasks
        if t.sla_due_at and t.sla_due_at.replace(tzinfo=_utc) < now + timedelta(days=2) and t.status != "Done"
    ]

    active_demands = [
        {
            "id": str(d.id), "public_id": d.public_id,
            "stage": d.stage,
            "raw_text": d.raw_text[:120] if d.raw_text else "",
            "task_count": sum(1 for t in tasks if t.demand_id == d.id),
            "tasks_done": sum(1 for t in tasks if t.demand_id == d.id and t.status == "Done"),
        }
        for d in demands
    ]

    total_tasks = len(tasks)
    done = work_distribution["Done"]
    health_score = round((done / total_tasks * 100) if total_tasks else 0, 1)

    return {
        "member_progress": member_progress,
        "work_distribution": work_distribution,
        "blocked_tasks": blocked_tasks,
        "sla_at_risk": sla_at_risk,
        "active_demands": active_demands,
        "summary": {
            "total_tasks": total_tasks,
            "tasks_done": done,
            "tasks_in_progress": work_distribution["InProgress"],
            "tasks_blocked": work_distribution["Blocked"],
            "health_score": health_score,
            "active_demand_count": len(demands),
        },
    }
