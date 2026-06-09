"""Smoke tests — validate the E2E harness itself (DB, auth bypass, app boot)."""

from __future__ import annotations


async def test_health_ok(client):
    resp = await client.get("/api/health")
    assert resp.status_code == 200


async def test_dev_auth_default_manager(client):
    # Default dev user has the manager role; settings is auth-gated.
    resp = await client.get("/api/settings")
    assert resp.status_code == 200


async def test_as_role_grants_role(client, as_role):
    await as_role("higher_manager")
    # higher_manager can read the executive dashboard.
    resp = await client.get("/api/dashboard/executive")
    assert resp.status_code == 200


async def test_create_demand_smoke(client):
    resp = await client.post("/api/demands", json={"text": "Build a simple todo web app."})
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["stage"] == "awaiting_approval"
    assert body["understanding"]
    assert body["decision"]
    assert body["allocation"]["team"]
