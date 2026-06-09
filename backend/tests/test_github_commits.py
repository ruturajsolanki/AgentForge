"""E2E: GitHub publisher helpers, auto-publish hook, and commit tracking."""

from __future__ import annotations

import pytest
from sqlalchemy import select

from app.db.models import Commit, DemandRequest
from app.github.publisher import GitPublishError, remote_with_token, safe_branch
from tests.conftest import create_demand


# ── Publisher pure helpers ──────────────────────────────────────────────

def test_safe_branch_valid():
    assert safe_branch(" feature/x ") == "feature/x"


@pytest.mark.parametrize("bad", ["", "-bad", "a..b", "we*rd"])
def test_safe_branch_invalid(bad):
    with pytest.raises(GitPublishError):
        safe_branch(bad)


def test_remote_with_token_injects_token():
    url = remote_with_token("https://github.com/acme/repo.git", "ghp_secret")
    assert url.startswith("https://x-access-token:ghp_secret@github.com/")


def test_remote_with_token_passthrough_without_token():
    assert remote_with_token("git@github.com:a/b.git", None) == "git@github.com:a/b.git"


# ── Auto-publish worker hook ────────────────────────────────────────────

async def test_auto_publish_noop_when_unconfigured(client, db_session, monkeypatch):
    body = await create_demand(client)
    row = (
        await db_session.execute(select(DemandRequest).where(DemandRequest.public_id == body["demand_id"]))
    ).scalar_one()

    calls = []

    async def fake_publish(**kwargs):
        calls.append(kwargs)
        return {"branch": "main", "output": "ok"}

    monkeypatch.setattr("app.queue.worker.publish_project", fake_publish)
    from app.config import settings
    monkeypatch.setattr(settings, "github_auto_push", False, raising=False)

    from app.queue.worker import _maybe_auto_publish

    async def emit(_e):
        return None

    await _maybe_auto_publish(
        demand_id=row.id, tenant_id=row.tenant_id, public_id=row.public_id,
        artifacts_prefix="tenants/x/projects/y", files_count=3, emit=emit,
    )
    assert calls == []


async def test_auto_publish_runs_when_configured(client, db_session, monkeypatch):
    body = await create_demand(client)
    row = (
        await db_session.execute(select(DemandRequest).where(DemandRequest.public_id == body["demand_id"]))
    ).scalar_one()

    async def fake_publish(**kwargs):
        return {"branch": "main", "output": "abc123 pushed"}

    monkeypatch.setattr("app.queue.worker.publish_project", fake_publish)
    from app.config import settings
    monkeypatch.setattr(settings, "github_auto_push", True, raising=False)
    monkeypatch.setattr(settings, "github_remote_url", "https://github.com/acme/repo.git", raising=False)

    events = []

    async def emit(e):
        events.append(e)

    from app.queue.worker import _maybe_auto_publish

    await _maybe_auto_publish(
        demand_id=row.id, tenant_id=row.tenant_id, public_id=row.public_id,
        artifacts_prefix="tenants/x/projects/y", files_count=5, emit=emit,
    )

    commits = (
        await db_session.execute(select(Commit).where(Commit.demand_id == row.id))
    ).scalars().all()
    assert len(commits) == 1
    assert commits[0].is_agent is True
    assert any(e.get("type") == "pipeline.published" for e in events)


# ── Commit CRUD API ─────────────────────────────────────────────────────

async def test_commit_create_and_list(client):
    body = await create_demand(client)
    pid = body["demand_id"]

    create = await client.post(f"/api/demands/{pid}/commits", json={
        "sha": "deadbeefcafe",
        "author": "Dev One",
        "message": "Implement login form",
        "files_changed": 4,
        "branch": "feature/login",
    })
    assert create.status_code == 200, create.text
    assert create.json()["sha"] == "deadbeefcafe"

    await client.post(f"/api/demands/{pid}/commits", json={
        "sha": "f00ba4", "author": "Dev Two", "message": "Add tests", "files_changed": 2,
    })

    listing = await client.get(f"/api/demands/{pid}/commits")
    assert listing.status_code == 200
    items = listing.json()["items"]
    assert len(items) == 2
    assert {i["author"] for i in items} == {"Dev One", "Dev Two"}


async def test_commit_unknown_demand_404(client):
    resp = await client.post("/api/demands/DMD-NOPE/commits", json={
        "sha": "x", "author": "y", "message": "z",
    })
    assert resp.status_code == 404
