"""E2E: notifications — emitted on key events, read / read-all, unread count."""

from __future__ import annotations

from sqlalchemy import select

from app.db.models import DemandRequest
from tests.conftest import create_demand


async def test_demand_creation_emits_approval_notification(client):
    await create_demand(client)
    resp = await client.get("/api/notifications")
    assert resp.status_code == 200
    body = resp.json()
    assert body["unread_count"] >= 1
    assert any(n["kind"] == "approval_needed" for n in body["items"])


async def test_mark_one_read_decrements_unread(client):
    await create_demand(client)
    listing = (await client.get("/api/notifications")).json()
    first = listing["items"][0]
    before = listing["unread_count"]

    resp = await client.post(f"/api/notifications/{first['id']}/read")
    assert resp.status_code == 200
    assert resp.json()["unread_count"] == before - 1


async def test_mark_all_read(client):
    await create_demand(client)
    await create_demand(client)
    resp = await client.post("/api/notifications/read-all")
    assert resp.status_code == 200
    assert resp.json()["unread_count"] == 0
    after = (await client.get("/api/notifications")).json()
    assert after["unread_count"] == 0


async def test_unread_only_filter(client):
    await create_demand(client)
    listing = (await client.get("/api/notifications")).json()
    nid = listing["items"][0]["id"]
    await client.post(f"/api/notifications/{nid}/read")

    unread = (await client.get("/api/notifications?unread_only=true")).json()
    assert all(n["read"] is False for n in unread["items"])


async def test_reassign_notifies_assignee(client, db_session, dev_identity):
    _tenant, user = dev_identity
    body = await create_demand(client)
    await client.post("/api/notifications/read-all")  # clear approval noise

    resp = await client.patch(
        f"/api/demands/{body['demand_id']}/reassign",
        json={"field": "assigned_leader_id", "user_id": str(user.id), "reason": "you lead this"},
    )
    assert resp.status_code == 200

    listing = (await client.get("/api/notifications")).json()
    assert any(n["kind"] == "assignment" for n in listing["items"])


async def test_swon_state_change_notifies(client, as_role, db_session):
    body = await create_demand(client)
    row = (
        await db_session.execute(
            select(DemandRequest).where(DemandRequest.public_id == body["demand_id"])
        )
    ).scalar_one()
    await as_role("manager")
    swon = (await client.post("/api/swon", json={"demand_id": str(row.id)})).json()
    await client.post("/api/notifications/read-all")
    await client.patch(f"/api/swon/{swon['public_id']}/state", json={"state": "Active"})

    listing = (await client.get("/api/notifications")).json()
    assert any(n["kind"] == "swon_state" for n in listing["items"])
