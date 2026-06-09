"""E2E: the demand intake pipeline — clarify, converse, create, list, lifecycle."""

from __future__ import annotations

from tests.conftest import DEMAND_TEXT, create_demand


# ── Clarification (AI questions with options) ───────────────────────────

async def test_clarify_returns_questions_with_options(client):
    resp = await client.post("/api/demands/clarify", json={"text": "Build an app."})
    assert resp.status_code == 200
    body = resp.json()
    assert "questions" in body
    assert "completeness_score" in body
    assert len(body["questions"]) >= 1
    for q in body["questions"]:
        assert q["question"]
        assert "category" in q
        # Every clarifying question must offer suggested options.
        assert isinstance(q["options"], list)
        assert len(q["options"]) >= 1


async def test_clarify_detailed_demand_is_more_complete(client):
    vague = await client.post("/api/demands/clarify", json={"text": "Make a thing."})
    detailed = await client.post("/api/demands/clarify", json={"text": DEMAND_TEXT})
    assert vague.status_code == 200 and detailed.status_code == 200
    assert detailed.json()["completeness_score"] >= vague.json()["completeness_score"]


# ── Multi-turn conversation ─────────────────────────────────────────────

async def test_converse_returns_followups_and_readiness(client):
    resp = await client.post(
        "/api/demands/converse",
        json={
            "text": "Build a CRM dashboard",
            "history": [],
            "message": "It's for our sales team, about 50 users.",
        },
    )
    assert resp.status_code == 200
    body = resp.json()
    assert "message" in body
    assert "ready_for_plan" in body
    assert "completeness_score" in body
    assert isinstance(body["follow_up_questions"], list)
    for q in body["follow_up_questions"]:
        assert isinstance(q.get("options", []), list)


async def test_converse_becomes_ready_with_rich_history(client):
    history = [
        {"role": "assistant", "content": "Who are the users?"},
        {"role": "user", "content": "Admins and sales reps with role-based access."},
        {"role": "assistant", "content": "Any integrations?"},
        {"role": "user", "content": "Salesforce CRM and email notifications."},
    ]
    resp = await client.post(
        "/api/demands/converse",
        json={
            "text": DEMAND_TEXT,
            "history": history,
            "message": "We expect 500 concurrent users and need GDPR compliance.",
        },
    )
    assert resp.status_code == 200
    score = resp.json()["completeness_score"]
    assert 0.0 <= score <= 1.0


# ── Create demand (full plan) ───────────────────────────────────────────

async def test_create_demand_full_plan(client):
    body = await create_demand(client)
    assert body["demand_id"].startswith("DMD-")
    assert body["stage"] == "awaiting_approval"
    u = body["understanding"]
    assert u["problem_type"] and u["complexity"]
    d = body["decision"]
    assert d["execution_mode"]
    assert d["estimated_cost_usd"] >= 0
    assert d["estimated_time_days"] >= 1
    a = body["allocation"]
    assert len(a["team"]) >= 1
    assert a["total_daily_cost"] >= 0
    assert "reuse_score" in body


async def test_create_demand_with_clarifications_enriches_text(client, db_session):
    from sqlalchemy import select

    from app.db.models import DemandRequest

    resp = await client.post(
        "/api/demands",
        json={
            "text": "Build an internal tool.",
            "clarifications": [
                {"question_id": "q1", "question": "Who uses it?", "answer": "HR team"},
            ],
        },
    )
    assert resp.status_code == 200
    pid = resp.json()["demand_id"]
    row = (
        await db_session.execute(select(DemandRequest).where(DemandRequest.public_id == pid))
    ).scalar_one()
    assert "HR team" in row.raw_text
    assert "Additional Details" in row.raw_text


# ── List / filter / sort / paginate ─────────────────────────────────────

async def test_list_demands_pagination_and_total(client):
    for i in range(3):
        await create_demand(client, f"Demand number {i}: build a small web app.")
    resp = await client.get("/api/demands?limit=2&offset=0")
    assert resp.status_code == 200
    body = resp.json()
    assert body["total"] >= 3
    assert len(body["items"]) == 2
    assert body["has_more"] is True


async def test_list_demands_filter_by_stage(client):
    await create_demand(client)
    resp = await client.get("/api/demands?stage=awaiting_approval")
    assert resp.status_code == 200
    assert all(it["stage"] == "awaiting_approval" for it in resp.json()["items"])


async def test_list_demands_search(client):
    await create_demand(client, "A unique zebra-flavoured analytics platform.")
    resp = await client.get("/api/demands?search=zebra")
    assert resp.status_code == 200
    assert resp.json()["total"] >= 1


async def test_get_demand_includes_agent_runs_key(client):
    body = await create_demand(client)
    resp = await client.get(f"/api/demands/{body['demand_id']}")
    assert resp.status_code == 200
    got = resp.json()
    assert got["public_id"] == body["demand_id"]
    assert "agent_runs" in got


async def test_get_demand_404(client):
    resp = await client.get("/api/demands/DMD-DOESNOTEXIST")
    assert resp.status_code == 404


# ── Lifecycle: stage change + reassign (audited) ────────────────────────

async def test_stage_change_records_audit(client):
    body = await create_demand(client)
    pid = body["demand_id"]
    resp = await client.patch(
        f"/api/demands/{pid}/stage",
        json={"stage": "monitoring", "reason": "manual override"},
    )
    assert resp.status_code == 200
    assert resp.json()["stage"] == "monitoring"

    audit = await client.get("/api/audit?entity_kind=demand&action=stage_changed")
    assert audit.status_code == 200
    assert audit.json()["total"] >= 1


async def test_reassign_demand(client, dev_identity):
    _tenant, user = dev_identity
    body = await create_demand(client)
    pid = body["demand_id"]
    resp = await client.patch(
        f"/api/demands/{pid}/reassign",
        json={"field": "assigned_manager_id", "user_id": str(user.id), "reason": "load balancing"},
    )
    assert resp.status_code == 200
    assert resp.json()["field"] == "assigned_manager_id"


async def test_reassign_invalid_field(client, dev_identity):
    _tenant, user = dev_identity
    body = await create_demand(client)
    resp = await client.patch(
        f"/api/demands/{body['demand_id']}/reassign",
        json={"field": "not_a_field", "user_id": str(user.id)},
    )
    assert resp.status_code == 400


async def test_manager_chat_fallback(client):
    body = await create_demand(client)
    resp = await client.post(
        f"/api/demands/{body['demand_id']}/manager-chat",
        json={"message": "What are the main risks?"},
    )
    assert resp.status_code == 200
    assert resp.json()["response"]
