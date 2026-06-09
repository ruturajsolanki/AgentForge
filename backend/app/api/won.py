"""WON (Work Order Number) API."""

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
from app.db.repositories import WonRepository
from app.notifications import notify

router = APIRouter(prefix="/api/won", tags=["won"])


class WonCreate(BaseModel):
    swon_id: str
    billable: bool = True
    resource_id: Optional[str] = None
    cost_centre: Optional[str] = None
    allocation_pct: float = 100.0
    monthly_value_inr: Optional[float] = None


class WonStateUpdate(BaseModel):
    state: str


@router.get("")
async def list_wons(
    swon: Optional[str] = None,
    swon_id: Optional[str] = None,
    ctx: AuthContext = Depends(require_auth),
    session: AsyncSession = Depends(get_session),
):
    from sqlalchemy import select
    from app.db.models import WonRecord
    repo = WonRepository(session)
    sid = swon or swon_id
    if sid:
        rows = await repo.list_for_swon(uuid.UUID(sid))
    else:
        result = await session.execute(
            select(WonRecord).where(WonRecord.tenant_id == ctx.tenant_id).limit(200)
        )
        rows = result.scalars().all()
    return [_ser(r) for r in rows]


@router.post("")
async def create_won(
    body: WonCreate,
    ctx: AuthContext = require_role("manager", "higher_manager"),
    session: AsyncSession = Depends(get_session),
):
    repo = WonRepository(session)
    rec = await repo.create(
        tenant_id=ctx.tenant_id,
        swon_id=uuid.UUID(body.swon_id),
        billable=body.billable,
        resource_id=uuid.UUID(body.resource_id) if body.resource_id else None,
        cost_centre=body.cost_centre,
        allocation_pct=body.allocation_pct,
        monthly_value_inr=body.monthly_value_inr,
    )
    await record(session, tenant_id=ctx.tenant_id, entity_kind="won",
                 entity_id=str(rec.id), action="created", actor_id=ctx.user_id)
    await session.commit()
    return _ser(rec)


@router.patch("/{won_id}")
async def update_won_state(
    won_id: str,
    body: WonStateUpdate,
    ctx: AuthContext = require_role("manager", "higher_manager"),
    session: AsyncSession = Depends(get_session),
):
    repo = WonRepository(session)
    await repo.update_state(uuid.UUID(won_id), body.state)
    await record(session, tenant_id=ctx.tenant_id, entity_kind="won",
                 entity_id=won_id, action="state_changed", actor_id=ctx.user_id,
                 diff={"after": body.state})
    await notify(
        session,
        tenant_id=ctx.tenant_id,
        user_id=None,
        kind="won_state",
        title=f"WON → {body.state}",
        body=f"Work order {won_id} state changed to {body.state}.",
        entity_kind="won",
        entity_id=won_id,
    )
    await session.commit()
    return {"ok": True, "state": body.state}


def _ser(r):
    return {
        "id": str(r.id),
        "public_id": r.public_id,
        "swon_id": str(r.swon_id),
        "billable": r.billable,
        "resource_id": str(r.resource_id) if r.resource_id else None,
        "cost_centre": r.cost_centre,
        "allocation_pct": r.allocation_pct,
        "start_date": r.start_date.isoformat() if r.start_date else None,
        "end_date": r.end_date.isoformat() if r.end_date else None,
        "monthly_value_inr": r.monthly_value_inr,
        "state": r.state,
    }
