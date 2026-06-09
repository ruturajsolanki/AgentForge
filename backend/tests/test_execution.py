"""E2E: approval + background execution pipeline.

The `/approve` endpoint enqueues an Arq job; we monkeypatch the enqueue so no
Redis/worker is required, then drive `run_full_pipeline` directly (with a fake
executor) to assert the full stage progression and persistence.
"""

from __future__ import annotations

import uuid

import pytest
from sqlalchemy import select

from app.db.models import AgentRun, Artifact, DemandRequest
from tests.conftest import create_demand


async def test_approve_transitions_to_executing(client, monkeypatch):
    calls = {}

    async def fake_enqueue(redis_settings, demand_id, tenant_id):
        calls["demand_id"] = demand_id
        calls["tenant_id"] = tenant_id

    monkeypatch.setattr("app.api.demand.enqueue_pipeline", fake_enqueue)

    body = await create_demand(client)
    pid = body["demand_id"]
    resp = await client.post(f"/api/demands/{pid}/approve", json={"approve": True})
    assert resp.status_code == 200
    assert resp.json()["stage"] == "executing"
    assert "demand_id" in calls


async def test_approve_idempotent_when_not_awaiting(client, monkeypatch):
    monkeypatch.setattr("app.api.demand.enqueue_pipeline", _noop_enqueue)
    body = await create_demand(client)
    pid = body["demand_id"]
    await client.post(f"/api/demands/{pid}/approve", json={"approve": True})
    # Second approve: already executing -> returns current stage, no error.
    resp = await client.post(f"/api/demands/{pid}/approve", json={"approve": True})
    assert resp.status_code == 200


async def _noop_enqueue(*_a, **_k):
    return None


class _FakeOrchestrator:
    """Stand-in for the heavy executor — returns a deterministic summary."""

    def __init__(self, *_a, **_k):
        pass

    async def execute_project(self, project_id, prompt, tenant_id="default", **_k):
        return {
            "project_id": project_id,
            "tenant_id": tenant_id,
            "files": [{"path": "src/App.tsx", "content": "export default function App(){return null}"}],
            "artifacts_prefix": f"tenants/{tenant_id}/projects/{project_id}",
            "plan": {"tasks": [{"title": "scaffold", "agent": "frontend_dev"}]},
            "agent_runs": [{"agent_id": "frontend_dev", "files": [{"path": "src/App.tsx"}]}],
            "completed_at": "2026-01-01T00:00:00+00:00",
        }


async def test_run_full_pipeline_completes(client, db_session, monkeypatch):
    # Build a demand through the API so it's persisted in awaiting_approval.
    body = await create_demand(client)
    pid = body["demand_id"]
    row = (
        await db_session.execute(select(DemandRequest).where(DemandRequest.public_id == pid))
    ).scalar_one()
    demand_uuid = str(row.id)
    tenant_uuid = str(row.tenant_id)

    # Swap the executor for a fast fake and run the worker job inline.
    monkeypatch.setattr("app.queue.worker.Orchestrator", _FakeOrchestrator)
    from app.queue.worker import run_full_pipeline

    summary = await run_full_pipeline({}, demand_uuid, tenant_uuid)
    assert "error" not in summary

    # Re-fetch and assert terminal state + persisted artifacts/runs.
    refreshed = (
        await db_session.execute(select(DemandRequest).where(DemandRequest.public_id == pid))
    ).scalar_one()
    await db_session.refresh(refreshed)
    assert refreshed.stage == "completed"
    assert refreshed.explanation

    runs = (
        await db_session.execute(select(AgentRun).where(AgentRun.demand_id == row.id))
    ).scalars().all()
    assert len(runs) >= 1
    arts = (
        await db_session.execute(select(Artifact).where(Artifact.demand_id == row.id))
    ).scalars().all()
    assert len(arts) >= 1


async def test_run_full_pipeline_handles_executor_failure(client, db_session, monkeypatch):
    body = await create_demand(client)
    pid = body["demand_id"]
    row = (
        await db_session.execute(select(DemandRequest).where(DemandRequest.public_id == pid))
    ).scalar_one()

    class _BoomOrchestrator:
        def __init__(self, *_a, **_k):
            pass

        async def execute_project(self, *_a, **_k):
            raise RuntimeError("executor exploded")

    monkeypatch.setattr("app.queue.worker.Orchestrator", _BoomOrchestrator)
    from app.queue.worker import run_full_pipeline

    summary = await run_full_pipeline({}, str(row.id), str(row.tenant_id))
    assert "error" in summary

    refreshed = (
        await db_session.execute(select(DemandRequest).where(DemandRequest.public_id == pid))
    ).scalar_one()
    await db_session.refresh(refreshed)
    assert refreshed.stage == "failed"
