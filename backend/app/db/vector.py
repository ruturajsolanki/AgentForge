"""Reuse detector — Postgres + pgvector replacement for Vultron's in-memory Chroma."""

from __future__ import annotations

import uuid
from typing import Optional

from sqlalchemy.ext.asyncio import AsyncSession

from app.db.repositories import EmbeddingRepository, PastProjectRepository
from app.llm import get_provider, model_router


class ReuseDetector:
    """Embeds the incoming demand, then runs an HNSW kNN search over
    `past_projects.embedding`. Returns the top-K matches with similarity."""

    def __init__(self, session: AsyncSession) -> None:
        self.session = session
        self.past_repo = PastProjectRepository(session)
        self.embed_repo = EmbeddingRepository(session)

    async def find_similar(
        self,
        *,
        tenant_id: uuid.UUID,
        demand_text: str,
        top_k: int = 3,
    ) -> tuple[float, list[dict]]:
        """Return (best_similarity, [matches])."""
        try:
            routed = model_router.resolve("embed")
            provider = get_provider(routed.provider)
            embedding = await provider.embed(demand_text, model=routed.model)
        except Exception:
            embedding = []

        if not embedding:
            return await self._keyword_fallback(tenant_id, demand_text, top_k)

        matches = await self.past_repo.similar(
            tenant_id=tenant_id, embedding=embedding, limit=top_k
        )

        if not matches:
            return 0.0, []

        out: list[dict] = []
        for project, distance in matches:
            similarity = max(0.0, 1.0 - distance)
            out.append({
                "project_id": project.public_id,
                "description": project.description,
                "similarity": round(similarity, 3),
                "domain": project.domain,
                "problem_type": project.problem_type,
                "reuse_components": project.reuse_components or [],
            })

        best = out[0]["similarity"] if out else 0.0
        return best, out

    async def _keyword_fallback(
        self,
        tenant_id: uuid.UUID,
        demand_text: str,
        top_k: int,
    ) -> tuple[float, list[dict]]:
        from sqlalchemy import select

        from app.db.models import PastProject

        stmt = select(PastProject).where(PastProject.tenant_id == tenant_id)
        rows = list((await self.session.execute(stmt)).scalars())
        if not rows:
            return 0.0, []

        words = {w for w in demand_text.lower().split() if len(w) > 2}
        scored: list[dict] = []
        for p in rows:
            proj_words = {w for w in p.description.lower().split() if len(w) > 2}
            inter = words & proj_words
            union = words | proj_words
            sim = (len(inter) / max(1, len(union))) if union else 0.0
            if p.domain in demand_text.lower():
                sim += 0.15
            if p.problem_type in demand_text.lower():
                sim += 0.15
            sim = min(1.0, sim)
            scored.append({
                "project_id": p.public_id,
                "description": p.description,
                "similarity": round(sim, 3),
                "domain": p.domain,
                "problem_type": p.problem_type,
                "reuse_components": p.reuse_components or [],
            })
        scored.sort(key=lambda x: x["similarity"], reverse=True)
        scored = scored[:top_k]
        return (scored[0]["similarity"] if scored else 0.0), scored
