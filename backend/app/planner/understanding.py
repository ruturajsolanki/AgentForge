"""AI Understanding Engine — extracts structured meaning from raw demand text.

Calls the planner LLM (Llama-3.3 by default) through `LLMProvider` and
falls back to the deterministic Vultron heuristics if the LLM is offline
or returns garbage.
"""

from __future__ import annotations

from app.config import settings
from app.llm import model_router, get_provider
from app.planner._jsonutil import extract_json
from app.schemas import (
    Complexity,
    DemandUnderstanding,
    Domain,
    ProblemType,
    Urgency,
)

UNDERSTANDING_PROMPT = """\
You are a senior AI delivery architect. Extract structured intent from a raw
demand and respond with a SINGLE JSON object. No prose, no markdown, no commentary.

Schema:
{{
  "problem_type": one of [web_app, chatbot, analytics, automation, ml_model, data_pipeline, integration, other],
  "domain": one of [banking, healthcare, retail, insurance, telecom, hr, finance, developer_tools, general],
  "complexity": one of [low, medium, high],
  "urgency": one of [low, medium, high],
  "required_skills": [list of short skill keys],
  "key_features": [list of short feature keys],
  "estimated_scope_days": integer,
  "summary": "one sentence"
}}

Demand:
\"\"\"{demand_text}\"\"\"
"""


class UnderstandingEngine:
    async def analyze(self, demand_text: str) -> DemandUnderstanding:
        if settings.demo_mode:
            return self._heuristic(demand_text)
        try:
            return await self._llm_analyze(demand_text)
        except Exception:
            return self._heuristic(demand_text)

    async def _llm_analyze(self, demand_text: str) -> DemandUnderstanding:
        routed = model_router.resolve("understanding")
        provider = get_provider(routed.provider)
        text = await provider.chat(
            [
                {"role": "system", "content": "Return ONLY a valid JSON object."},
                {"role": "user", "content": UNDERSTANDING_PROMPT.format(demand_text=demand_text)},
            ],
            model=routed.model,
            temperature=0.2,
            max_tokens=1024,
        )
        data = extract_json(text)
        if not data:
            return self._heuristic(demand_text)
        return DemandUnderstanding(**self._coerce(data, demand_text))

    @staticmethod
    def _coerce(data: dict, demand_text: str) -> dict:
        """Round any unknown enum value back to a safe default."""
        out = dict(data)
        out.setdefault("required_skills", [])
        out.setdefault("key_features", [])
        out.setdefault("summary", demand_text[:140])
        out.setdefault("estimated_scope_days", 14)
        if out.get("problem_type") not in [p.value for p in ProblemType]:
            out["problem_type"] = ProblemType.WEB_APP.value
        if out.get("domain") not in [d.value for d in Domain]:
            out["domain"] = Domain.GENERAL.value
        if out.get("complexity") not in [c.value for c in Complexity]:
            out["complexity"] = Complexity.MEDIUM.value
        if out.get("urgency") not in [u.value for u in Urgency]:
            out["urgency"] = Urgency.MEDIUM.value
        return out

    # ── Deterministic fallback (lifted from Vultron) ────────────────────

    def _heuristic(self, demand_text: str) -> DemandUnderstanding:
        text_lower = demand_text.lower()
        problem_type = self._problem_type(text_lower)
        domain = self._domain(text_lower)
        complexity = self._complexity(text_lower)
        urgency = self._urgency(text_lower)
        skills = self._skills(text_lower, problem_type)
        features = self._features(text_lower)
        scope = {Complexity.LOW: 14, Complexity.MEDIUM: 30, Complexity.HIGH: 60}[complexity]
        return DemandUnderstanding(
            problem_type=problem_type,
            domain=domain,
            complexity=complexity,
            urgency=urgency,
            required_skills=skills,
            key_features=features,
            estimated_scope_days=scope,
            summary=f"Build a {problem_type.value} for {domain.value}: {demand_text[:80]}",
        )

    @staticmethod
    def _problem_type(text: str) -> ProblemType:
        if any(w in text for w in ["chatbot", "chat bot", "conversational"]):
            return ProblemType.CHATBOT
        if any(w in text for w in ["dashboard", "analytics", "reporting"]):
            return ProblemType.ANALYTICS
        if any(w in text for w in ["automat", "workflow", "rpa"]):
            return ProblemType.AUTOMATION
        if any(w in text for w in ["fraud", "predict", "ml model", "classify"]):
            return ProblemType.ML_MODEL
        if any(w in text for w in ["pipeline", "etl", "ingestion"]):
            return ProblemType.DATA_PIPELINE
        if any(w in text for w in ["integrat", "connect", " api"]):
            return ProblemType.INTEGRATION
        if any(w in text for w in ["site", "page", "app", "ui", "frontend", "portfolio", "landing", "blog"]):
            return ProblemType.WEB_APP
        return ProblemType.OTHER

    @staticmethod
    def _domain(text: str) -> Domain:
        if "bank" in text or "fintech" in text:
            return Domain.BANKING
        if "health" in text or "medical" in text:
            return Domain.HEALTHCARE
        if "retail" in text or "shop" in text or "ecommerce" in text:
            return Domain.RETAIL
        if "insurance" in text:
            return Domain.INSURANCE
        if "telecom" in text:
            return Domain.TELECOM
        if "hr " in text or "employee" in text:
            return Domain.HR
        if "finance" in text or "invoice" in text or "billing" in text:
            return Domain.FINANCE
        if "developer" in text or "code" in text or "ide" in text:
            return Domain.DEVELOPER_TOOLS
        return Domain.GENERAL

    @staticmethod
    def _complexity(text: str) -> Complexity:
        high = ["multilingual", "real-time", "scalab", "enterprise", "compliance", "fraud"]
        med = ["integrat", "custom", "multiple", "ai", "machine learning"]
        if sum(w in text for w in high) >= 2:
            return Complexity.HIGH
        if any(w in text for w in high) or sum(w in text for w in med) >= 2:
            return Complexity.MEDIUM
        return Complexity.LOW

    @staticmethod
    def _urgency(text: str) -> Urgency:
        if any(w in text for w in ["urgent", "asap", "immediately", "critical"]):
            return Urgency.HIGH
        if any(w in text for w in ["soon", "priority", "important"]):
            return Urgency.MEDIUM
        return Urgency.LOW

    @staticmethod
    def _skills(text: str, problem_type: ProblemType) -> list[str]:
        skills = {"typescript", "react"}
        if problem_type == ProblemType.CHATBOT:
            skills |= {"nlp", "llm", "conversational_ai"}
        elif problem_type == ProblemType.ML_MODEL:
            skills |= {"python", "machine_learning", "data_science"}
        elif problem_type == ProblemType.AUTOMATION:
            skills |= {"workflow_automation", "api_integration"}
        elif problem_type == ProblemType.ANALYTICS:
            skills |= {"sql", "visualization"}
        if "supabase" in text or "auth" in text or "database" in text:
            skills.add("supabase")
        if "docker" in text or "deploy" in text:
            skills.add("devops")
        return sorted(skills)

    @staticmethod
    def _features(text: str) -> list[str]:
        keywords = {
            "auth": "authentication",
            "login": "authentication",
            "todo": "task_management",
            "crud": "crud",
            "dashboard": "dashboard",
            "chat": "chat_interface",
            "upload": "file_upload",
            "real-time": "realtime_updates",
        }
        out: list[str] = []
        for k, v in keywords.items():
            if k in text and v not in out:
                out.append(v)
        if not out:
            out.append("core_functionality")
        return out
