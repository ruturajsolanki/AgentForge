"""Resource Allocation Engine — selects a team from a 50-person delivery bench."""

from __future__ import annotations

from app.schemas import (
    AllocatedResource,
    Complexity,
    DemandUnderstanding,
    ExecutionDecision,
    ExecutionMode,
    ProblemType,
    ResourceAllocation,
    ResourceType,
)


def _person(
    name: str,
    resource_type: ResourceType,
    title: str,
    skills: list[str],
    cost_per_day: float,
    seniority: str = "senior",
) -> dict:
    return {
        "name": name,
        "type": resource_type,
        "title": title,
        "skills": skills,
        "cost_per_day": cost_per_day,
        "seniority": seniority,
    }


RESOURCE_POOL: list[dict] = [
    _person("Aarav Mehta", ResourceType.PRODUCT_MANAGER, "AI Delivery Lead", ["project_management", "scope", "stakeholder_management", "delivery_planning"], 950, "principal"),
    _person("Maya Iyer", ResourceType.PRODUCT_MANAGER, "Product Strategist", ["product_strategy", "roadmap", "requirements", "ux"], 900),
    _person("Rohan Kapoor", ResourceType.BUSINESS_ANALYST, "Business Analyst", ["requirements", "process_mapping", "sales_ops", "crm"], 720),
    _person("Priya Nair", ResourceType.SOLUTION_ARCHITECT, "Solution Architect", ["architecture", "system_design", "api_integration", "scalability"], 1200, "principal"),
    _person("Elena Rossi", ResourceType.SOLUTION_ARCHITECT, "Enterprise Architect", ["enterprise", "compliance", "architecture", "security"], 1300, "principal"),
    _person("Sam Rivera", ResourceType.FRONTEND_ENGINEER, "React Frontend Engineer", ["react", "typescript", "tailwind", "visualization"], 760),
    _person("Nora Shah", ResourceType.FRONTEND_ENGINEER, "Design Systems Engineer", ["react", "typescript", "design_system", "accessibility"], 790),
    _person("Liam Chen", ResourceType.FRONTEND_ENGINEER, "Dashboard Engineer", ["react", "analytics", "charts", "realtime_updates"], 780),
    _person("Isha Kulkarni", ResourceType.FRONTEND_ENGINEER, "UX Frontend Engineer", ["react", "ux", "forms", "workflow"], 740),
    _person("Mateo Garcia", ResourceType.UX_DESIGNER, "Product Designer", ["ux", "wireframes", "prototyping", "accessibility"], 700),
    _person("Anika Bose", ResourceType.UX_DESIGNER, "Research Designer", ["user_research", "journey_mapping", "ux", "adoption"], 680),
    _person("Alex Chen", ResourceType.BACKEND_ENGINEER, "Backend API Engineer", ["python", "api_development", "supabase", "sql"], 820),
    _person("Jordan Lee", ResourceType.BACKEND_ENGINEER, "Platform Engineer", ["python", "system_design", "api_integration", "auth"], 860),
    _person("Fatima Khan", ResourceType.BACKEND_ENGINEER, "Data API Engineer", ["python", "sql", "etl", "data_pipeline"], 830),
    _person("Owen Brooks", ResourceType.BACKEND_ENGINEER, "Integrations Engineer", ["api_integration", "webhooks", "crm", "automation"], 790),
    _person("Nikhil Rao", ResourceType.BACKEND_ENGINEER, "Supabase Engineer", ["supabase", "postgres", "rls", "auth"], 780),
    _person("Dr. Priya Patel", ResourceType.AI_ENGINEER, "LLM Engineer", ["llm", "nlp", "conversational_ai", "rag"], 1050, "principal"),
    _person("Marcus Johnson", ResourceType.AI_ENGINEER, "ML Engineer", ["machine_learning", "python", "model_training", "data_science"], 980),
    _person("Yuki Tanaka", ResourceType.AI_ENGINEER, "AI Workflow Engineer", ["agents", "automation", "llm", "tool_use"], 990),
    _person("Sofia Martins", ResourceType.AI_ENGINEER, "Recommendation Engineer", ["recommendation", "ranking", "analytics", "machine_learning"], 970),
    _person("Lisa Wang", ResourceType.DATA_ENGINEER, "Data Engineer", ["data_pipeline", "sql", "etl", "warehouse"], 830),
    _person("Daniel Kim", ResourceType.DATA_ENGINEER, "Analytics Engineer", ["analytics", "dbt", "sql", "visualization"], 800),
    _person("Harper Singh", ResourceType.DATA_ENGINEER, "Streaming Data Engineer", ["realtime_updates", "events", "data_pipeline", "monitoring"], 850),
    _person("Grace Miller", ResourceType.QA_ENGINEER, "QA Automation Engineer", ["testing", "e2e", "playwright", "regression"], 680),
    _person("Vikram Desai", ResourceType.QA_ENGINEER, "Test Strategy Lead", ["qa", "test_strategy", "acceptance_criteria", "review"], 730),
    _person("Amara Okafor", ResourceType.SECURITY_ENGINEER, "Application Security Engineer", ["security", "auth", "compliance", "threat_modeling"], 920),
    _person("Noah Evans", ResourceType.SECURITY_ENGINEER, "Cloud Security Engineer", ["security", "devops", "secrets", "audit"], 910),
    _person("Ethan Wright", ResourceType.DEVOPS_ENGINEER, "DevOps Engineer", ["devops", "docker", "ci_cd", "deployment"], 840),
    _person("Zara Ali", ResourceType.DEVOPS_ENGINEER, "Reliability Engineer", ["monitoring", "observability", "scalability", "incident_response"], 880),
    _person("Mei Chen", ResourceType.TECH_WRITER, "Technical Writer", ["documentation", "readme", "developer_experience", "runbooks"], 610),
    _person("Irene Adler", ResourceType.CRM_SPECIALIST, "CRM Consultant", ["crm", "salesforce", "zoho", "pipeline_management"], 780),
    _person("Karan Malhotra", ResourceType.SALES_OPS_ANALYST, "Sales Ops Analyst", ["sales_ops", "forecasting", "target_tracking", "dashboard"], 700),
    _person("Olivia Stone", ResourceType.SALES_OPS_ANALYST, "Revenue Operations Analyst", ["revenue_ops", "crm", "analytics", "escalation"], 720),
    _person("Forge-PM", ResourceType.AUTOMATION_AGENT, "AI Planning Agent", ["project_management", "requirements", "task_planning"], 55, "agent"),
    _person("Forge-FE", ResourceType.CODE_GENERATOR_AGENT, "AI Frontend Agent", ["react", "typescript", "tailwind", "ux"], 50, "agent"),
    _person("Forge-BE", ResourceType.CODE_GENERATOR_AGENT, "AI Backend Agent", ["python", "api_development", "sql", "supabase"], 50, "agent"),
    _person("Forge-Data", ResourceType.DATA_ANALYST_AGENT, "AI Data Agent", ["analytics", "sql", "visualization", "data_pipeline"], 45, "agent"),
    _person("Forge-DevOps", ResourceType.AUTOMATION_AGENT, "AI DevOps Agent", ["devops", "docker", "ci_cd", "deployment"], 45, "agent"),
    _person("Forge-QA", ResourceType.QA_AGENT, "AI QA Agent", ["testing", "review", "linting", "e2e"], 35, "agent"),
    _person("Forge-Sec", ResourceType.SECURITY_AGENT, "AI Security Agent", ["security", "auth", "threat_modeling", "compliance"], 40, "agent"),
    _person("Forge-Docs", ResourceType.CHATBOT_BUILDER_AGENT, "AI Documentation Agent", ["documentation", "readme", "runbooks"], 30, "agent"),
    _person("Forge-UX", ResourceType.DESIGN_AGENT, "AI UX Agent", ["ux", "wireframes", "design_system", "accessibility"], 35, "agent"),
    _person("Forge-RAG", ResourceType.CHATBOT_BUILDER_AGENT, "AI RAG Agent", ["rag", "llm", "retrieval", "knowledge_base"], 45, "agent"),
    _person("Forge-Integrations", ResourceType.AUTOMATION_AGENT, "AI Integration Agent", ["api_integration", "webhooks", "automation", "crm"], 45, "agent"),
    _person("Forge-Analytics", ResourceType.DATA_ANALYST_AGENT, "AI Analytics Agent", ["analytics", "dashboard", "visualization", "forecasting"], 40, "agent"),
    _person("TechPartner Solutions", ResourceType.PARTNER_VENDOR, "Enterprise Delivery Partner", ["enterprise", "compliance", "migration", "security"], 1500, "partner"),
    _person("CloudScale Labs", ResourceType.PARTNER_VENDOR, "Cloud Partner", ["cloud", "devops", "scalability", "deployment"], 1400, "partner"),
    _person("DataBridge Partners", ResourceType.PARTNER_VENDOR, "Data Partner", ["data_pipeline", "etl", "warehouse", "analytics"], 1350, "partner"),
    _person("SecureWorks Studio", ResourceType.PARTNER_VENDOR, "Security Partner", ["security", "audit", "compliance", "penetration_testing"], 1450, "partner"),
    _person("DesignOps Collective", ResourceType.PARTNER_VENDOR, "UX Partner", ["ux", "research", "design_system", "accessibility"], 1250, "partner"),
]


# Trainers (upskill the delivery team) and AI-learners (shadow the project to
# collect training data). These are not auto-allocated — a manager adds them
# to a plan via the team-edit endpoint.
ADDABLE_EXTRAS: list[dict] = [
    _person("Ananya Reddy", ResourceType.TRAINER, "Delivery Coach", ["mentoring", "delivery_planning", "review"], 600, "trainer"),
    _person("Tom Becker", ResourceType.TRAINER, "Engineering Trainer", ["react", "python", "mentoring", "code_review"], 640, "trainer"),
    _person("Forge-Learner-1", ResourceType.AI_LEARNER, "AI Learner (shadow)", ["observation", "training_data", "automation"], 15, "learner"),
    _person("Forge-Learner-2", ResourceType.AI_LEARNER, "AI Learner (eval)", ["observation", "evaluation", "qa"], 15, "learner"),
]


def addable_catalog() -> list[dict]:
    """Resources a manager may add to a plan: bench humans + trainers + learners."""
    out: list[dict] = []
    for r in RESOURCE_POOL:
        kind = "member"
        if r["seniority"] == "agent":
            kind = "member"
        out.append({
            "name": r["name"],
            "title": r["title"],
            "resource_type": r["type"].value,
            "seniority": r["seniority"],
            "skills": r["skills"],
            "cost_per_day": r["cost_per_day"],
            "kind": kind,
        })
    for r in ADDABLE_EXTRAS:
        out.append({
            "name": r["name"],
            "title": r["title"],
            "resource_type": r["type"].value,
            "seniority": r["seniority"],
            "skills": r["skills"],
            "cost_per_day": r["cost_per_day"],
            "kind": "trainer" if r["seniority"] == "trainer" else "learner",
        })
    return out


def _is_agent(r: dict) -> bool:
    return r["seniority"] == "agent" or "agent" in r["type"].value.lower()


def _is_human(r: dict) -> bool:
    return r["seniority"] not in {"agent", "partner"} and r["type"] != ResourceType.PARTNER_VENDOR


def _expanded_required_skills(understanding: DemandUnderstanding) -> set[str]:
    required = set(understanding.required_skills)
    required |= {"requirements", "project_management", "qa", "testing", "documentation"}

    by_type = {
        ProblemType.WEB_APP: {"react", "typescript", "ux", "api_development"},
        ProblemType.CHATBOT: {"llm", "nlp", "conversational_ai", "rag"},
        ProblemType.ANALYTICS: {"analytics", "sql", "visualization", "dashboard"},
        ProblemType.AUTOMATION: {"workflow", "automation", "api_integration"},
        ProblemType.ML_MODEL: {"machine_learning", "python", "data_science"},
        ProblemType.DATA_PIPELINE: {"data_pipeline", "etl", "sql"},
        ProblemType.INTEGRATION: {"api_integration", "webhooks", "auth"},
        ProblemType.OTHER: {"architecture", "requirements"},
    }
    required |= by_type.get(understanding.problem_type, set())

    feature_skills = {
        "authentication": {"auth", "security"},
        "dashboard": {"analytics", "visualization"},
        "chat_interface": {"llm", "ux"},
        "file_upload": {"storage", "security"},
        "realtime_updates": {"realtime_updates", "events"},
        "crud": {"api_development", "sql"},
    }
    for feature in understanding.key_features:
        required |= feature_skills.get(feature, set())

    if understanding.complexity != Complexity.LOW:
        required |= {"architecture", "security", "monitoring"}
    if understanding.complexity == Complexity.HIGH:
        required |= {"scalability", "compliance", "observability"}
    return required


class AllocationEngine:
    def __init__(self) -> None:
        self.pool = RESOURCE_POOL

    def allocate(
        self,
        understanding: DemandUnderstanding,
        decision: ExecutionDecision,
    ) -> ResourceAllocation:
        required = _expanded_required_skills(understanding)

        if decision.execution_mode == ExecutionMode.AI_AGENT:
            team = self._ai_team(required, understanding)
        elif decision.execution_mode == ExecutionMode.HUMAN_TEAM:
            team = self._human_team(required, understanding)
        elif decision.execution_mode == ExecutionMode.HYBRID:
            team = self._hybrid_team(required, understanding)
        else:
            team = self._reuse_team(required, understanding)

        covered = set().union(*(set(r.skills) for r in team)) if team else set()
        uncovered = sorted(s for s in required - covered if s not in {"qa"})
        coverage = 1.0 if not required else min(1.0, len(required & covered) / len(required))
        total_cost = sum(r.cost_per_day * r.allocation_percentage for r in team)
        return ResourceAllocation(
            team=team,
            total_daily_cost=round(total_cost, 2),
            allocation_reasoning=self._reasoning(team, decision, understanding, coverage),
            bench_size=len(self.pool),
            coverage_score=round(coverage, 3),
            uncovered_skills=uncovered[:8],
        )

    def _ai_team(self, required: set[str], understanding: DemandUnderstanding) -> list[AllocatedResource]:
        target = 5 if understanding.complexity == Complexity.LOW else 7
        agents = self._rank(required, [r for r in self.pool if _is_agent(r)])
        team = self._cover(required, agents, target)
        if understanding.complexity != Complexity.LOW:
            humans = self._rank(required, [r for r in self.pool if _is_human(r)])
            team.extend(self._cover(required - self._covered(team), humans, 2, pct=0.35))
        return team or self._fallback()

    def _human_team(self, required: set[str], understanding: DemandUnderstanding) -> list[AllocatedResource]:
        target = 8 if understanding.complexity != Complexity.HIGH else 11
        humans = self._rank(required, [r for r in self.pool if _is_human(r)])
        team = self._cover(required, humans, target, pct=0.75)
        if understanding.complexity == Complexity.HIGH:
            partners = self._rank(required - self._covered(team), [r for r in self.pool if r["type"] == ResourceType.PARTNER_VENDOR])
            team.extend(self._cover(required - self._covered(team), partners, 1, pct=0.35))
        return team or self._fallback()

    def _hybrid_team(self, required: set[str], understanding: DemandUnderstanding) -> list[AllocatedResource]:
        agent_target = 5 if understanding.complexity != Complexity.HIGH else 6
        human_target = 4 if understanding.complexity != Complexity.HIGH else 6
        agents = self._cover(required, self._rank(required, [r for r in self.pool if _is_agent(r)]), agent_target, pct=0.8)
        humans = self._cover(required - self._covered(agents), self._rank(required, [r for r in self.pool if _is_human(r)]), human_target, pct=0.5)
        return agents + humans or self._fallback()

    def _reuse_team(self, required: set[str], understanding: DemandUnderstanding) -> list[AllocatedResource]:
        reuse_skills = required | {"architecture", "review", "documentation"}
        candidates = self._rank(reuse_skills, self.pool)
        return self._cover(reuse_skills, candidates, 5, pct=0.5) or self._fallback()

    @staticmethod
    def _score(required: set[str], resource: dict) -> tuple[float, set[str]]:
        skills = set(resource["skills"])
        match = required & skills
        breadth = min(0.2, len(skills) / 30)
        seniority_bonus = {"principal": 0.2, "senior": 0.12, "agent": 0.08, "partner": 0.05}.get(resource["seniority"], 0.0)
        score = len(match) + breadth + seniority_bonus
        return score, match

    def _rank(self, required: set[str], resources: list[dict]) -> list[tuple[dict, float, set[str]]]:
        ranked = []
        for r in resources:
            score, match = self._score(required, r)
            if score > 0.25:
                ranked.append((r, score, match))
        ranked.sort(key=lambda item: (item[1], -item[0]["cost_per_day"]), reverse=True)
        return ranked

    def _cover(
        self,
        required: set[str],
        ranked: list[tuple[dict, float, set[str]]],
        limit: int,
        pct: float = 1.0,
    ) -> list[AllocatedResource]:
        team: list[AllocatedResource] = []
        covered: set[str] = set()
        for resource, score, match in ranked:
            new_match = match - covered
            if not new_match and len(team) >= max(2, limit // 2):
                continue
            allocation_pct = min(1.0, max(0.25, pct if _is_human(resource) else pct))
            team.append(self._as_alloc(resource, allocation_pct, match or set(resource["skills"][:2]), score))
            covered |= match
            if len(team) >= limit or covered >= required:
                break
        return team

    @staticmethod
    def _covered(team: list[AllocatedResource]) -> set[str]:
        covered: set[str] = set()
        for resource in team:
            covered |= set(resource.skills)
        return covered

    @staticmethod
    def _as_alloc(r: dict, pct: float, skills, score: float = 0.0) -> AllocatedResource:
        matched = sorted(skills)
        reason = f"Matches {', '.join(matched[:4])}" if matched else "General delivery support"
        return AllocatedResource(
            resource_type=r["type"],
            name=r["name"],
            title=r["title"],
            seniority=r["seniority"],
            allocation_percentage=pct,
            skills=matched,
            cost_per_day=r["cost_per_day"],
            match_score=round(score, 2),
            reason=reason,
        )

    @staticmethod
    def _fallback() -> list[AllocatedResource]:
        return [
            AllocatedResource(
                resource_type=ResourceType.CODE_GENERATOR_AGENT,
                name="Forge-FE",
                title="AI Frontend Agent",
                seniority="agent",
                allocation_percentage=1.0,
                skills=["react", "typescript"],
                cost_per_day=50,
                match_score=1.0,
                reason="Default code-generation support",
            )
        ]

    @staticmethod
    def _reasoning(team, decision, understanding, coverage: float) -> str:
        humans = sum(1 for r in team if r.seniority not in {"agent", "partner"})
        agents = sum(1 for r in team if r.seniority == "agent")
        partners = sum(1 for r in team if r.seniority == "partner")
        top_titles = ", ".join((r.title or r.resource_type.value) for r in team[:4])
        return (
            f"Selected {len(team)} resources from a 50-person bench "
            f"({humans} human, {agents} AI, {partners} partner) for "
            f"{decision.execution_mode.value} mode. Coverage is {coverage:.0%}. "
            f"Lead coverage: {top_titles}. Demand is a "
            f"{understanding.complexity.value} {understanding.problem_type.value}."
        )
