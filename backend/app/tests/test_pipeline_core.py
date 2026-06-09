from __future__ import annotations

import asyncio
import unittest
from types import SimpleNamespace

import httpx

from app.api.chat import (
    _extract_file_edits,
    _has_edit_intent,
    _is_small_talk,
    _sanitize_response_for_intent,
)
from app.api.demand import _manager_chat_fallback
from app.api.github import _remote_with_token, _safe_branch
from app.api.portal import (
    DEFAULT_TEAM,
    PortalRequestCreate,
    _default_team_backfill,
    _demand_text,
    _inferred_metadata,
)
from app.config import settings
from app.executor.agents import ProjectManagerAgent
from app.llm.bridge import LLMBridge
from app.llm.provider import FallbackProvider, FallbackTier, LLMProvider, get_provider
from app.planner.allocation import RESOURCE_POOL, AllocationEngine
from app.planner.decision import DecisionEngine
from app.planner.understanding import UnderstandingEngine
from app.schemas import ExecutionMode


class AlwaysRateLimited(LLMProvider):
    name = "primary"

    async def chat(self, messages, *, model=None, temperature=0.4, max_tokens=4096, extra=None):
        request = httpx.Request("POST", "https://primary.example/chat")
        response = httpx.Response(429, request=request)
        raise httpx.HTTPStatusError("rate limited", request=request, response=response)


class FastFallback(LLMProvider):
    name = "fallback"

    async def chat(self, messages, *, model=None, temperature=0.4, max_tokens=4096, extra=None):
        return f"ok:{model}"


class BrowserUnavailable(LLMProvider):
    name = "browser"

    async def chat(self, messages, *, model=None, temperature=0.4, max_tokens=4096, extra=None):
        raise RuntimeError("No browser connected. Load a WebLLM model first.")


class FakeWsManager:
    active_connections = [object()]

    def __init__(self) -> None:
        self.payloads: list[dict] = []

    async def broadcast_all(self, payload: dict) -> None:
        self.payloads.append(payload)


class PipelineCoreTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self) -> None:
        settings.demo_mode = True

    async def test_fallback_provider_uses_next_tier_on_429(self) -> None:
        provider = FallbackProvider(
            AlwaysRateLimited(),
            [FallbackTier(FastFallback(), {"primary-model": "fallback-model"}, "fallback-default")],
        )
        result = await provider.chat([{"role": "user", "content": "hello"}], model="primary-model")
        self.assertEqual(result, "ok:fallback-model")

    async def test_browser_provider_can_use_configured_fallback_chain(self) -> None:
        provider = FallbackProvider(
            BrowserUnavailable(),
            [FallbackTier(FastFallback(), {"browser-model": "fallback-model"}, "fallback-default")],
        )
        result = await provider.chat([{"role": "user", "content": "hello"}], model="browser-model")
        self.assertEqual(result, "ok:fallback-model")

        old_provider = settings.llm_provider
        old_groq_key = settings.groq_api_key
        old_openrouter_key = settings.openrouter_api_key
        try:
            settings.llm_provider = "browser"
            settings.groq_api_key = "test-key"
            settings.openrouter_api_key = ""
            self.assertIsInstance(get_provider(), FallbackProvider)
            self.assertTrue(settings.to_dict()["fallback_active"])
        finally:
            settings.llm_provider = old_provider
            settings.groq_api_key = old_groq_key
            settings.openrouter_api_key = old_openrouter_key

    async def test_llm_bridge_broadcasts_browser_requests(self) -> None:
        bridge = LLMBridge()
        manager = FakeWsManager()
        bridge.bind(manager)

        task = asyncio.create_task(bridge.request("hello", system="sys", model="browser-model"))
        await asyncio.sleep(0)

        self.assertEqual(len(manager.payloads), 1)
        payload = manager.payloads[0]
        self.assertEqual(payload["type"], "llm.request")
        self.assertEqual(payload["prompt"], "hello")
        self.assertEqual(payload["system"], "sys")
        self.assertEqual(payload["model"], "browser-model")

        bridge.resolve(payload["request_id"], "done")
        self.assertEqual(await task, "done")

    async def test_allocation_selects_from_50_person_bench(self) -> None:
        self.assertEqual(len(RESOURCE_POOL), 50)
        understanding = await UnderstandingEngine().analyze(
            "Build an AI sales dashboard with CRM integrations, reminders, escalation, analytics, and auth"
        )
        decision = DecisionEngine()._rule_based(understanding, reuse_score=0.0)
        allocation = AllocationEngine().allocate(understanding, decision)
        self.assertEqual(allocation.bench_size, 50)
        self.assertGreaterEqual(allocation.coverage_score, 0.5)
        self.assertGreaterEqual(len(allocation.team), 4)
        self.assertTrue(any(r.seniority == "agent" for r in allocation.team))

    async def test_reuse_decision_still_allocates_review_team(self) -> None:
        understanding = await UnderstandingEngine().analyze("Build a React CRM target tracking app")
        decision = DecisionEngine()._rule_based(understanding, reuse_score=0.82)
        self.assertEqual(decision.execution_mode, ExecutionMode.REUSE_EXISTING)
        allocation = AllocationEngine().allocate(understanding, decision)
        self.assertGreaterEqual(len(allocation.team), 3)

    async def test_project_manager_fallback_is_detailed(self) -> None:
        plan = ProjectManagerAgent._fallback_plan("Build a customer portal")
        self.assertGreaterEqual(len(plan["tasks"]), 8)
        self.assertTrue({t["agent"] for t in plan["tasks"]} <= {
            "frontend_dev", "backend_dev", "devops", "qa_tester", "documentation",
        })

    async def test_chat_extracts_file_edits(self) -> None:
        response = """Here is the edit.

FILE: src/App.tsx
```tsx
export default function App() {
  return <main>Done</main>;
}
```
"""
        edits = _extract_file_edits(response)
        self.assertEqual(edits, [{
            "path": "src/App.tsx",
            "content": "export default function App() {\n  return <main>Done</main>;\n}",
        }])

    async def test_chat_intent_gates_file_edits_for_greetings(self) -> None:
        self.assertTrue(_is_small_talk("Hey"))
        self.assertTrue(_is_small_talk("hay"))
        self.assertFalse(_has_edit_intent("Hey"))
        self.assertTrue(_has_edit_intent("Change the headline in src/App.tsx"))

        noisy = """FILE: src/App.tsx
```tsx
export default function App() { return <main />; }
```"""
        self.assertEqual(
            _sanitize_response_for_intent("Hey", noisy),
            "Hey. Tell me what you want to inspect or change in this project.",
        )

    async def test_github_helpers_validate_branch_and_mask_remote(self) -> None:
        self.assertEqual(_safe_branch("feature/demo"), "feature/demo")
        with self.assertRaises(Exception):
            _safe_branch("../bad")
        remote = _remote_with_token("https://github.com/acme/app.git", "tok")
        self.assertEqual(remote, "https://x-access-token:tok@github.com/acme/app.git")

    async def test_portal_request_accepts_text_only_and_infers_metadata(self) -> None:
        body = PortalRequestCreate(
            client={
                "name": "Client Demo",
                "email": "client@example.com",
                "company": "DemoCo Retail",
            },
            description="Need an urgent retail analytics dashboard for store managers",
        )
        self.assertIsNone(body.industry)
        text = _demand_text(body)
        self.assertIn("Requirement: Need an urgent retail analytics dashboard", text)
        self.assertNotIn("Industry:", text)

        understanding = UnderstandingEngine()._heuristic(body.description)
        metadata = _inferred_metadata(body, understanding)
        self.assertEqual(metadata["industry"], "retail")
        self.assertEqual(metadata["priority"], "high")
        self.assertEqual(metadata["timeline"], "AI inferred")
        self.assertEqual(metadata["budget_range"], "Not specified")

    async def test_portal_default_team_seeds_50_usable_members(self) -> None:
        self.assertEqual(len(DEFAULT_TEAM), 50)
        names = {member["name"] for member in DEFAULT_TEAM}
        self.assertEqual(len(names), 50)
        self.assertTrue(all(member["skills"] for member in DEFAULT_TEAM))
        self.assertTrue(any(member["experience"] == "AI agent" for member in DEFAULT_TEAM))
        self.assertTrue(any(member["current_project"] == "Partner bench" for member in DEFAULT_TEAM))

    async def test_portal_default_team_backfills_without_overwriting_existing(self) -> None:
        additions = _default_team_backfill({"Ananya Rao", "Kabir Sethi", "Mira Shah"}, 3)
        self.assertEqual(len(additions), 47)
        self.assertNotIn("Ananya Rao", {member["name"] for member in additions})

    async def test_manager_chat_fallback_is_demand_specific(self) -> None:
        demand = SimpleNamespace(
            public_id="DMD-TEST",
            stage="awaiting_approval",
            raw_text="Build a retail loyalty dashboard",
            understanding={"complexity": "medium", "problem_type": "analytics"},
            decision={"execution_mode": "hybrid", "risk_factors": ["data quality"]},
            allocation={"team": [{"name": "Forge-Analytics"}]},
            reuse_score=0,
            similar_projects={},
            explanation=None,
        )
        response = _manager_chat_fallback(demand, "What should I check?")
        self.assertIn("DMD-TEST", response)
        self.assertIn("data quality", response)
        self.assertIn("What should I check?", response)


if __name__ == "__main__":
    unittest.main()
