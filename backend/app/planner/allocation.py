"""Resource Allocation Engine — matches demand to a concrete team / agent mix."""

from __future__ import annotations

from app.schemas import (
    AllocatedResource,
    Complexity,
    DemandUnderstanding,
    ExecutionDecision,
    ExecutionMode,
    ResourceAllocation,
    ResourceType,
)


RESOURCE_POOL: list[dict] = [
    {"type": ResourceType.BACKEND_ENGINEER, "name": "Alex Chen", "skills": ["python", "api_development", "supabase", "sql"], "cost_per_day": 800},
    {"type": ResourceType.BACKEND_ENGINEER, "name": "Jordan Lee", "skills": ["python", "machine_learning", "data_science"], "cost_per_day": 850},
    {"type": ResourceType.FRONTEND_ENGINEER, "name": "Sam Rivera", "skills": ["react", "typescript", "visualization"], "cost_per_day": 750},
    {"type": ResourceType.FRONTEND_ENGINEER, "name": "Maya Iyer", "skills": ["react", "typescript", "tailwind", "ux"], "cost_per_day": 760},
    {"type": ResourceType.AI_ENGINEER, "name": "Dr. Priya Patel", "skills": ["nlp", "llm", "conversational_ai"], "cost_per_day": 1000},
    {"type": ResourceType.AI_ENGINEER, "name": "Marcus Johnson", "skills": ["machine_learning", "model_training", "python"], "cost_per_day": 950},
    {"type": ResourceType.DATA_ENGINEER, "name": "Lisa Wang", "skills": ["data_pipeline", "sql", "etl"], "cost_per_day": 800},
    {"type": ResourceType.CODE_GENERATOR_AGENT, "name": "Forge-FE", "skills": ["react", "typescript", "tailwind", "supabase"], "cost_per_day": 50},
    {"type": ResourceType.CODE_GENERATOR_AGENT, "name": "Forge-BE", "skills": ["python", "api_development", "sql", "supabase"], "cost_per_day": 50},
    {"type": ResourceType.AUTOMATION_AGENT, "name": "Forge-DevOps", "skills": ["devops", "docker", "ci_cd"], "cost_per_day": 45},
    {"type": ResourceType.DATA_ANALYST_AGENT, "name": "Forge-QA", "skills": ["testing", "review", "linting"], "cost_per_day": 35},
    {"type": ResourceType.CHATBOT_BUILDER_AGENT, "name": "Forge-Docs", "skills": ["documentation", "readme"], "cost_per_day": 30},
    {"type": ResourceType.PARTNER_VENDOR, "name": "TechPartner Solutions", "skills": ["enterprise", "compliance"], "cost_per_day": 1500},
]


def _is_agent(r: dict) -> bool:
    return "agent" in r["type"].value.lower()


def _is_human(r: dict) -> bool:
    return not _is_agent(r) and r["type"] != ResourceType.PARTNER_VENDOR


class AllocationEngine:
    def __init__(self) -> None:
        self.pool = RESOURCE_POOL

    def allocate(
        self,
        understanding: DemandUnderstanding,
        decision: ExecutionDecision,
    ) -> ResourceAllocation:
        required = set(understanding.required_skills)
        team: list[AllocatedResource]

        if decision.execution_mode == ExecutionMode.AI_AGENT:
            team = self._ai_team(required, understanding)
        elif decision.execution_mode == ExecutionMode.HUMAN_TEAM:
            team = self._human_team(required)
        elif decision.execution_mode == ExecutionMode.HYBRID:
            team = self._hybrid_team(required)
        else:
            team = self._reuse_team(required)

        total_cost = sum(r.cost_per_day * r.allocation_percentage for r in team)
        return ResourceAllocation(
            team=team,
            total_daily_cost=total_cost,
            allocation_reasoning=self._reasoning(team, decision, understanding),
        )

    def _ai_team(self, required: set, understanding: DemandUnderstanding) -> list[AllocatedResource]:
        team: list[AllocatedResource] = []
        for r in self.pool:
            if not _is_agent(r):
                continue
            match = required & set(r["skills"])
            if match or not required:
                team.append(self._as_alloc(r, 1.0, match or set(r["skills"][:2])))

        if understanding.complexity != Complexity.LOW:
            human = self._best_human(required)
            if human:
                team.append(self._as_alloc(human, 0.25, required & set(human["skills"])))
        return team or self._fallback()

    def _human_team(self, required: set) -> list[AllocatedResource]:
        team: list[AllocatedResource] = []
        covered: set = set()
        humans = [r for r in self.pool if _is_human(r)]
        humans.sort(key=lambda r: len(set(r["skills"]) & required), reverse=True)
        for r in humans:
            match = (set(r["skills"]) & required) - covered
            if not match:
                continue
            pct = max(0.5, min(1.0, len(match) / max(1, len(required))))
            team.append(self._as_alloc(r, pct, match))
            covered |= match
            if covered >= required:
                break
        return team or self._fallback()

    def _hybrid_team(self, required: set) -> list[AllocatedResource]:
        team = [
            self._as_alloc(r, 0.8, required & set(r["skills"]))
            for r in self.pool
            if _is_agent(r) and (required & set(r["skills"]))
        ]
        humans = sorted(
            (r for r in self.pool if _is_human(r)),
            key=lambda r: len(set(r["skills"]) & required),
            reverse=True,
        )[:2]
        for h in humans:
            team.append(self._as_alloc(h, 0.5, required & set(h["skills"])))
        return team or self._fallback()

    def _reuse_team(self, required: set) -> list[AllocatedResource]:
        team: list[AllocatedResource] = []
        human = self._best_human(required)
        if human:
            team.append(self._as_alloc(human, 0.5, required & set(human["skills"])))
        for r in self.pool:
            if _is_agent(r):
                team.append(self._as_alloc(r, 0.5, set(r["skills"][:2])))
                break
        return team or self._fallback()

    def _best_human(self, required: set) -> dict | None:
        humans = [r for r in self.pool if _is_human(r)]
        if not humans:
            return None
        return max(humans, key=lambda r: len(set(r["skills"]) & required))

    @staticmethod
    def _as_alloc(r: dict, pct: float, skills) -> AllocatedResource:
        return AllocatedResource(
            resource_type=r["type"],
            name=r["name"],
            allocation_percentage=pct,
            skills=sorted(skills),
            cost_per_day=r["cost_per_day"],
        )

    @staticmethod
    def _fallback() -> list[AllocatedResource]:
        return [
            AllocatedResource(
                resource_type=ResourceType.CODE_GENERATOR_AGENT,
                name="Forge-FE",
                allocation_percentage=1.0,
                skills=["react", "typescript"],
                cost_per_day=50,
            )
        ]

    @staticmethod
    def _reasoning(team, decision, understanding) -> str:
        humans = sum(1 for r in team if "agent" not in r.resource_type.value.lower())
        agents = len(team) - humans
        bits = [
            f"Allocated {len(team)} resources ({humans} human, {agents} AI)",
            f"for {decision.execution_mode.value} mode.",
            f"Skills covered: {', '.join(understanding.required_skills[:5])}.",
        ]
        if agents:
            bits.append(f"AI agents trim cost by ~{agents * 18}%.")
        return " ".join(bits)
