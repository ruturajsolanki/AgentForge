"""SWON (Service Work Order Number) API."""

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
from app.db.repositories import SwonRepository
from app.notifications import notify

router = APIRouter(prefix="/api/swon", tags=["swon"])


class SwonCreate(BaseModel):
    demand_id: str
    customer_loa_ref: Optional[str] = None
    sow_summary: Optional[str] = None
    total_value_inr: Optional[float] = None


class SwonStateUpdate(BaseModel):
    state: str


@router.get("")
async def list_swons(
    ctx: AuthContext = Depends(require_auth),
    session: AsyncSession = Depends(get_session),
):
    repo = SwonRepository(session)
    rows = await repo.list_for_tenant(ctx.tenant_id)
    return [_ser(r) for r in rows]


@router.get("/{swon_id}")
async def get_swon(
    swon_id: str,
    ctx: AuthContext = Depends(require_auth),
    session: AsyncSession = Depends(get_session),
):
    repo = SwonRepository(session)
    rec = await repo.get_by_public_id(swon_id)
    if not rec:
        try:
            rec = await repo.get(uuid.UUID(swon_id))
        except ValueError:
            pass
    if not rec:
        raise HTTPException(404, "SWON not found")
    return _ser(rec)


@router.post("")
async def create_swon(
    body: SwonCreate,
    ctx: AuthContext = require_role("manager", "higher_manager"),
    session: AsyncSession = Depends(get_session),
):
    repo = SwonRepository(session)
    rec = await repo.create(
        tenant_id=ctx.tenant_id,
        demand_id=uuid.UUID(body.demand_id),
        customer_loa_ref=body.customer_loa_ref,
        sow_summary=body.sow_summary,
        total_value_inr=body.total_value_inr,
    )
    await record(session, tenant_id=ctx.tenant_id, entity_kind="swon",
                 entity_id=str(rec.id), action="created", actor_id=ctx.user_id)
    await session.commit()
    return _ser(rec)


@router.patch("/{swon_id}/state")
async def update_swon_state(
    swon_id: str,
    body: SwonStateUpdate,
    ctx: AuthContext = require_role("manager", "higher_manager"),
    session: AsyncSession = Depends(get_session),
):
    repo = SwonRepository(session)
    rec = await repo.get_by_public_id(swon_id)
    if not rec:
        raise HTTPException(404, "SWON not found")
    old_state = rec.lifecycle_state
    await repo.update_state(rec.id, body.state)
    await record(session, tenant_id=ctx.tenant_id, entity_kind="swon",
                 entity_id=str(rec.id), action="state_changed", actor_id=ctx.user_id,
                 diff={"before": old_state, "after": body.state})
    await notify(
        session,
        tenant_id=ctx.tenant_id,
        user_id=None,
        kind="swon_state",
        title=f"SWON {rec.public_id} → {body.state}",
        body=f"Service work order {rec.public_id} moved from {old_state} to {body.state}.",
        entity_kind="swon",
        entity_id=rec.public_id,
    )
    await session.commit()
    return {"ok": True, "state": body.state}


def _ser(r):
    return {
        "id": str(r.id),
        "public_id": r.public_id,
        "demand_id": str(r.demand_id),
        "customer_loa_ref": r.customer_loa_ref,
        "sow_summary": r.sow_summary,
        "lifecycle_state": r.lifecycle_state,
        "opened_at": r.opened_at.isoformat() if r.opened_at else None,
        "closed_at": r.closed_at.isoformat() if r.closed_at else None,
        "total_value_inr": r.total_value_inr,
        "billing_currency": r.billing_currency,
    }
