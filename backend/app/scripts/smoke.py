"""End-to-end smoke test.

Runs the full ForgeOS pipeline against the local-filesystem artifact store
and the heuristic LLM fallbacks. No external services (NIM, Postgres, Redis,
S3) are required — perfect for "is the wiring intact?" checks.

Invocation:
    cd backend && python -m app.scripts.smoke
"""

from __future__ import annotations

import asyncio
import os
import shutil
import sys
import tempfile
from datetime import datetime, timezone

# Make sure demo / fallback paths are taken even if env still has API keys.
os.environ["FORGEOS_DEMO"] = "true"
os.environ.setdefault("FORGEOS_DEV_AUTH_BYPASS", "true")
os.environ.setdefault("FORGEOS_STORAGE", "local")
os.environ.setdefault("FORGEOS_PROVIDER", "ollama")

from app.config import settings, PROJECTS_DIR  # noqa: E402
from app.executor import Orchestrator  # noqa: E402
from app.planner import planner_pipeline  # noqa: E402
from app.storage import get_store  # noqa: E402

settings.demo_mode = True


async def main() -> int:
    prompt = "Build a banking chatbot with FAQ + balance queries, multilingual, urgent"

    print("→ ingestion")
    ingested = await planner_pipeline.ingest(prompt)
    print(f"   demand_id = {ingested['demand_id']}")

    print("→ understanding")
    understanding = await planner_pipeline.understand(prompt)
    print(f"   {understanding.problem_type.value} / {understanding.domain.value} / "
          f"{understanding.complexity.value} / urgency={understanding.urgency.value}")

    print("→ decision")
    decision = await planner_pipeline.decide(understanding, reuse_score=0.0)
    print(f"   mode={decision.execution_mode.value} "
          f"confidence={decision.confidence_score:.0%} "
          f"time={decision.estimated_time_days}d "
          f"cost=${decision.estimated_cost_usd:,.0f}")

    print("→ allocation")
    allocation = await planner_pipeline.allocate(understanding, decision)
    print(f"   team_size={len(allocation.team)} "
          f"daily_burn=${allocation.total_daily_cost:,.0f}")

    print("→ executor (demo mode)")
    events: list[dict] = []

    async def emit(payload: dict) -> None:
        events.append(payload)

    work_dir = tempfile.mkdtemp(prefix="forgeos-smoke-")
    try:
        orchestrator = Orchestrator(emit=emit, store=get_store())
        summary = await orchestrator.execute_project(
            project_id=ingested["demand_id"],
            prompt=prompt,
            tenant_id="dev",
            local_work_dir=work_dir,
        )
    finally:
        # Cleanup the scratch directory
        try:
            shutil.rmtree(work_dir)
        except Exception:
            pass

    files = summary["files"]
    print(f"   wrote {len(files)} files to {summary['artifacts_prefix']}")
    sample = [f["path"] for f in files[:8]]
    for path in sample:
        print(f"     • {path}")

    print("→ explanation")
    explanation = await planner_pipeline.explain(
        understanding, decision, allocation,
        files_count=len(files), rebalanced=False,
    )
    print(f"   {explanation.splitlines()[0][:140]}...")

    print("→ events")
    type_counts: dict[str, int] = {}
    for e in events:
        t = e.get("type", "?")
        type_counts[t] = type_counts.get(t, 0) + 1
    for t, c in sorted(type_counts.items(), key=lambda x: -x[1]):
        print(f"     {c:4d}  {t}")

    started = events and any(e.get("type") == "project.started" for e in events)
    completed = events and any(e.get("type") == "project.completed" for e in events)

    ok = bool(files) and started and completed
    print()
    print(f"smoke {'OK' if ok else 'FAILED'} at {datetime.now(timezone.utc).isoformat()}")
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
