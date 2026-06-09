"""Planner pipeline — chains Vultron's brain steps together. Stops at
"awaiting approval" or hands off to the AgentForge executor depending on mode.
"""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Optional

from app.planner.allocation import AllocationEngine
from app.planner.clarification import ClarificationEngine
from app.planner.decision import DecisionEngine
from app.planner.explanation import ExplanationEngine
from app.planner.ingestion import DemandIngestion
from app.planner.monitoring import MonitoringEngine
from app.planner.understanding import UnderstandingEngine
from app.schemas import (
    DemandStage,
    DemandUnderstanding,
    ExecutionDecision,
    ResourceAllocation,
)


class PlannerPipeline:
    """Stateless coordinator — each step persists into the snapshot stored by the caller."""

    def __init__(self) -> None:
        self.ingestion = DemandIngestion()
        self.understanding = UnderstandingEngine()
        self.clarification = ClarificationEngine()
        self.decision = DecisionEngine()
        self.allocation = AllocationEngine()
        self.monitoring = MonitoringEngine()
        self.explanation = ExplanationEngine()

    async def ingest(self, demand_text: str, source: str = "manual") -> dict:
        return self.ingestion.ingest(demand_text, source)

    async def clarify(self, demand_text: str) -> dict:
        return await self.clarification.generate_questions(demand_text)

    async def converse(
        self,
        demand_text: str,
        history: list[dict],
        latest_message: str,
    ) -> dict:
        return await self.clarification.converse(
            demand_text, history, latest_message
        )

    async def understand(self, demand_text: str) -> DemandUnderstanding:
        return await self.understanding.analyze(demand_text)

    async def decide(
        self, understanding: DemandUnderstanding, reuse_score: float
    ) -> ExecutionDecision:
        return await self.decision.decide(understanding, reuse_score)

    async def allocate(
        self,
        understanding: DemandUnderstanding,
        decision: ExecutionDecision,
    ) -> ResourceAllocation:
        return self.allocation.allocate(understanding, decision)

    async def augment_allocation(
        self,
        allocation: ResourceAllocation,
        tenant_id,
        session,
    ) -> ResourceAllocation:
        """Cross-reference the proposed team against the live `team_members`
        bench. When a recommended person is already committed to another active
        project we attach a 'should we move them?' signal with a probability
        (derived from skill fit) and an importance grade, so the manager can
        make an informed reallocation call.
        """
        from sqlalchemy import select

        from app.db.models import TeamMember

        rows = (
            await session.execute(
                select(TeamMember).where(TeamMember.tenant_id == tenant_id)
            )
        ).scalars().all()
        if not rows:
            return allocation

        by_name: dict[str, TeamMember] = {r.name.strip().lower(): r for r in rows}

        for resource in allocation.team:
            # AI agents / partners are never "moved" — only humans on the bench.
            if resource.seniority in {"agent", "partner"}:
                continue
            member = by_name.get(resource.name.strip().lower())
            if member is None:
                continue
            current = (member.current_project or "").strip()
            if not current or current.lower() in {"available", "bench", "none", "-"}:
                continue

            fit = max(0.0, min(1.0, resource.match_score / 6.0)) if resource.match_score else 0.5
            probability = round(min(0.97, 0.45 + fit * 0.5), 2)
            if probability >= 0.8:
                importance = "high"
            elif probability >= 0.6:
                importance = "medium"
            else:
                importance = "low"

            resource.currently_allocated_to = current
            resource.move_recommended = True
            resource.move_probability = probability
            resource.move_importance = importance
            resource.move_rationale = (
                f"{resource.name} is currently on '{current}'. Skill fit for this "
                f"demand is {probability:.0%} ({importance} importance). Moving them "
                f"would strengthen coverage of {', '.join(resource.skills[:3]) or 'core skills'}."
            )

        return allocation

    async def explain(
        self,
        understanding: DemandUnderstanding,
        decision: ExecutionDecision,
        allocation: ResourceAllocation,
        files_count: int,
        rebalanced: bool,
    ) -> str:
        return await self.explanation.generate(
            understanding, decision, allocation, files_count, rebalanced
        )

    @staticmethod
    def now() -> datetime:
        return datetime.now(timezone.utc)

    @staticmethod
    def stage_after(current: DemandStage) -> Optional[DemandStage]:
        flow = [
            DemandStage.INGESTED,
            DemandStage.UNDERSTANDING,
            DemandStage.DECIDING,
            DemandStage.ALLOCATING,
            DemandStage.AWAITING_APPROVAL,
            DemandStage.EXECUTING,
            DemandStage.MONITORING,
            DemandStage.EXPLAINING,
            DemandStage.COMPLETED,
        ]
        try:
            idx = flow.index(current)
            return flow[idx + 1] if idx + 1 < len(flow) else None
        except ValueError:
            return None


planner_pipeline = PlannerPipeline()
