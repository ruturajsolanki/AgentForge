"""Reports API — delivery metrics, team performance, aging, SLA, multi-format exports."""

from __future__ import annotations

import csv
import io
import json
from datetime import datetime, timedelta, timezone
from typing import Optional

from fastapi import APIRouter, Depends, Query
from fastapi.responses import StreamingResponse
from sqlalchemy import func, select
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

router = APIRouter(prefix="/api/reports", tags=["reports"])

_utc = timezone.utc


def _to_csv(rows: list[dict], fieldnames: list[str]) -> bytes:
    buf = io.StringIO()
    writer = csv.DictWriter(buf, fieldnames=fieldnames)
    writer.writeheader()
    for row in rows:
        writer.writerow({k: row.get(k, "") for k in fieldnames})
    return buf.getvalue().encode()


def _to_excel_csv(rows: list[dict], fieldnames: list[str]) -> bytes:
    """Generate TSV (tab-separated) that Excel opens natively with BOM."""
    buf = io.StringIO()
    buf.write("\ufeff")
    writer = csv.DictWriter(buf, fieldnames=fieldnames, delimiter="\t")
    writer.writeheader()
    for row in rows:
        writer.writerow({k: row.get(k, "") for k in fieldnames})
    return buf.getvalue().encode("utf-8-sig")


def _stream(data: bytes, filename: str, media: str):
    return StreamingResponse(
        io.BytesIO(data),
        media_type=media,
        headers={"Content-Disposition": f"attachment; filename={filename}"},
    )


# ── Delivery report ────────────────────────────────────────────────────

@router.get("/delivery")
async def delivery_report(
    format: str = Query(default="json"),
    period: str = Query(default="month"),
    ctx: AuthContext = require_role("manager", "higher_manager"),
    session: AsyncSession = Depends(get_session),
):
    tid = ctx.tenant_id

    swon_count = (await session.execute(
        select(func.count()).select_from(SwonRecord).where(SwonRecord.tenant_id == tid)
    )).scalar() or 0
    won_count = (await session.execute(
        select(func.count()).select_from(WonRecord).where(WonRecord.tenant_id == tid)
    )).scalar() or 0
    task_count = (await session.execute(
        select(func.count()).select_from(Task).where(Task.tenant_id == tid)
    )).scalar() or 0
    tasks_done = (await session.execute(
        select(func.count()).select_from(Task).where(Task.tenant_id == tid, Task.status == "Done")
    )).scalar() or 0
    demands_count = (await session.execute(
        select(func.count()).select_from(DemandRequest).where(DemandRequest.tenant_id == tid)
    )).scalar() or 0

    data = {
        "period": period,
        "swon_count": swon_count,
        "won_count": won_count,
        "task_total": task_count,
        "tasks_done": tasks_done,
        "demands_total": demands_count,
    }

    if format == "csv":
        return _stream(
            _to_csv([data], list(data.keys())),
            f"delivery_{period}.csv",
            "text/csv",
        )

    if format == "excel":
        return _stream(
            _to_excel_csv([data], list(data.keys())),
            f"delivery_{period}.xlsx",
            "application/vnd.ms-excel",
        )

    return data


# ── Team performance report ────────────────────────────────────────────

@router.get("/team-performance")
async def team_performance_report(
    format: str = Query(default="json"),
    ctx: AuthContext = require_role("manager", "higher_manager"),
    session: AsyncSession = Depends(get_session),
):
    tid = ctx.tenant_id

    members = (await session.execute(
        select(TeamMember).where(TeamMember.tenant_id == tid)
    )).scalars().all()

    tasks = (await session.execute(
        select(Task).where(Task.tenant_id == tid)
    )).scalars().all()

    rows = []
    for m in members:
        member_tasks = [t for t in tasks if str(t.owner_id) == str(m.id)]
        total = len(member_tasks)
        done = sum(1 for t in member_tasks if t.status == "Done")
        in_progress = sum(1 for t in member_tasks if t.status == "InProgress")
        blocked = sum(1 for t in member_tasks if t.status == "Blocked")
        total_hours = sum(t.actual_hours or 0 for t in member_tasks)
        completion_rate = round((done / total * 100) if total else 0, 1)
        rows.append({
            "name": m.name,
            "role": m.role,
            "availability": m.availability,
            "current_project": m.current_project,
            "total_tasks": total,
            "done": done,
            "in_progress": in_progress,
            "blocked": blocked,
            "hours_logged": round(total_hours, 1),
            "completion_rate": completion_rate,
        })

    fields = ["name", "role", "availability", "current_project", "total_tasks", "done", "in_progress", "blocked", "hours_logged", "completion_rate"]

    if format == "csv":
        return _stream(_to_csv(rows, fields), "team_performance.csv", "text/csv")
    if format == "excel":
        return _stream(_to_excel_csv(rows, fields), "team_performance.xlsx", "application/vnd.ms-excel")

    return {"members": rows, "total_members": len(rows)}


# ── Demand aging report ────────────────────────────────────────────────

@router.get("/demand-aging")
async def demand_aging_report(
    format: str = Query(default="json"),
    ctx: AuthContext = require_role("manager", "higher_manager"),
    session: AsyncSession = Depends(get_session),
):
    tid = ctx.tenant_id
    now = datetime.now(_utc)

    demands = (await session.execute(
        select(DemandRequest)
        .where(DemandRequest.tenant_id == tid)
        .order_by(DemandRequest.created_at)
    )).scalars().all()

    rows = []
    for d in demands:
        age = (now - d.created_at.replace(tzinfo=_utc)).days if d.created_at else 0
        if d.stage in ("completed", "failed", "cancelled"):
            if d.completed_at:
                age = (d.completed_at.replace(tzinfo=_utc) - d.created_at.replace(tzinfo=_utc)).days
            bucket = "Closed"
        elif age <= 7:
            bucket = "0-7 days"
        elif age <= 14:
            bucket = "8-14 days"
        elif age <= 30:
            bucket = "15-30 days"
        else:
            bucket = "30+ days"

        rows.append({
            "public_id": d.public_id,
            "stage": d.stage,
            "age_days": age,
            "bucket": bucket,
            "created_at": d.created_at.isoformat() if d.created_at else "",
            "updated_at": d.updated_at.isoformat() if d.updated_at else "",
        })

    buckets = {}
    for r in rows:
        b = r["bucket"]
        buckets[b] = buckets.get(b, 0) + 1

    fields = ["public_id", "stage", "age_days", "bucket", "created_at", "updated_at"]

    if format == "csv":
        return _stream(_to_csv(rows, fields), "demand_aging.csv", "text/csv")
    if format == "excel":
        return _stream(_to_excel_csv(rows, fields), "demand_aging.xlsx", "application/vnd.ms-excel")

    return {"demands": rows, "buckets": buckets, "total": len(rows)}


# ── SLA compliance report ──────────────────────────────────────────────

@router.get("/sla-compliance")
async def sla_compliance_report(
    format: str = Query(default="json"),
    ctx: AuthContext = require_role("manager", "higher_manager"),
    session: AsyncSession = Depends(get_session),
):
    tid = ctx.tenant_id
    now = datetime.now(_utc)

    tasks = (await session.execute(
        select(Task).where(Task.tenant_id == tid)
    )).scalars().all()

    rows = []
    breached = 0
    at_risk = 0
    on_track = 0
    no_sla = 0

    for t in tasks:
        if not t.sla_due_at:
            no_sla += 1
            sla_status = "No SLA"
        elif t.status == "Done":
            if t.completed_at and t.completed_at.replace(tzinfo=_utc) > t.sla_due_at.replace(tzinfo=_utc):
                breached += 1
                sla_status = "Breached"
            else:
                on_track += 1
                sla_status = "Met"
        elif t.sla_due_at.replace(tzinfo=_utc) < now:
            breached += 1
            sla_status = "Breached"
        elif t.sla_due_at.replace(tzinfo=_utc) < now + timedelta(days=2):
            at_risk += 1
            sla_status = "At Risk"
        else:
            on_track += 1
            sla_status = "On Track"

        rows.append({
            "public_id": t.public_id,
            "title": t.title,
            "status": t.status,
            "sla_due_at": t.sla_due_at.isoformat() if t.sla_due_at else "",
            "completed_at": t.completed_at.isoformat() if t.completed_at else "",
            "sla_status": sla_status,
        })

    fields = ["public_id", "title", "status", "sla_due_at", "completed_at", "sla_status"]

    if format == "csv":
        return _stream(_to_csv(rows, fields), "sla_compliance.csv", "text/csv")
    if format == "excel":
        return _stream(_to_excel_csv(rows, fields), "sla_compliance.xlsx", "application/vnd.ms-excel")

    total_with_sla = breached + at_risk + on_track
    compliance_rate = round((on_track / total_with_sla * 100) if total_with_sla else 0, 1)

    return {
        "tasks": rows,
        "summary": {
            "total": len(rows),
            "breached": breached,
            "at_risk": at_risk,
            "on_track": on_track,
            "no_sla": no_sla,
            "compliance_rate": compliance_rate,
        },
    }


# ── SWON detail report ────────────────────────────────────────────────

@router.get("/swon-detail")
async def swon_detail_report(
    format: str = Query(default="json"),
    ctx: AuthContext = require_role("manager", "higher_manager"),
    session: AsyncSession = Depends(get_session),
):
    tid = ctx.tenant_id

    swons = (await session.execute(
        select(SwonRecord).where(SwonRecord.tenant_id == tid).order_by(SwonRecord.created_at.desc())
    )).scalars().all()

    rows = []
    for s in swons:
        wons = (await session.execute(
            select(WonRecord).where(WonRecord.swon_id == s.id)
        )).scalars().all()

        rows.append({
            "public_id": s.public_id,
            "lifecycle_state": s.lifecycle_state,
            "customer_loa_ref": s.customer_loa_ref or "",
            "sow_summary": (s.sow_summary or "")[:200],
            "total_value_inr": s.total_value_inr or 0,
            "billing_currency": s.billing_currency,
            "opened_at": s.opened_at.isoformat() if s.opened_at else "",
            "closed_at": s.closed_at.isoformat() if s.closed_at else "",
            "won_count": len(wons),
            "total_monthly_value": sum(w.monthly_value_inr or 0 for w in wons),
        })

    fields = ["public_id", "lifecycle_state", "customer_loa_ref", "sow_summary", "total_value_inr", "billing_currency", "opened_at", "closed_at", "won_count", "total_monthly_value"]

    if format == "csv":
        return _stream(_to_csv(rows, fields), "swon_detail.csv", "text/csv")
    if format == "excel":
        return _stream(_to_excel_csv(rows, fields), "swon_detail.xlsx", "application/vnd.ms-excel")

    return {"swons": rows, "total": len(rows)}


# ── Portfolio (sanitized for Higher Manager) ───────────────────────────

SANITIZED_STAGES = {"executing", "monitoring", "completed"}


@router.get("/portfolio")
async def portfolio_report(
    sanitized: bool = Query(default=False),
    ctx: AuthContext = require_role("higher_manager", "manager"),
    session: AsyncSession = Depends(get_session),
):
    """Portfolio view. Pass ?sanitized=true for Higher-Manager mode that
    strips all negative indicators (failures, errors, risk data)."""
    is_hm = sanitized or "higher_manager" in ctx.roles

    demands = (await session.execute(
        select(DemandRequest)
        .where(DemandRequest.tenant_id == ctx.tenant_id)
        .order_by(DemandRequest.created_at.desc())
        .limit(50)
    )).scalars().all()

    result = []
    for d in demands:
        if is_hm and d.stage not in SANITIZED_STAGES:
            continue
        entry: dict = {
            "id": str(d.id),
            "public_id": d.public_id,
            "stage": d.stage,
            "raw_text": d.raw_text[:200],
            "created_at": d.created_at.isoformat() if d.created_at else None,
            "completed_at": d.completed_at.isoformat() if d.completed_at else None,
        }
        if not is_hm:
            entry["error"] = d.error
            entry["understanding"] = d.understanding
            entry["decision"] = d.decision
            entry["allocation"] = d.allocation
            entry["reuse_score"] = d.reuse_score
        result.append(entry)

    closed_swons = (await session.execute(
        select(func.count()).select_from(SwonRecord).where(
            SwonRecord.tenant_id == ctx.tenant_id,
            SwonRecord.lifecycle_state == "Closed",
        )
    )).scalar() or 0

    active_swons = (await session.execute(
        select(func.count()).select_from(SwonRecord).where(
            SwonRecord.tenant_id == ctx.tenant_id,
            SwonRecord.lifecycle_state.notin_(["Closed", "Warranty"]),
        )
    )).scalar() or 0

    return {
        "demands": result,
        "closed_swons_count": closed_swons,
        "active_swons_count": active_swons,
        "total_demands": len(result),
    }
