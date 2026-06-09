"""Role-based client/manager/team portal routes."""

from __future__ import annotations

import asyncio
import uuid
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.auth import AuthContext, require_auth
from app.db import DemandRepository, get_session
from app.db.models import PortalMessage, PortalRequest, TeamMember
from app.db.vector import ReuseDetector
from app.llm import get_provider, model_router
from app.planner import planner_pipeline
from app.planner.allocation import RESOURCE_POOL
from app.schemas import DemandStage

router = APIRouter(prefix="/api/portal", tags=["portal"])

PLANNER_STEP_TIMEOUT_SECONDS = 4.0


def _format_skill(skill: str) -> str:
    return skill.replace("_", " ")


def _resource_experience(resource: dict) -> str:
    seniority = str(resource.get("seniority", "senior"))
    if seniority == "agent":
        return "AI agent"
    if seniority == "partner":
        return "Partner vendor"
    if seniority == "principal":
        return "12+ yrs"
    return "7 yrs"


def _resource_ai_readiness(resource: dict) -> str:
    seniority = str(resource.get("seniority", "senior"))
    title = str(resource.get("title", "")).lower()
    skills = " ".join(resource.get("skills", [])).lower()
    if seniority == "agent" or "ai" in title or "llm" in skills or "agents" in skills:
        return "advanced"
    if seniority == "partner":
        return "active"
    return "active"


def _resource_availability(resource: dict) -> str:
    seniority = str(resource.get("seniority", "senior"))
    if seniority == "agent":
        return "100%"
    if seniority == "partner":
        return "35%"
    if seniority == "principal":
        return "55%"
    return "65%"


def _resource_assignment(resource: dict) -> str:
    seniority = str(resource.get("seniority", "senior"))
    if seniority == "agent":
        return "AI agent bench"
    if seniority == "partner":
        return "Partner bench"
    return "Available"


def _team_seed_from_resource(resource: dict) -> dict:
    return {
        "name": resource["name"],
        "role": resource["title"],
        "experience": _resource_experience(resource),
        "ai_readiness": _resource_ai_readiness(resource),
        "skills": ", ".join(_format_skill(skill) for skill in resource["skills"]),
        "availability": _resource_availability(resource),
        "current_project": _resource_assignment(resource),
    }


DEFAULT_TEAM = [_team_seed_from_resource(resource) for resource in RESOURCE_POOL]


def _default_team_backfill(existing_names: set[str], current_count: int) -> list[dict]:
    additions: list[dict] = []
    seen = {name.lower() for name in existing_names}
    for member in DEFAULT_TEAM:
        if current_count + len(additions) >= len(DEFAULT_TEAM):
            break
        name = member["name"].lower()
        if name in seen:
            continue
        additions.append(member)
        seen.add(name)
    return additions


class PortalClient(BaseModel):
    name: str
    email: str
    company: str
    role: str = "client"


class PortalRequestCreate(BaseModel):
    client: PortalClient
    description: str
    industry: Optional[str] = None
    priority: Optional[str] = None
    timeline: Optional[str] = None
    budget_range: Optional[str] = None


class PortalRequestPatch(BaseModel):
    status: Optional[str] = None
    plan: Optional[dict] = None
    approved_team: Optional[list[str]] = None


class PortalMessageCreate(BaseModel):
    author: str
    role: str = "manager"
    body: str
    status: Optional[str] = None


class PortalAgentChat(BaseModel):
    message: str
    author: str = "Delivery Manager"


class TeamMemberBody(BaseModel):
    name: str
    role: str
    experience: str = "Not set"
    ai_readiness: str = "learning"
    skills: str = "General delivery"
    availability: str = "50%"
    current_project: str = "Available"


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _demand_text(body: PortalRequestCreate) -> str:
    lines = [
        f"Client: {body.client.name} ({body.client.company}, {body.client.email})",
    ]
    if body.industry:
        lines.append(f"Industry: {body.industry}")
    if body.priority:
        lines.append(f"Priority: {body.priority}")
    if body.timeline:
        lines.append(f"Timeline: {body.timeline}")
    if body.budget_range:
        lines.append(f"Budget range: {body.budget_range}")
    lines.append(f"Requirement: {body.description}")
    return "\n".join(lines)


def _enum_value(value, fallback: str) -> str:
    if value is None:
        return fallback
    return str(getattr(value, "value", value) or fallback)


def _inferred_metadata(body: PortalRequestCreate, understanding) -> dict[str, str]:
    return {
        "industry": body.industry or _enum_value(getattr(understanding, "domain", None), "AI inferred"),
        "priority": body.priority or _enum_value(getattr(understanding, "urgency", None), "medium"),
        "timeline": body.timeline or "AI inferred",
        "budget_range": body.budget_range or "Not specified",
    }


@router.get("/requests")
async def list_portal_requests(
    ctx: AuthContext = Depends(require_auth),
    session: AsyncSession = Depends(get_session),
) -> list[dict]:
    rows = list((await session.execute(
        select(PortalRequest)
        .options(selectinload(PortalRequest.messages))
        .where(PortalRequest.tenant_id == ctx.tenant_id)
        .order_by(PortalRequest.created_at.desc())
    )).scalars())
    return [_serialize_request(row) for row in rows]


@router.post("/requests")
async def create_portal_request(
    body: PortalRequestCreate,
    ctx: AuthContext = Depends(require_auth),
    session: AsyncSession = Depends(get_session),
) -> dict:
    text = _demand_text(body)
    ingested = await planner_pipeline.ingest(text, source="portal")
    repo = DemandRepository(session)
    demand = await repo.create(
        tenant_id=ctx.tenant_id,
        public_id=ingested["demand_id"],
        raw_text=text,
        source="portal",
        created_by=ctx.user_id,
    )
    await repo.update_stage(demand.id, DemandStage.UNDERSTANDING.value)
    await session.flush()

    understanding = await _understand_with_timeout(text)
    try:
        reuse_score, similar = await asyncio.wait_for(
            ReuseDetector(session).find_similar(
                tenant_id=ctx.tenant_id,
                demand_text=text,
            ),
            timeout=PLANNER_STEP_TIMEOUT_SECONDS,
        )
    except Exception:
        reuse_score, similar = 0.0, []
    decision = await _decide_with_timeout(understanding, reuse_score)
    allocation = await planner_pipeline.allocate(understanding, decision)
    metadata = _inferred_metadata(body, understanding)
    plan = {
        "understanding": understanding.model_dump(mode="json"),
        "decision": decision.model_dump(mode="json"),
        "allocation": allocation.model_dump(mode="json"),
        "similar": similar,
        "reuse_score": reuse_score,
    }

    await repo.update_stage(
        demand.id,
        DemandStage.AWAITING_APPROVAL.value,
        understanding=plan["understanding"],
        decision=plan["decision"],
        allocation=plan["allocation"],
        similar_projects={"matches": similar},
        reuse_score=reuse_score,
    )

    request = PortalRequest(
        tenant_id=ctx.tenant_id,
        demand_id=demand.id,
        public_id=demand.public_id,
        client_name=body.client.name,
        client_email=body.client.email,
        client_company=body.client.company,
        industry=metadata["industry"],
        priority=metadata["priority"],
        timeline=metadata["timeline"],
        budget_range=metadata["budget_range"],
        description=body.description,
        status="ai_processed",
        source="api",
        plan=plan,
        approved_team=[],
        created_at=_now(),
        updated_at=_now(),
    )
    session.add(request)
    await session.flush()
    session.add_all([
        PortalMessage(
            tenant_id=ctx.tenant_id,
            request_id=request.id,
            author=body.client.name,
            role="client",
            body=body.description,
            created_at=_now(),
        ),
        PortalMessage(
            tenant_id=ctx.tenant_id,
            request_id=request.id,
            author="Agent",
            role="agent",
            body=(
                "I processed the client request into a structured brief, "
                "recommendation, fulfillment route, and suggested team for manager review."
            ),
            created_at=_now(),
        ),
    ])
    await session.commit()
    saved = await _get_request(session, ctx.tenant_id, request.id)
    return _serialize_request(saved)


@router.patch("/requests/{request_id}")
async def patch_portal_request(
    request_id: uuid.UUID,
    body: PortalRequestPatch,
    ctx: AuthContext = Depends(require_auth),
    session: AsyncSession = Depends(get_session),
) -> dict:
    request = await _get_request(session, ctx.tenant_id, request_id)
    if body.status is not None:
        request.status = body.status
    if body.plan is not None:
        request.plan = body.plan
    if body.approved_team is not None:
        request.approved_team = body.approved_team
    request.updated_at = _now()
    await session.commit()
    saved = await _get_request(session, ctx.tenant_id, request.id)
    return _serialize_request(saved)


@router.post("/requests/{request_id}/messages")
async def add_portal_message(
    request_id: uuid.UUID,
    body: PortalMessageCreate,
    ctx: AuthContext = Depends(require_auth),
    session: AsyncSession = Depends(get_session),
) -> dict:
    request = await _get_request(session, ctx.tenant_id, request_id)
    if body.status:
        request.status = body.status
    request.updated_at = _now()
    session.add(PortalMessage(
        tenant_id=ctx.tenant_id,
        request_id=request.id,
        author=body.author,
        role=body.role,
        body=body.body,
        created_at=_now(),
    ))
    await session.commit()
    saved = await _get_request(session, ctx.tenant_id, request.id)
    return _serialize_request(saved)


@router.post("/requests/{request_id}/agent-chat")
async def portal_agent_chat(
    request_id: uuid.UUID,
    body: PortalAgentChat,
    ctx: AuthContext = Depends(require_auth),
    session: AsyncSession = Depends(get_session),
) -> dict:
    request = await _get_request(session, ctx.tenant_id, request_id)
    prompt = (
        "You are the manager's AI delivery copilot. Be concise and concrete.\n\n"
        f"Client: {request.client_company}\n"
        f"Industry: {request.industry}\n"
        f"Request: {request.description}\n"
        f"Plan: {request.plan}\n\n"
        f"Manager question: {body.message}"
    )
    try:
        routed = model_router.resolve("planner")
        provider = get_provider(routed.provider)
        answer = await asyncio.wait_for(
            provider.chat(
                [
                    {"role": "system", "content": "You help managers review AI demand intake and delivery staffing."},
                    {"role": "user", "content": prompt},
                ],
                model=routed.model,
                temperature=0.25,
                max_tokens=900,
            ),
            timeout=PLANNER_STEP_TIMEOUT_SECONDS,
        )
    except Exception:
        answer = _agent_fallback(request, body.message)

    session.add_all([
        PortalMessage(
            tenant_id=ctx.tenant_id,
            request_id=request.id,
            author=body.author,
            role="manager",
            body=body.message,
            created_at=_now(),
        ),
        PortalMessage(
            tenant_id=ctx.tenant_id,
            request_id=request.id,
            author="Agent",
            role="agent",
            body=answer,
            created_at=_now(),
        ),
    ])
    request.updated_at = _now()
    await session.commit()
    saved = await _get_request(session, ctx.tenant_id, request.id)
    return {"response": answer, "request": _serialize_request(saved)}


@router.get("/team")
async def list_team(
    ctx: AuthContext = Depends(require_auth),
    session: AsyncSession = Depends(get_session),
) -> list[dict]:
    await _ensure_team(session, ctx.tenant_id)
    rows = list((await session.execute(
        select(TeamMember)
        .where(TeamMember.tenant_id == ctx.tenant_id)
        .order_by(TeamMember.created_at.desc())
    )).scalars())
    return [_serialize_team(row) for row in rows]


@router.post("/team")
async def create_team_member(
    body: TeamMemberBody,
    ctx: AuthContext = Depends(require_auth),
    session: AsyncSession = Depends(get_session),
) -> dict:
    row = TeamMember(tenant_id=ctx.tenant_id, **body.model_dump())
    session.add(row)
    await session.commit()
    return _serialize_team(row)


@router.put("/team/{member_id}")
async def update_team_member(
    member_id: uuid.UUID,
    body: TeamMemberBody,
    ctx: AuthContext = Depends(require_auth),
    session: AsyncSession = Depends(get_session),
) -> dict:
    row = (await session.execute(
        select(TeamMember)
        .where(TeamMember.id == member_id)
        .where(TeamMember.tenant_id == ctx.tenant_id)
    )).scalar_one_or_none()
    if not row:
        raise HTTPException(status_code=404, detail="Team member not found")
    for key, value in body.model_dump().items():
        setattr(row, key, value)
    row.updated_at = _now()
    await session.commit()
    return _serialize_team(row)


async def _get_request(session: AsyncSession, tenant_id, request_id: uuid.UUID) -> PortalRequest:
    request = (await session.execute(
        select(PortalRequest)
        .options(selectinload(PortalRequest.messages))
        .where(PortalRequest.id == request_id)
        .where(PortalRequest.tenant_id == tenant_id)
        .execution_options(populate_existing=True)
    )).scalar_one_or_none()
    if not request:
        raise HTTPException(status_code=404, detail="Portal request not found")
    return request


async def _ensure_team(session: AsyncSession, tenant_id) -> None:
    existing_rows = list((await session.execute(
        select(TeamMember.name).where(TeamMember.tenant_id == tenant_id)
    )).scalars())
    additions = _default_team_backfill(set(existing_rows), len(existing_rows))
    if not additions:
        return
    for member in additions:
        session.add(TeamMember(tenant_id=tenant_id, **member))
    await session.commit()


async def _understand_with_timeout(text: str):
    try:
        return await asyncio.wait_for(
            planner_pipeline.understand(text),
            timeout=PLANNER_STEP_TIMEOUT_SECONDS,
        )
    except Exception:
        return planner_pipeline.understanding._heuristic(text)


async def _decide_with_timeout(understanding, reuse_score: float):
    try:
        return await asyncio.wait_for(
            planner_pipeline.decide(understanding, reuse_score),
            timeout=PLANNER_STEP_TIMEOUT_SECONDS,
        )
    except Exception:
        return planner_pipeline.decision._rule_based(understanding, reuse_score)


def _serialize_request(row: PortalRequest) -> dict:
    plan = row.plan or {}
    return {
        "id": str(row.id),
        "publicId": row.public_id,
        "client": {
            "role": "client",
            "name": row.client_name,
            "email": row.client_email,
            "company": row.client_company,
        },
        "industry": row.industry,
        "priority": row.priority,
        "timeline": row.timeline,
        "budgetRange": row.budget_range,
        "description": row.description,
        "status": row.status,
        "createdAt": row.created_at.isoformat() if row.created_at else None,
        "updatedAt": row.updated_at.isoformat() if row.updated_at else None,
        "source": row.source,
        "plan": {
            "publicId": row.public_id,
            "understanding": plan.get("understanding"),
            "decision": plan.get("decision"),
            "allocation": plan.get("allocation"),
            "similar": plan.get("similar", []),
            "reuseScore": plan.get("reuse_score", 0),
        },
        "messages": [
            {
                "id": str(message.id),
                "author": message.author,
                "role": message.role,
                "body": message.body,
                "createdAt": message.created_at.isoformat() if message.created_at else None,
            }
            for message in sorted(row.messages, key=lambda item: item.created_at)
        ],
        "approvedTeam": row.approved_team or [],
    }


def _serialize_team(row: TeamMember) -> dict:
    return {
        "id": str(row.id),
        "name": row.name,
        "role": row.role,
        "experience": row.experience,
        "aiReadiness": row.ai_readiness,
        "skills": row.skills,
        "availability": row.availability,
        "currentProject": row.current_project,
    }


def _agent_fallback(request: PortalRequest, message: str) -> str:
    team = (request.plan or {}).get("allocation", {}).get("team", [])
    top = ", ".join(member.get("name", "resource") for member in team[:3]) or "the suggested team"
    return (
        f"For this {request.industry} request, keep the current route unless the client changes scope. "
        f"The immediate manager action is to validate acceptance criteria, confirm timeline ({request.timeline}), "
        f"and review staffing around {top}. Question noted: {message}"
    )
