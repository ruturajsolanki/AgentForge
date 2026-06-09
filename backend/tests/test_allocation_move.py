"""E2E: DB-sourced allocation augmentation — 'should we move this member?'."""

from __future__ import annotations

from app.planner.allocation import RESOURCE_POOL
from app.planner.pipeline import planner_pipeline
from app.schemas import AllocatedResource, ResourceAllocation, ResourceType
from tests.conftest import create_demand


def _busy_member(tenant_id, name, project="Apollo CRM Rollout"):
    from app.db.models import TeamMember

    return TeamMember(
        tenant_id=tenant_id,
        name=name,
        role="Engineer",
        experience="7 yrs",
        ai_readiness="active",
        skills="python, react",
        availability="40%",
        current_project=project,
    )


async def test_augment_marks_busy_member_for_move(db_session, dev_identity):
    tenant, _user = dev_identity
    db_session.add(_busy_member(tenant.id, "Alex Chen"))
    await db_session.commit()

    allocation = ResourceAllocation(
        team=[
            AllocatedResource(
                resource_type=ResourceType.BACKEND_ENGINEER,
                name="Alex Chen",
                seniority="senior",
                allocation_percentage=1.0,
                skills=["python", "api_development"],
                cost_per_day=820,
                match_score=4.0,
            )
        ],
        total_daily_cost=820,
        allocation_reasoning="test",
    )
    out = await planner_pipeline.augment_allocation(allocation, tenant.id, db_session)
    member = out.team[0]
    assert member.move_recommended is True
    assert member.currently_allocated_to == "Apollo CRM Rollout"
    assert 0.0 < member.move_probability <= 1.0
    assert member.move_importance in {"high", "medium", "low"}
    assert member.move_rationale


async def test_augment_ignores_available_members(db_session, dev_identity):
    tenant, _user = dev_identity
    db_session.add(_busy_member(tenant.id, "Sam Rivera", project="Available"))
    await db_session.commit()

    allocation = ResourceAllocation(
        team=[
            AllocatedResource(
                resource_type=ResourceType.FRONTEND_ENGINEER,
                name="Sam Rivera",
                seniority="senior",
                allocation_percentage=1.0,
                skills=["react"],
                cost_per_day=760,
                match_score=3.0,
            )
        ],
        total_daily_cost=760,
        allocation_reasoning="test",
    )
    out = await planner_pipeline.augment_allocation(allocation, tenant.id, db_session)
    assert out.team[0].move_recommended is False


async def test_augment_ignores_agents(db_session, dev_identity):
    tenant, _user = dev_identity
    db_session.add(_busy_member(tenant.id, "Forge-FE"))
    await db_session.commit()

    allocation = ResourceAllocation(
        team=[
            AllocatedResource(
                resource_type=ResourceType.CODE_GENERATOR_AGENT,
                name="Forge-FE",
                seniority="agent",
                allocation_percentage=1.0,
                skills=["react"],
                cost_per_day=50,
                match_score=2.0,
            )
        ],
        total_daily_cost=50,
        allocation_reasoning="test",
    )
    out = await planner_pipeline.augment_allocation(allocation, tenant.id, db_session)
    assert out.team[0].move_recommended is False


async def test_create_demand_surfaces_move_when_humans_busy(client, db_session, dev_identity):
    """Seed every bench human as busy; any allocated human must carry a move signal."""
    tenant, _user = dev_identity
    humans = [
        r for r in RESOURCE_POOL
        if r["seniority"] not in {"agent", "partner"}
    ]
    for r in humans:
        db_session.add(_busy_member(tenant.id, r["name"]))
    await db_session.commit()

    body = await create_demand(client)
    team = body["allocation"]["team"]
    human_members = [m for m in team if m.get("seniority") not in {"agent", "partner"}]
    # Every allocated human matches a busy bench member -> move recommended.
    for m in human_members:
        assert m["move_recommended"] is True
        assert m["currently_allocated_to"]
