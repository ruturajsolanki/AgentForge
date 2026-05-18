"""Arq worker entrypoint.

Run with:  arq app.queue.worker.WorkerSettings
"""

from __future__ import annotations

import logging
import uuid
from datetime import datetime, timezone

from arq.connections import RedisSettings

from app.config import REDIS_URL
from app.db import AsyncSessionLocal, DemandRepository
from app.db.vector import ReuseDetector
from app.executor import Orchestrator
from app.planner import planner_pipeline
from app.queue.events import event_bus, make_emitter
from app.schemas import DemandStage
from app.storage import get_store

logger = logging.getLogger(__name__)


def _redis_settings() -> RedisSettings:
    return RedisSettings.from_dsn(REDIS_URL)


async def run_full_pipeline(ctx: dict, demand_uuid: str, tenant_uuid: str) -> dict:
    """Background job: run the full planner -> executor -> monitor -> explain pipeline."""

    demand_id = uuid.UUID(demand_uuid)
    tenant_id = uuid.UUID(tenant_uuid)

    async with AsyncSessionLocal() as session:
        demand_repo = DemandRepository(session)
        from sqlalchemy import select
        from app.db.models import DemandRequest

        demand = (await session.execute(
            select(DemandRequest).where(DemandRequest.id == demand_id)
        )).scalar_one()
        prompt = demand.raw_text
        public_id = demand.public_id

        # Use the public_id (DMD-XXX) on the wire — it's what the UI tracks.
        emit = make_emitter(str(tenant_id), public_id)

        await emit({"type": "pipeline.stage", "stage": DemandStage.UNDERSTANDING.value})
        understanding = await planner_pipeline.understand(prompt)
        await demand_repo.update_stage(
            demand_id, DemandStage.DECIDING.value,
            understanding=understanding.model_dump(mode="json"),
        )
        await session.commit()
        await emit({"type": "pipeline.understanding",
                    "understanding": understanding.model_dump(mode="json")})

        detector = ReuseDetector(session)
        reuse_score, similar = await detector.find_similar(
            tenant_id=tenant_id, demand_text=prompt
        )
        await emit({"type": "pipeline.reuse", "reuse_score": reuse_score, "matches": similar})

        decision = await planner_pipeline.decide(understanding, reuse_score)
        await demand_repo.update_stage(
            demand_id, DemandStage.ALLOCATING.value,
            decision=decision.model_dump(mode="json"),
            similar_projects={"matches": similar},
            reuse_score=reuse_score,
        )
        await session.commit()
        await emit({"type": "pipeline.decision",
                    "decision": decision.model_dump(mode="json")})

        allocation = await planner_pipeline.allocate(understanding, decision)
        await demand_repo.update_stage(
            demand_id, DemandStage.EXECUTING.value,
            allocation=allocation.model_dump(mode="json"),
        )
        await session.commit()
        await emit({"type": "pipeline.allocation",
                    "allocation": allocation.model_dump(mode="json")})

    # Executor stage — outside the session because it spans minutes/hours.
    store = get_store()
    orchestrator = Orchestrator(emit=emit, store=store)
    try:
        summary = await orchestrator.execute_project(
            project_id=public_id,
            prompt=prompt,
            tenant_id=str(tenant_id),
        )
    except Exception as exc:
        logger.exception("Executor failed")
        async with AsyncSessionLocal() as session:
            await DemandRepository(session).update_stage(
                demand_id, DemandStage.FAILED.value, error=str(exc),
            )
            await session.commit()
        await emit({"type": "pipeline.error", "message": str(exc)})
        return {"error": str(exc)}

    # Persist plan + artifacts metadata.
    async with AsyncSessionLocal() as session:
        await DemandRepository(session).update_stage(
            demand_id, DemandStage.EXPLAINING.value,
            executor_plan=summary["plan"],
            artifacts_prefix=summary["artifacts_prefix"],
        )
        await session.commit()

    explanation = await planner_pipeline.explain(
        understanding, decision, allocation,
        files_count=len(summary["files"]),
        rebalanced=False,
    )

    async with AsyncSessionLocal() as session:
        await DemandRepository(session).update_stage(
            demand_id,
            DemandStage.COMPLETED.value,
            explanation=explanation,
            completed_at=datetime.now(timezone.utc),
        )
        await session.commit()

    await emit({
        "type": "pipeline.completed",
        "explanation": explanation,
        "artifacts_prefix": summary["artifacts_prefix"],
        "files": [f["path"] for f in summary["files"]][:50],
    })
    return summary


async def enqueue_pipeline(redis_settings: RedisSettings, demand_id: str, tenant_id: str) -> None:
    from arq import create_pool

    pool = await create_pool(redis_settings)
    try:
        await pool.enqueue_job("run_full_pipeline", demand_id, tenant_id)
    finally:
        await pool.close()


class WorkerSettings:
    """Arq worker config — pointed at `app.queue.worker.WorkerSettings`."""

    functions = [run_full_pipeline]
    redis_settings = _redis_settings()
    job_timeout = 60 * 60  # 1 hour
    max_jobs = 4
    keep_result = 3600
