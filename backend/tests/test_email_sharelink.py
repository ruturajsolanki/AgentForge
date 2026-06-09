"""E2E: share-live-link email flow + email outbox."""

from __future__ import annotations

from sqlalchemy import select

from app.db.models import DemandRequest, EmailLog
from tests.conftest import create_demand


async def test_share_link_sets_preview_and_logs_email(client, db_session):
    body = await create_demand(client)
    pid = body["demand_id"]

    resp = await client.post(
        f"/api/demands/{pid}/share-link",
        json={"client_email": "client@acme.com", "message": "Follow along here:"},
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["preview_url"]
    assert data["email"]["to"] == "client@acme.com"
    assert data["email"]["delivered"] is True
    assert data["email"]["provider"] == "demo"

    # preview_url persisted on the demand
    row = (
        await db_session.execute(select(DemandRequest).where(DemandRequest.public_id == pid))
    ).scalar_one()
    await db_session.refresh(row)
    assert row.preview_url == data["preview_url"]

    # email captured in outbox
    logs = (
        await db_session.execute(select(EmailLog).where(EmailLog.demand_id == row.id))
    ).scalars().all()
    assert len(logs) == 1
    assert logs[0].kind == "share_link"


async def test_list_demand_emails(client):
    body = await create_demand(client)
    pid = body["demand_id"]
    await client.post(f"/api/demands/{pid}/share-link", json={"client_email": "a@b.com"})
    await client.post(f"/api/demands/{pid}/share-link", json={"client_email": "c@d.com"})

    resp = await client.get(f"/api/demands/{pid}/emails")
    assert resp.status_code == 200
    items = resp.json()["items"]
    assert len(items) == 2
    assert {i["to"] for i in items} == {"a@b.com", "c@d.com"}


async def test_share_link_custom_link(client):
    body = await create_demand(client)
    pid = body["demand_id"]
    resp = await client.post(
        f"/api/demands/{pid}/share-link",
        json={"client_email": "x@y.com", "link": "https://status.example.com/live/abc"},
    )
    assert resp.status_code == 200
    assert resp.json()["preview_url"] == "https://status.example.com/live/abc"


async def test_share_link_unknown_demand_404(client):
    resp = await client.post(
        "/api/demands/DMD-NOPE/share-link", json={"client_email": "x@y.com"}
    )
    assert resp.status_code == 404
