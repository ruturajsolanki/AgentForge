"""E2E: editable team — add/remove members, trainers, AI-learners."""

from __future__ import annotations

from tests.conftest import create_demand


async def test_team_catalog_includes_trainers_and_learners(client):
    resp = await client.get("/api/demands/team/catalog")
    assert resp.status_code == 200
    kinds = {item["kind"] for item in resp.json()["items"]}
    assert "trainer" in kinds
    assert "learner" in kinds
    assert "member" in kinds


async def test_add_trainer_and_learner(client):
    body = await create_demand(client)
    pid = body["demand_id"]
    before = len(body["allocation"]["team"])

    resp = await client.patch(
        f"/api/demands/{pid}/team",
        json={
            "add": [
                {"name": "Coach Ada", "kind": "trainer", "resource_type": "trainer", "title": "Delivery Coach"},
                {"name": "Forge-Shadow", "kind": "learner", "resource_type": "ai_learner", "title": "AI Learner"},
            ],
            "reason": "upskilling + shadow",
        },
    )
    assert resp.status_code == 200
    team = resp.json()["allocation"]["team"]
    assert len(team) == before + 2
    kinds = {m["name"]: m["kind"] for m in team}
    assert kinds["Coach Ada"] == "trainer"
    assert kinds["Forge-Shadow"] == "learner"


async def test_remove_member(client):
    body = await create_demand(client)
    pid = body["demand_id"]
    team = body["allocation"]["team"]
    target = team[0]["name"]

    resp = await client.patch(f"/api/demands/{pid}/team", json={"remove": [target]})
    assert resp.status_code == 200
    names = {m["name"] for m in resp.json()["allocation"]["team"]}
    assert target not in names


async def test_team_edit_recomputes_cost_and_audits(client):
    body = await create_demand(client)
    pid = body["demand_id"]

    resp = await client.patch(
        f"/api/demands/{pid}/team",
        json={"add": [{"name": "Pricey Partner", "kind": "member", "cost_per_day": 1000, "allocation_percentage": 1.0}]},
    )
    assert resp.status_code == 200
    alloc = resp.json()["allocation"]
    assert alloc["total_daily_cost"] >= 1000

    audit = await client.get("/api/audit?entity_kind=demand&action=team_edited")
    assert audit.status_code == 200
    assert audit.json()["total"] >= 1


async def test_team_edit_dedupes(client):
    body = await create_demand(client)
    pid = body["demand_id"]
    existing = body["allocation"]["team"][0]["name"]

    resp = await client.patch(
        f"/api/demands/{pid}/team",
        json={"add": [{"name": existing, "kind": "member"}]},
    )
    assert resp.status_code == 200
    names = [m["name"] for m in resp.json()["allocation"]["team"]]
    assert names.count(existing) == 1
