"""Decision Engine — picks the execution mode (AI agent, human, hybrid, reuse)."""

from __future__ import annotations

from app.config import settings
from app.llm import get_provider, model_router
from app.planner._jsonutil import extract_json
from app.schemas import (
    Complexity,
    DemandUnderstanding,
    ExecutionDecision,
    ExecutionMode,
    ProblemType,
    ProjectType,
    Urgency,
)


DECISION_PROMPT = """\
You are a senior delivery architect. Given the structured demand and a reuse score,
return a SINGLE JSON object selecting the best execution strategy.

Schema:
{{
  "execution_mode": one of [ai_agent, human_team, hybrid, reuse_existing],
  "project_type": one of [project, poc, hackathon, partner],
  "reasoning": string,
  "estimated_cost_usd": number,
  "estimated_time_days": integer,
  "confidence_score": number in [0,1],
  "risk_factors": [string, ...],
  "reuse_percentage": number in [0,1]
}}

Heuristics:
- reuse_score > 0.7 -> prefer reuse_existing
- complexity low -> prefer ai_agent
- complexity high + novel domain -> human_team or hybrid
- urgency high -> prefer hybrid over pure human team

Understanding: {understanding_json}
Reuse score: {reuse_score}
"""


class DecisionEngine:
    async def decide(
        self,
        understanding: DemandUnderstanding,
        reuse_score: float = 0.0,
    ) -> ExecutionDecision:
        if settings.demo_mode:
            return self._rule_based(understanding, reuse_score)
        try:
            return await self._llm_decide(understanding, reuse_score)
        except Exception:
            return self._rule_based(understanding, reuse_score)

    async def _llm_decide(
        self,
        understanding: DemandUnderstanding,
        reuse_score: float,
    ) -> ExecutionDecision:
        routed = model_router.resolve("decision")
        provider = get_provider(routed.provider)
        text = await provider.chat(
            [
                {"role": "system", "content": "Return ONLY a valid JSON object."},
                {
                    "role": "user",
                    "content": DECISION_PROMPT.format(
                        understanding_json=understanding.model_dump_json(),
                        reuse_score=reuse_score,
                    ),
                },
            ],
            model=routed.model,
            temperature=0.25,
            max_tokens=1024,
        )
        data = extract_json(text)
        if not data:
            return self._rule_based(understanding, reuse_score)
        try:
            return ExecutionDecision(**data)
        except Exception:
            return self._rule_based(understanding, reuse_score)

    # ── Deterministic fallback ──────────────────────────────────────────

    def _rule_based(
        self,
        understanding: DemandUnderstanding,
        reuse_score: float,
    ) -> ExecutionDecision:
        if reuse_score > 0.7:
            return self._reuse_decision(understanding, reuse_score)

        if understanding.complexity == Complexity.LOW:
            mode = ExecutionMode.AI_AGENT
            reasoning = "Low complexity; AI agent execution is sufficient."
        elif understanding.complexity == Complexity.MEDIUM:
            mode = ExecutionMode.HYBRID
            reasoning = "Medium complexity — AI agents with human review."
        else:
            mode = ExecutionMode.HUMAN_TEAM
            reasoning = "High complexity requires senior human team."

        if (
            understanding.problem_type in (ProblemType.WEB_APP, ProblemType.CHATBOT)
            and understanding.complexity != Complexity.HIGH
        ):
            mode = ExecutionMode.AI_AGENT
            reasoning = "Standard web/chatbot patterns map cleanly to AI agents."

        if understanding.urgency == Urgency.HIGH and mode == ExecutionMode.HUMAN_TEAM:
            mode = ExecutionMode.HYBRID
            reasoning += " Upgraded to hybrid due to urgency."

        if reuse_score > 0.4:
            reasoning += f" Plus {int(reuse_score * 100)}% reuse from prior projects."

        return ExecutionDecision(
            execution_mode=mode,
            project_type=self._project_type(understanding),
            reasoning=reasoning,
            estimated_cost_usd=self._cost(understanding, mode),
            estimated_time_days=self._time(understanding, mode, reuse_score),
            confidence_score=self._confidence(understanding, reuse_score),
            risk_factors=self._risks(understanding, mode),
            reuse_percentage=reuse_score,
        )

    @staticmethod
    def _reuse_decision(understanding, reuse_score) -> ExecutionDecision:
        return ExecutionDecision(
            execution_mode=ExecutionMode.REUSE_EXISTING,
            project_type=ProjectType.POC,
            reasoning=(
                f"High similarity ({int(reuse_score*100)}%) to an existing project. "
                f"Fork-and-customize cuts cost ~{int(reuse_score*50)}%."
            ),
            estimated_cost_usd=200 * understanding.estimated_scope_days * (1 - reuse_score * 0.5),
            estimated_time_days=max(3, int(understanding.estimated_scope_days * (1 - reuse_score * 0.6))),
            confidence_score=min(0.95, reuse_score + 0.1),
            risk_factors=["Customization may surface gaps", "Existing solution may be stale"],
            reuse_percentage=reuse_score,
        )

    @staticmethod
    def _project_type(understanding) -> ProjectType:
        if understanding.estimated_scope_days <= 7:
            return ProjectType.HACKATHON
        if understanding.estimated_scope_days <= 21:
            return ProjectType.POC
        if understanding.complexity == Complexity.HIGH:
            return ProjectType.PROJECT
        return ProjectType.POC

    @staticmethod
    def _cost(understanding, mode) -> float:
        rate = {
            ExecutionMode.AI_AGENT: 200,
            ExecutionMode.HUMAN_TEAM: 2000,
            ExecutionMode.HYBRID: 1200,
            ExecutionMode.REUSE_EXISTING: 500,
        }[mode]
        return rate * understanding.estimated_scope_days

    @staticmethod
    def _time(understanding, mode, reuse_score) -> int:
        mult = {
            ExecutionMode.AI_AGENT: 0.4,
            ExecutionMode.HUMAN_TEAM: 1.0,
            ExecutionMode.HYBRID: 0.7,
            ExecutionMode.REUSE_EXISTING: 0.3,
        }[mode]
        adjusted = understanding.estimated_scope_days * mult * (1 - reuse_score * 0.3)
        return max(2, int(adjusted))

    @staticmethod
    def _confidence(understanding, reuse_score) -> float:
        base = 0.7
        if understanding.complexity == Complexity.LOW:
            base += 0.15
        elif understanding.complexity == Complexity.HIGH:
            base -= 0.15
        return min(0.95, max(0.3, base + reuse_score * 0.1))

    @staticmethod
    def _risks(understanding, mode) -> list[str]:
        out: list[str] = []
        if understanding.complexity == Complexity.HIGH:
            out.append("High complexity risks scope creep")
        if understanding.urgency == Urgency.HIGH:
            out.append("Tight timeline pressure")
        if mode == ExecutionMode.AI_AGENT:
            out.append("AI agent outputs may need human review for edge cases")
        if len(understanding.required_skills) > 5:
            out.append("Wide skill surface may bottleneck delivery")
        return out or ["Standard delivery risk"]
