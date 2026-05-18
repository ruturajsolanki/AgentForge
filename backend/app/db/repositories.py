"""Thin repositories — keep query/IO concerns out of the engines."""

from __future__ import annotations

import uuid
from typing import Optional

from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import (
    AgentRun,
    Artifact,
    DemandRequest,
    EmbeddingChunk,
    PastProject,
)


class DemandRepository:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    async def create(
        self,
        *,
        tenant_id: uuid.UUID,
        public_id: str,
        raw_text: str,
        source: str = "manual",
        created_by: Optional[uuid.UUID] = None,
    ) -> DemandRequest:
        demand = DemandRequest(
            tenant_id=tenant_id,
            public_id=public_id,
            raw_text=raw_text,
            source=source,
            created_by=created_by,
        )
        self.session.add(demand)
        await self.session.flush()
        return demand

    async def update_stage(self, demand_id: uuid.UUID, stage: str, **fields) -> None:
        await self.session.execute(
            update(DemandRequest)
            .where(DemandRequest.id == demand_id)
            .values(stage=stage, **fields)
        )

    async def get_by_public_id(
        self, tenant_id: uuid.UUID, public_id: str
    ) -> Optional[DemandRequest]:
        stmt = select(DemandRequest).where(
            DemandRequest.tenant_id == tenant_id,
            DemandRequest.public_id == public_id,
        )
        return (await self.session.execute(stmt)).scalar_one_or_none()

    async def list_recent(self, tenant_id: uuid.UUID, limit: int = 50) -> list[DemandRequest]:
        stmt = (
            select(DemandRequest)
            .where(DemandRequest.tenant_id == tenant_id)
            .order_by(DemandRequest.created_at.desc())
            .limit(limit)
        )
        return list((await self.session.execute(stmt)).scalars())


class AgentRunRepository:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    async def create(
        self,
        *,
        tenant_id: uuid.UUID,
        demand_id: uuid.UUID,
        agent_id: str,
        task_title: str,
        model_used: Optional[str] = None,
    ) -> AgentRun:
        run = AgentRun(
            tenant_id=tenant_id,
            demand_id=demand_id,
            agent_id=agent_id,
            task_title=task_title,
            model_used=model_used,
        )
        self.session.add(run)
        await self.session.flush()
        return run

    async def update(self, run_id: uuid.UUID, **fields) -> None:
        await self.session.execute(
            update(AgentRun).where(AgentRun.id == run_id).values(**fields)
        )

    async def list_for_demand(self, demand_id: uuid.UUID) -> list[AgentRun]:
        stmt = (
            select(AgentRun)
            .where(AgentRun.demand_id == demand_id)
            .order_by(AgentRun.created_at.asc())
        )
        return list((await self.session.execute(stmt)).scalars())


class ArtifactRepository:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    async def add_many(self, artifacts: list[Artifact]) -> None:
        self.session.add_all(artifacts)
        await self.session.flush()

    async def list_for_demand(self, demand_id: uuid.UUID) -> list[Artifact]:
        stmt = (
            select(Artifact)
            .where(Artifact.demand_id == demand_id)
            .order_by(Artifact.path.asc())
        )
        return list((await self.session.execute(stmt)).scalars())


class EmbeddingRepository:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    async def add(
        self,
        *,
        tenant_id: uuid.UUID,
        source_kind: str,
        text: str,
        embedding: list[float],
        source_id: Optional[str] = None,
        meta: Optional[dict] = None,
    ) -> EmbeddingChunk:
        chunk = EmbeddingChunk(
            tenant_id=tenant_id,
            source_kind=source_kind,
            text=text,
            embedding=embedding,
            source_id=source_id,
            meta=meta or {},
        )
        self.session.add(chunk)
        await self.session.flush()
        return chunk

    async def similar(
        self,
        *,
        tenant_id: uuid.UUID,
        embedding: list[float],
        source_kind: Optional[str] = None,
        limit: int = 5,
    ) -> list[tuple[EmbeddingChunk, float]]:
        """Return (chunk, distance) ordered by cosine distance ascending."""
        distance = EmbeddingChunk.embedding.cosine_distance(embedding).label("distance")
        stmt = (
            select(EmbeddingChunk, distance)
            .where(EmbeddingChunk.tenant_id == tenant_id)
        )
        if source_kind:
            stmt = stmt.where(EmbeddingChunk.source_kind == source_kind)
        stmt = stmt.order_by("distance").limit(limit)
        result = await self.session.execute(stmt)
        return [(row[0], float(row[1])) for row in result.all()]


class PastProjectRepository:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    async def add(self, project: PastProject) -> PastProject:
        self.session.add(project)
        await self.session.flush()
        return project

    async def similar(
        self,
        *,
        tenant_id: uuid.UUID,
        embedding: list[float],
        limit: int = 5,
    ) -> list[tuple[PastProject, float]]:
        distance = PastProject.embedding.cosine_distance(embedding).label("distance")
        stmt = (
            select(PastProject, distance)
            .where(PastProject.tenant_id == tenant_id)
            .where(PastProject.embedding.is_not(None))
            .order_by("distance")
            .limit(limit)
        )
        result = await self.session.execute(stmt)
        return [(row[0], float(row[1])) for row in result.all()]
