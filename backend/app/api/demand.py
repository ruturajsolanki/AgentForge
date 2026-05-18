"""Demand & pipeline routes — the front-door for the user's intent."""

from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import AuthContext, require_auth
from app.db import (
    AgentRunRepository,
    AsyncSessionLocal,
    DemandRepository,
    get_session,
)
from app.db.models import DemandRequest
from app.db.vector import ReuseDetector
from app.planner import planner_pipeline
from app.queue.worker import WorkerSettings, enqueue_pipeline
from app.schemas import DemandStage

router = APIRouter(prefix="/api", tags=["demand"])


class DemandCreate(BaseModel):
    text: str


class DecisionConfirm(BaseModel):
    approve: bool = True


@router.post("/demands")
async def create_demand(
    body: DemandCreate,
    ctx: AuthContext = Depends(require_auth),
    session: AsyncSession = Depends(get_session),
) -> dict:
    """Run ingestion + understanding + decision + allocation synchronously,
    then return the full plan so the UI can show 'awaiting approval'."""
    repo = DemandRepository(session)
    ingested = await planner_pipeline.ingest(body.text)
    demand = await repo.create(
        tenant_id=ctx.tenant_id,
        public_id=ingested["demand_id"],
        raw_text=body.text,
        created_by=ctx.user_id,
    )
    await repo.update_stage(demand.id, DemandStage.UNDERSTANDING.value)
    await session.commit()

    understanding = await planner_pipeline.understand(body.text)
    detector = ReuseDetector(session)
    reuse_score, similar = await detector.find_similar(
        tenant_id=ctx.tenant_id, demand_text=body.text
    )
    decision = await planner_pipeline.decide(understanding, reuse_score)
    allocation = await planner_pipeline.allocate(understanding, decision)

    await repo.update_stage(
        demand.id,
        DemandStage.AWAITING_APPROVAL.value,
        understanding=understanding.model_dump(mode="json"),
        decision=decision.model_dump(mode="json"),
        allocation=allocation.model_dump(mode="json"),
        similar_projects={"matches": similar},
        reuse_score=reuse_score,
    )
    await session.commit()

    return {
        "demand_id": demand.public_id,
        "stage": DemandStage.AWAITING_APPROVAL.value,
        "understanding": understanding.model_dump(mode="json"),
        "decision": decision.model_dump(mode="json"),
        "allocation": allocation.model_dump(mode="json"),
        "similar_projects": similar,
        "reuse_score": reuse_score,
    }


@router.post("/demands/{public_id}/approve")
async def approve_demand(
    public_id: str,
    _body: DecisionConfirm,
    ctx: AuthContext = Depends(require_auth),
    session: AsyncSession = Depends(get_session),
) -> dict:
    """Hand the demand off to the background worker for execution."""
    repo = DemandRepository(session)
    demand = await repo.get_by_public_id(ctx.tenant_id, public_id)
    if not demand:
        raise HTTPException(404, "Demand not found")
    if demand.stage not in (DemandStage.AWAITING_APPROVAL.value, DemandStage.FAILED.value):
        return {"demand_id": public_id, "stage": demand.stage}

    await repo.update_stage(demand.id, DemandStage.EXECUTING.value)
    await session.commit()

    await enqueue_pipeline(WorkerSettings.redis_settings, str(demand.id), str(ctx.tenant_id))
    return {"demand_id": public_id, "stage": DemandStage.EXECUTING.value}


@router.get("/demands")
async def list_demands(
    ctx: AuthContext = Depends(require_auth),
    session: AsyncSession = Depends(get_session),
) -> list[dict]:
    rows = await DemandRepository(session).list_recent(ctx.tenant_id)
    return [_serialize(r) for r in rows]


@router.get("/demands/{public_id}")
async def get_demand(
    public_id: str,
    ctx: AuthContext = Depends(require_auth),
    session: AsyncSession = Depends(get_session),
) -> dict:
    demand = await DemandRepository(session).get_by_public_id(ctx.tenant_id, public_id)
    if not demand:
        raise HTTPException(404, "Demand not found")
    runs = await AgentRunRepository(session).list_for_demand(demand.id)
    payload = _serialize(demand)
    payload["agent_runs"] = [
        {
            "id": str(r.id),
            "agent_id": r.agent_id,
            "task_title": r.task_title,
            "status": r.status,
            "progress": r.progress,
            "model_used": r.model_used,
            "started_at": r.started_at.isoformat() if r.started_at else None,
            "completed_at": r.completed_at.isoformat() if r.completed_at else None,
        }
        for r in runs
    ]
    return payload


def _serialize(d: DemandRequest) -> dict:
    return {
        "id": str(d.id),
        "public_id": d.public_id,
        "stage": d.stage,
        "raw_text": d.raw_text,
        "understanding": d.understanding,
        "decision": d.decision,
        "allocation": d.allocation,
        "similar_projects": d.similar_projects,
        "reuse_score": d.reuse_score,
        "explanation": d.explanation,
        "artifacts_prefix": d.artifacts_prefix,
        "preview_url": d.preview_url,
        "error": d.error,
        "created_at": d.created_at.isoformat() if d.created_at else None,
        "completed_at": d.completed_at.isoformat() if d.completed_at else None,
    }
