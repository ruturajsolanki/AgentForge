"""Planner pipeline — chains Vultron's brain steps together. Stops at
"awaiting approval" or hands off to the AgentForge executor depending on mode.
"""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Optional

from app.planner.allocation import AllocationEngine
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
        self.decision = DecisionEngine()
        self.allocation = AllocationEngine()
        self.monitoring = MonitoringEngine()
        self.explanation = ExplanationEngine()

    async def ingest(self, demand_text: str, source: str = "manual") -> dict:
        return self.ingestion.ingest(demand_text, source)

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
