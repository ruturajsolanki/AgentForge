"""E2E: client portal — request creation, messages, agent chat, team CRUD."""

from __future__ import annotations


def _portal_body(description="Build a booking platform for a dental clinic with online payments."):
    return {
        "client": {"name": "Jane Client", "email": "jane@clinic.com", "company": "BrightSmile"},
        "description": description,
    }


async def test_portal_create_request_infers_plan(client):
    resp = await client.post("/api/portal/requests", json=_portal_body())
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["publicId"].startswith("DMD-")
    assert body["status"] == "ai_processed"
    assert body["plan"]["understanding"]
    assert body["plan"]["allocation"]
    assert len(body["messages"]) >= 2  # client + agent intro


async def test_portal_list_requests(client):
    await client.post("/api/portal/requests", json=_portal_body())
    resp = await client.get("/api/portal/requests")
    assert resp.status_code == 200
    assert len(resp.json()) >= 1


async def test_portal_add_message_and_patch(client):
    created = (await client.post("/api/portal/requests", json=_portal_body())).json()
    rid = created["id"]

    msg = await client.post(
        f"/api/portal/requests/{rid}/messages",
        json={"author": "Manager", "role": "manager", "body": "We'll review shortly."},
    )
    assert msg.status_code == 200
    assert any(m["body"] == "We'll review shortly." for m in msg.json()["messages"])

    patched = await client.patch(
        f"/api/portal/requests/{rid}",
        json={"status": "approved", "approved_team": ["Alex Chen"]},
    )
    assert patched.status_code == 200
    assert patched.json()["status"] == "approved"


async def test_portal_agent_chat(client):
    created = (await client.post("/api/portal/requests", json=_portal_body())).json()
    rid = created["id"]
    resp = await client.post(
        f"/api/portal/requests/{rid}/agent-chat",
        json={"author": "Manager", "message": "Can we add multi-language support?"},
    )
    assert resp.status_code == 200
    assert resp.json()["response"]


async def test_portal_team_crud(client):
    create = await client.post("/api/portal/team", json={
        "name": "Riya Sharma", "role": "Backend Engineer", "skills": "python, sql",
    })
    assert create.status_code == 200
    member = create.json()

    listing = await client.get("/api/portal/team")
    assert listing.status_code == 200
    assert any(m["name"] == "Riya Sharma" for m in listing.json())

    update = await client.put(f"/api/portal/team/{member['id']}", json={
        "name": "Riya Sharma", "role": "Senior Backend Engineer", "availability": "30%",
    })
    assert update.status_code == 200
