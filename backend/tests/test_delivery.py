"""E2E: SWON / WON / tasks / handoffs / audit delivery-layer endpoints."""

from __future__ import annotations

import pytest
from sqlalchemy import select

from app.db.models import DemandRequest
from tests.conftest import create_demand


async def _demand_uuid(client, db_session) -> str:
    body = await create_demand(client)
    row = (
        await db_session.execute(
            select(DemandRequest).where(DemandRequest.public_id == body["demand_id"])
        )
    ).scalar_one()
    return str(row.id)


# ── SWON ────────────────────────────────────────────────────────────────

async def test_swon_create_requires_role(client, as_role, db_session):
    did = await _demand_uuid(client, db_session)
    await as_role("leader")  # not manager/higher_manager
    resp = await client.post("/api/swon", json={"demand_id": did})
    assert resp.status_code == 403


async def test_swon_lifecycle(client, as_role, db_session):
    did = await _demand_uuid(client, db_session)
    await as_role("manager")
    create = await client.post("/api/swon", json={
        "demand_id": did,
        "customer_loa_ref": "LOA-123",
        "sow_summary": "Build phase",
        "total_value_inr": 5000000,
    })
    assert create.status_code == 200, create.text
    swon = create.json()
    assert swon["public_id"].startswith("SWON-")
    assert swon["lifecycle_state"] == "Initiated"

    listing = await client.get("/api/swon")
    assert listing.status_code == 200
    assert any(s["public_id"] == swon["public_id"] for s in listing.json())

    get = await client.get(f"/api/swon/{swon['public_id']}")
    assert get.status_code == 200

    upd = await client.patch(f"/api/swon/{swon['public_id']}/state", json={"state": "Active"})
    assert upd.status_code == 200
    assert upd.json()["state"] == "Active"


# ── WON ─────────────────────────────────────────────────────────────────

async def test_won_lifecycle(client, as_role, db_session):
    did = await _demand_uuid(client, db_session)
    await as_role("manager")
    swon = (await client.post("/api/swon", json={"demand_id": did})).json()
    swon_uuid = swon["id"]

    create = await client.post("/api/won", json={
        "swon_id": swon_uuid,
        "billable": True,
        "allocation_pct": 80,
        "monthly_value_inr": 250000,
    })
    assert create.status_code == 200, create.text
    won = create.json()
    assert won["public_id"].startswith("WON-")

    listing = await client.get(f"/api/won?swon={swon_uuid}")
    assert listing.status_code == 200
    assert any(w["public_id"] == won["public_id"] for w in listing.json())

    # List all wons for tenant when no swon filter is given.
    all_wons = await client.get("/api/won")
    assert all_wons.status_code == 200
    assert any(w["public_id"] == won["public_id"] for w in all_wons.json())

    upd = await client.patch(f"/api/won/{won['id']}", json={"state": "Closed"})
    assert upd.status_code == 200
    assert upd.json()["state"] == "Closed"


# ── Tasks ───────────────────────────────────────────────────────────────

async def test_task_full_lifecycle(client, as_role, db_session, dev_identity):
    did = await _demand_uuid(client, db_session)
    _tenant, user = dev_identity
    await as_role("manager")

    create = await client.post("/api/tasks", json={
        "demand_id": did,
        "title": "Implement auth",
        "description": "Add login + RBAC",
        "owner_id": str(user.id),
        "priority": "high",
        "est_hours": 8,
    })
    assert create.status_code == 200, create.text
    task = create.json()
    tid = task["public_id"]
    assert tid.startswith("TSK-")

    # status change
    st = await client.patch(f"/api/tasks/{tid}/status", json={"status": "In Progress"})
    assert st.status_code == 200

    # update / comment
    upd = await client.post(f"/api/tasks/{tid}/updates", json={"body": "Started work", "kind": "comment"})
    assert upd.status_code == 200

    # timeline
    tl = await client.get(f"/api/tasks/{tid}/timeline")
    assert tl.status_code == 200
    assert isinstance(tl.json(), list)

    # list by demand
    lst = await client.get(f"/api/tasks?demand_id={did}")
    assert lst.status_code == 200
    assert any(t["public_id"] == tid for t in lst.json())


async def test_task_create_forbidden_for_member(client, as_role, db_session):
    did = await _demand_uuid(client, db_session)
    await as_role("member")
    resp = await client.post("/api/tasks", json={"demand_id": did, "title": "x"})
    assert resp.status_code == 403


async def test_task_handoff(client, as_role, db_session, dev_identity):
    did = await _demand_uuid(client, db_session)
    _tenant, user = dev_identity
    await as_role("manager")
    task = (await client.post("/api/tasks", json={
        "demand_id": did, "title": "Handoff me", "owner_id": str(user.id),
    })).json()
    resp = await client.post(
        f"/api/tasks/{task['public_id']}/handoff",
        json={"to_user_id": str(user.id), "reason": "specialist needed"},
    )
    assert resp.status_code == 200


# ── Audit ───────────────────────────────────────────────────────────────

async def test_audit_pagination_and_filter(client, as_role, db_session):
    did = await _demand_uuid(client, db_session)
    await as_role("manager")
    swon = (await client.post("/api/swon", json={"demand_id": did})).json()
    await client.patch(f"/api/swon/{swon['public_id']}/state", json={"state": "Active"})

    resp = await client.get("/api/audit?limit=10&offset=0")
    assert resp.status_code == 200
    body = resp.json()
    assert "items" in body and "total" in body
    assert body["total"] >= 1

    filtered = await client.get("/api/audit?entity_kind=swon")
    assert filtered.status_code == 200
    assert all(it["entity_kind"] == "swon" for it in filtered.json()["items"])
