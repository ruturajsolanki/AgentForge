"""E2E: role-based access control + sanitizer no-leak guarantees."""

from __future__ import annotations

import pytest

from tests.conftest import create_demand


# ── Dashboards ──────────────────────────────────────────────────────────

@pytest.mark.parametrize("role", ["executive", "higher_manager", "manager"])
async def test_executive_dashboard_allowed_roles(client, as_role, role):
    await as_role(role)
    resp = await client.get("/api/dashboard/executive")
    assert resp.status_code == 200


@pytest.mark.parametrize("role", ["leader", "member", "viewer", "client"])
async def test_executive_dashboard_forbidden_roles(client, as_role, role):
    await as_role(role)
    resp = await client.get("/api/dashboard/executive")
    assert resp.status_code == 403


async def test_manager_dashboard(client, as_role):
    await as_role("manager")
    resp = await client.get("/api/dashboard/manager")
    assert resp.status_code == 200


async def test_leader_dashboard_allowed(client, as_role):
    await as_role("leader")
    resp = await client.get("/api/dashboard/leader")
    assert resp.status_code == 200


async def test_leader_dashboard_forbidden_for_viewer(client, as_role):
    await as_role("viewer")
    resp = await client.get("/api/dashboard/leader")
    assert resp.status_code == 403


# ── Reports ─────────────────────────────────────────────────────────────

@pytest.mark.parametrize("path", [
    "/api/reports/delivery",
    "/api/reports/team-performance",
    "/api/reports/demand-aging",
    "/api/reports/sla-compliance",
    "/api/reports/swon-detail",
])
async def test_reports_allowed_for_manager(client, as_role, path):
    await as_role("manager")
    resp = await client.get(path)
    assert resp.status_code == 200


@pytest.mark.parametrize("path", [
    "/api/reports/delivery",
    "/api/reports/team-performance",
])
async def test_reports_forbidden_for_member(client, as_role, path):
    await as_role("member")
    resp = await client.get(path)
    assert resp.status_code == 403


async def test_report_csv_export(client, as_role):
    await as_role("manager")
    await create_demand(client)
    resp = await client.get("/api/reports/delivery?format=csv")
    assert resp.status_code == 200
    assert "text/csv" in resp.headers.get("content-type", "") or resp.headers.get("content-disposition", "").endswith(".csv") or "attachment" in resp.headers.get("content-disposition", "")


# ── Sanitized higher-manager portfolio ──────────────────────────────────

async def test_portfolio_sanitized_no_failed_or_risk_leak(client, as_role, db_session):
    await as_role("higher_manager")
    # Seed a failed demand directly so we can prove it's hidden.
    from app.auth.dependency import _ensure_dev_tenant
    from app.db.models import DemandRequest

    tenant, user = await _ensure_dev_tenant(db_session)
    db_session.add(DemandRequest(
        tenant_id=tenant.id,
        public_id="DMD-FAILEDX",
        raw_text="secret failing project",
        stage="failed",
        error="boom internal error",
        decision={"risk_factors": ["data_loss", "security_gap"]},
    ))
    await db_session.commit()

    resp = await client.get("/api/reports/portfolio?sanitized=true")
    assert resp.status_code == 200
    raw = resp.text.lower()
    assert "failed" not in raw
    assert "risk_factors" not in raw
    assert "boom internal error" not in raw


async def test_portfolio_unsanitized_allowed_for_manager(client, as_role):
    await as_role("higher_manager")
    resp = await client.get("/api/reports/portfolio")
    assert resp.status_code == 200
