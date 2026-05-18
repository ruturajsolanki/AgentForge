"""Explanation Layer — human-readable narrative of the entire pipeline."""

from __future__ import annotations

from app.config import settings
from app.llm import get_provider, model_router
from app.schemas import (
    DemandUnderstanding,
    ExecutionDecision,
    ExecutionMode,
    ResourceAllocation,
)


EXPLANATION_PROMPT = """\
Briefly explain (3-4 sentences, plain language) why the chosen execution
strategy was picked, what was built, and the expected outcome.

Demand summary: {summary}
Execution mode: {mode}
Confidence: {confidence}
Team size: {team_size}
Cost: ${cost:,.0f}
Time: {time} days
Rebalanced: {rebalanced}
Files generated: {files_count}
"""


class ExplanationEngine:
    async def generate(
        self,
        understanding: DemandUnderstanding,
        decision: ExecutionDecision,
        allocation: ResourceAllocation,
        files_count: int,
        rebalanced: bool,
    ) -> str:
        if settings.demo_mode:
            return self._fallback(understanding, decision, allocation, files_count, rebalanced)
        try:
            return await self._llm(understanding, decision, allocation, files_count, rebalanced)
        except Exception:
            return self._fallback(understanding, decision, allocation, files_count, rebalanced)

    async def _llm(
        self,
        understanding: DemandUnderstanding,
        decision: ExecutionDecision,
        allocation: ResourceAllocation,
        files_count: int,
        rebalanced: bool,
    ) -> str:
        routed = model_router.resolve("explanation")
        provider = get_provider(routed.provider)
        return await provider.chat(
            [
                {"role": "system", "content": "You explain AI system decisions clearly and concisely."},
                {
                    "role": "user",
                    "content": EXPLANATION_PROMPT.format(
                        summary=understanding.summary,
                        mode=decision.execution_mode.value,
                        confidence=f"{decision.confidence_score:.0%}",
                        team_size=len(allocation.team),
                        cost=decision.estimated_cost_usd,
                        time=decision.estimated_time_days,
                        rebalanced="Yes" if rebalanced else "No",
                        files_count=files_count,
                    ),
                },
            ],
            model=routed.model,
            temperature=0.4,
            max_tokens=512,
        )

    @staticmethod
    def _fallback(
        understanding: DemandUnderstanding,
        decision: ExecutionDecision,
        allocation: ResourceAllocation,
        files_count: int,
        rebalanced: bool,
    ) -> str:
        agents = sum(1 for r in allocation.team if "agent" in r.resource_type.value.lower())
        humans = len(allocation.team) - agents
        why = {
            ExecutionMode.AI_AGENT: (
                f"Picked AI agent execution because the {understanding.problem_type.value} is "
                f"{understanding.complexity.value} complexity with established patterns. "
                f"This cut delivery from {understanding.estimated_scope_days} days to "
                f"{decision.estimated_time_days} days."
            ),
            ExecutionMode.HUMAN_TEAM: (
                f"Routed to a human team because the {understanding.complexity.value}-complexity "
                f"{understanding.domain.value} brief needs experienced judgment."
            ),
            ExecutionMode.HYBRID: (
                f"Hybrid mode: AI agents handle the routine parts of this "
                f"{understanding.problem_type.value}, human specialists own the tricky bits."
            ),
            ExecutionMode.REUSE_EXISTING: (
                f"Reused {int(decision.reuse_percentage * 100)}% of a similar past project, "
                f"saving ~{int(decision.reuse_percentage * 50)}% cost."
            ),
        }[decision.execution_mode]

        bits = [
            why,
            f"Team: {len(allocation.team)} resources ({humans} human, {agents} AI). "
            f"Daily burn ${allocation.total_daily_cost:,.0f}, total budget "
            f"${decision.estimated_cost_usd:,.0f} over {decision.estimated_time_days} days.",
            f"Confidence: {decision.confidence_score:.0%}. Generated {files_count} files.",
        ]
        if rebalanced:
            bits.append("Monitoring detected an issue during execution and rebalanced automatically.")
        return "\n\n".join(bits)
