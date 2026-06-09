"""E2E: health, settings, and LLM routing endpoints."""

from __future__ import annotations


async def test_health_no_auth_required(client):
    resp = await client.get("/api/health")
    assert resp.status_code == 200
    body = resp.json()
    assert isinstance(body, dict)


async def test_get_settings(client):
    resp = await client.get("/api/settings")
    assert resp.status_code == 200
    body = resp.json()
    assert "llm_provider" in body
    assert "demo_mode" in body
    assert body["demo_mode"] is True


async def test_update_settings_roundtrip(client):
    resp = await client.put("/api/settings", json={"agent_concurrency": 4})
    assert resp.status_code == 200
    body = resp.json()
    assert body["agent_concurrency"] == 4


async def test_update_settings_clamps_values(client):
    resp = await client.put("/api/settings", json={"worker_max_jobs": 9999})
    assert resp.status_code == 200
    assert resp.json()["worker_max_jobs"] <= 32


async def test_llm_routing(client):
    resp = await client.get("/api/llm/routing")
    assert resp.status_code == 200
    assert isinstance(resp.json(), (dict, list))


async def test_llm_models(client):
    resp = await client.get("/api/llm/models")
    assert resp.status_code == 200
