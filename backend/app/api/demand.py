"""Demand & pipeline routes — the front-door for the user's intent."""

from __future__ import annotations

import asyncio
import uuid
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import AuthContext, require_auth
from app.config import settings
from app.db import (
    AgentRunRepository,
    AsyncSessionLocal,
    CommitRepository,
    DemandRepository,
    EmailLogRepository,
    get_session,
)
from app.db.models import DemandRequest
from app.db.vector import ReuseDetector
from app.llm import get_provider, model_router
from app.notifications import EmailMessage, notify, send_email
from app.planner import planner_pipeline
from app.queue.worker import WorkerSettings, enqueue_pipeline
from app.schemas import DemandStage

router = APIRouter(prefix="/api", tags=["demand"])


class DemandCreate(BaseModel):
    text: str


class ClarifyRequest(BaseModel):
    text: str


class ConverseTurn(BaseModel):
    role: str
    content: str


class ConverseRequest(BaseModel):
    text: str
    history: list[ConverseTurn] = []
    message: str


class ClarifyAnswer(BaseModel):
    question_id: str
    question: str
    answer: str


class DemandCreateWithAnswers(BaseModel):
    text: str
    clarifications: Optional[list[ClarifyAnswer]] = None


class DecisionConfirm(BaseModel):
    approve: bool = True


class ManagerChatTurn(BaseModel):
    role: str
    content: str


class ManagerChatBody(BaseModel):
    message: str
    history: Optional[list[ManagerChatTurn]] = None


@router.post("/demands/clarify")
async def clarify_demand(
    body: ClarifyRequest,
    ctx: AuthContext = Depends(require_auth),
) -> dict:
    """Generate AI follow-up questions based on the demand text to gather
    more detail before running the full planning pipeline."""
    if not body.text.strip():
        raise HTTPException(400, "Demand text is required")
    result = await planner_pipeline.clarify(body.text)
    return result


@router.post("/demands/converse")
async def converse_demand(
    body: ConverseRequest,
    ctx: AuthContext = Depends(require_auth),
) -> dict:
    """Multi-turn conversation: the AI responds to the client's latest
    message, acknowledges their input, and asks follow-up questions if
    there are still gaps in the requirement."""
    if not body.text.strip():
        raise HTTPException(400, "Demand text is required")
    if not body.message.strip():
        raise HTTPException(400, "Message is required")
    history = [{"role": t.role, "content": t.content} for t in body.history]
    result = await planner_pipeline.converse(body.text, history, body.message)
    return result


def _enrich_with_answers(text: str, answers: list[ClarifyAnswer]) -> str:
    """Append clarification Q&A to the original demand text so the full
    pipeline benefits from the extra context."""
    if not answers:
        return text
    qa_block = "\n\n--- Additional Details (from clarification) ---\n"
    for a in answers:
        qa_block += f"\nQ: {a.question}\nA: {a.answer}\n"
    return text + qa_block


@router.post("/demands")
async def create_demand(
    body: DemandCreateWithAnswers,
    ctx: AuthContext = Depends(require_auth),
    session: AsyncSession = Depends(get_session),
) -> dict:
    """Run ingestion + understanding + decision + allocation synchronously,
    then return the full plan so the UI can show 'awaiting approval'."""
    enriched_text = _enrich_with_answers(body.text, body.clarifications or [])

    repo = DemandRepository(session)
    ingested = await planner_pipeline.ingest(enriched_text)
    demand = await repo.create(
        tenant_id=ctx.tenant_id,
        public_id=ingested["demand_id"],
        raw_text=enriched_text,
        created_by=ctx.user_id,
    )
    await repo.update_stage(demand.id, DemandStage.UNDERSTANDING.value)
    await session.commit()

    understanding = await planner_pipeline.understand(enriched_text)
    detector = ReuseDetector(session)
    reuse_score, similar = await detector.find_similar(
        tenant_id=ctx.tenant_id, demand_text=enriched_text
    )
    decision = await planner_pipeline.decide(understanding, reuse_score)
    allocation = await planner_pipeline.allocate(understanding, decision)
    allocation = await planner_pipeline.augment_allocation(
        allocation, ctx.tenant_id, session
    )

    await repo.update_stage(
        demand.id,
        DemandStage.AWAITING_APPROVAL.value,
        understanding=understanding.model_dump(mode="json"),
        decision=decision.model_dump(mode="json"),
        allocation=allocation.model_dump(mode="json"),
        similar_projects={"matches": similar},
        reuse_score=reuse_score,
    )

    await notify(
        session,
        tenant_id=ctx.tenant_id,
        user_id=demand.assigned_manager_id,
        kind="approval_needed",
        title=f"Demand {demand.public_id} awaiting approval",
        body=(
            f"A new demand is ready for manager review "
            f"({understanding.complexity.value} {understanding.problem_type.value}, "
            f"{decision.execution_mode.value} route)."
        ),
        entity_kind="demand",
        entity_id=demand.public_id,
    )
    await session.commit()

    return {
        "demand_id": demand.public_id,
        "stage": DemandStage.AWAITING_APPROVAL.value,
        "understanding": understanding.model_dump(mode="json"),
        "decision": decision.model_dump(mode="json"),
        "allocation": allocation.model_dump(mode="json"),
        "similar_projects": similar,
        "reuse_score": reuse_score,
    }


@router.post("/demands/{public_id}/approve")
async def approve_demand(
    public_id: str,
    _body: DecisionConfirm,
    ctx: AuthContext = Depends(require_auth),
    session: AsyncSession = Depends(get_session),
) -> dict:
    """Hand the demand off to the background worker for execution."""
    repo = DemandRepository(session)
    demand = await repo.get_by_public_id(ctx.tenant_id, public_id)
    if not demand:
        raise HTTPException(404, "Demand not found")
    if demand.stage not in (DemandStage.AWAITING_APPROVAL.value, DemandStage.FAILED.value):
        return {"demand_id": public_id, "stage": demand.stage}

    await repo.update_stage(demand.id, DemandStage.EXECUTING.value)
    await notify(
        session,
        tenant_id=ctx.tenant_id,
        user_id=demand.assigned_manager_id,
        kind="approved",
        title=f"Demand {public_id} approved — production started",
        body="The plan was approved and the delivery pipeline is now executing.",
        entity_kind="demand",
        entity_id=public_id,
    )
    await session.commit()

    await enqueue_pipeline(WorkerSettings.redis_settings, str(demand.id), str(ctx.tenant_id))
    return {"demand_id": public_id, "stage": DemandStage.EXECUTING.value}


@router.post("/demands/{public_id}/manager-chat")
async def manager_chat(
    public_id: str,
    body: ManagerChatBody,
    ctx: AuthContext = Depends(require_auth),
    session: AsyncSession = Depends(get_session),
) -> dict:
    demand = await DemandRepository(session).get_by_public_id(ctx.tenant_id, public_id)
    if not demand:
        raise HTTPException(404, "Demand not found")
    message = body.message.strip()
    if not message:
        raise HTTPException(400, "Message is required")

    try:
        routed = model_router.resolve("planner")
        provider = get_provider(routed.provider)
        history = [
            {"role": turn.role if turn.role in {"user", "assistant"} else "user", "content": turn.content}
            for turn in (body.history or [])[-8:]
            if turn.content.strip()
        ]
        response = await asyncio.wait_for(
            provider.chat(
                [
                    {"role": "system", "content": _manager_chat_system()},
                    {"role": "user", "content": _manager_chat_context(demand)},
                    *history,
                    {"role": "user", "content": message},
                ],
                model=routed.model,
                temperature=0.25,
                max_tokens=900,
            ),
            timeout=12,
        )
    except Exception:
        response = _manager_chat_fallback(demand, message)
    return {"response": response}


@router.get("/demands")
async def list_demands(
    stage: Optional[str] = None,
    sort: str = "created_at",
    order: str = "desc",
    limit: int = 50,
    offset: int = 0,
    search: Optional[str] = None,
    ctx: AuthContext = Depends(require_auth),
    session: AsyncSession = Depends(get_session),
):
    from sqlalchemy import func as sqlfunc
    q = select(DemandRequest).where(DemandRequest.tenant_id == ctx.tenant_id)
    count_q = select(sqlfunc.count()).select_from(DemandRequest).where(DemandRequest.tenant_id == ctx.tenant_id)

    if stage:
        q = q.where(DemandRequest.stage == stage)
        count_q = count_q.where(DemandRequest.stage == stage)
    if search:
        pattern = f"%{search}%"
        filt = DemandRequest.raw_text.ilike(pattern) | DemandRequest.public_id.ilike(pattern)
        q = q.where(filt)
        count_q = count_q.where(filt)

    sort_col = getattr(DemandRequest, sort, DemandRequest.created_at)
    q = q.order_by(sort_col.desc() if order == "desc" else sort_col.asc())
    q = q.limit(limit).offset(offset)

    total = (await session.execute(count_q)).scalar() or 0
    rows = (await session.execute(q)).scalars().all()
    return {
        "items": [_serialize(r) for r in rows],
        "total": total,
        "limit": limit,
        "offset": offset,
        "has_more": (offset + limit) < total,
    }


@router.get("/demands/{public_id}")
async def get_demand(
    public_id: str,
    ctx: AuthContext = Depends(require_auth),
    session: AsyncSession = Depends(get_session),
) -> dict:
    demand = await DemandRepository(session).get_by_public_id(ctx.tenant_id, public_id)
    if not demand:
        raise HTTPException(404, "Demand not found")
    runs = await AgentRunRepository(session).list_for_demand(demand.id)
    payload = _serialize(demand)
    payload["agent_runs"] = [
        {
            "id": str(r.id),
            "agent_id": r.agent_id,
            "task_title": r.task_title,
            "status": r.status,
            "progress": r.progress,
            "model_used": r.model_used,
            "started_at": r.started_at.isoformat() if r.started_at else None,
            "completed_at": r.completed_at.isoformat() if r.completed_at else None,
        }
        for r in runs
    ]
    return payload


async def _load(session: AsyncSession, tenant_id, public_id: str) -> DemandRequest:
    d = await DemandRepository(session).get_by_public_id(tenant_id, public_id)
    if not d:
        raise HTTPException(404, "Demand not found")
    return d


def _serialize(d: DemandRequest) -> dict:
    return {
        "id": str(d.id),
        "public_id": d.public_id,
        "stage": d.stage,
        "raw_text": d.raw_text,
        "understanding": d.understanding,
        "decision": d.decision,
        "allocation": d.allocation,
        "similar_projects": d.similar_projects,
        "reuse_score": d.reuse_score,
        "explanation": d.explanation,
        "artifacts_prefix": d.artifacts_prefix,
        "preview_url": d.preview_url,
        "error": d.error,
        "created_at": d.created_at.isoformat() if d.created_at else None,
        "completed_at": d.completed_at.isoformat() if d.completed_at else None,
    }


def _manager_chat_system() -> str:
    return (
        "You are ForgeOS's manager planning copilot. Help a delivery manager "
        "evaluate one AI demand. Be concise, practical, and specific. Focus on "
        "scope, risks, team, approval readiness, sequencing, client questions, "
        "and tradeoffs. Do not invent facts outside the provided demand context."
    )


def _manager_chat_context(demand: DemandRequest) -> str:
    return "\n".join([
        "[Demand Context]",
        f"ID: {demand.public_id}",
        f"Stage: {demand.stage}",
        f"Raw demand:\n{demand.raw_text}",
        f"Understanding: {demand.understanding or {}}",
        f"Decision: {demand.decision or {}}",
        f"Allocation: {demand.allocation or {}}",
        f"Reuse score: {demand.reuse_score}",
        f"Similar projects: {demand.similar_projects or {}}",
        f"Explanation: {demand.explanation or ''}",
    ])


def _manager_chat_fallback(demand: DemandRequest, message: str) -> str:
    understanding = demand.understanding or {}
    decision = demand.decision or {}
    allocation = demand.allocation or {}
    team = allocation.get("team") or []
    risks = decision.get("risk_factors") or []
    action = "review scope and approve launch" if demand.stage == DemandStage.AWAITING_APPROVAL.value else "review the current stage before changing execution"
    return (
        f"For demand {demand.public_id}, the immediate manager action is to {action}. "
        f"The AI classified it as {understanding.get('complexity', 'unknown')} "
        f"{understanding.get('problem_type', 'work')} with "
        f"{decision.get('execution_mode', 'an execution route')} delivery. "
        f"Suggested staffing includes {len(team)} resource(s). "
        f"Key risks: {', '.join(risks[:3]) if risks else 'no major risks listed'}. "
        f"Question noted: {message}"
    )


__all__ = ["_manager_chat_context", "_manager_chat_fallback"]


# ── Demand lifecycle management endpoints ──────────────────────────────

class StageChangeRequest(BaseModel):
    stage: str
    reason: Optional[str] = None

class ReassignRequest(BaseModel):
    field: str  # assigned_manager_id | assigned_leader_id | assigned_middleware_id
    user_id: str
    reason: Optional[str] = None


@router.patch("/demands/{public_id}/stage")
async def change_demand_stage(
    public_id: str,
    body: StageChangeRequest,
    ctx: AuthContext = Depends(require_auth),
    session: AsyncSession = Depends(get_session),
):
    """Update a demand's stage with reason tracking."""
    d = await _load(session, ctx.tenant_id, public_id)
    prev_stage = d.stage
    d.stage = body.stage
    await session.flush()

    from app.db.models import AuditEvent
    audit = AuditEvent(
        tenant_id=ctx.tenant_id,
        entity_kind="demand",
        entity_id=str(d.id),
        actor_id=ctx.user_id,
        action="stage_changed",
        diff={"stage": {"before": prev_stage, "after": body.stage}},
        reason=body.reason,
    )
    session.add(audit)
    await session.commit()

    return {"status": "ok", "public_id": d.public_id, "stage": d.stage}


@router.patch("/demands/{public_id}/reassign")
async def reassign_demand(
    public_id: str,
    body: ReassignRequest,
    ctx: AuthContext = Depends(require_auth),
    session: AsyncSession = Depends(get_session),
):
    """Reassign a demand to a different manager/leader/middleware with reason."""
    d = await _load(session, ctx.tenant_id, public_id)
    allowed_fields = {"assigned_manager_id", "assigned_leader_id", "assigned_middleware_id"}
    if body.field not in allowed_fields:
        raise HTTPException(400, f"field must be one of: {allowed_fields}")

    prev_val = str(getattr(d, body.field)) if getattr(d, body.field) else None
    setattr(d, body.field, uuid.UUID(body.user_id))
    await session.flush()

    from app.db.models import AuditEvent
    audit = AuditEvent(
        tenant_id=ctx.tenant_id,
        entity_kind="demand",
        entity_id=str(d.id),
        actor_id=ctx.user_id,
        action="reassigned",
        diff={body.field: {"before": prev_val, "after": body.user_id}},
        reason=body.reason,
    )
    session.add(audit)

    role_label = body.field.replace("assigned_", "").replace("_id", "")
    await notify(
        session,
        tenant_id=ctx.tenant_id,
        user_id=uuid.UUID(body.user_id),
        kind="assignment",
        title=f"You are now the {role_label} for {d.public_id}",
        body=body.reason or f"You have been assigned as {role_label} on demand {d.public_id}.",
        entity_kind="demand",
        entity_id=d.public_id,
    )
    await session.commit()

    return {"status": "ok", "public_id": d.public_id, "field": body.field}


# ── Live-link sharing (email to client) ────────────────────────────────

class ShareLinkRequest(BaseModel):
    client_email: str
    link: Optional[str] = None
    message: Optional[str] = None


@router.post("/demands/{public_id}/share-link")
async def share_live_link(
    public_id: str,
    body: ShareLinkRequest,
    ctx: AuthContext = Depends(require_auth),
    session: AsyncSession = Depends(get_session),
) -> dict:
    """Email the client a live progress link and persist it on the demand."""
    d = await _load(session, ctx.tenant_id, public_id)
    link = (body.link or "").strip() or f"{settings.public_base_url}/demand/{public_id}/preview"
    d.preview_url = link
    await session.flush()

    subject = f"Live progress link for your project ({public_id})"
    text = (
        f"Hello,\n\n{body.message.strip() if body.message else 'You can follow the live progress of your project here:'}"
        f"\n\n{link}\n\nRegards,\nForgeOS Delivery"
    )
    result = send_email(EmailMessage(to=body.client_email, subject=subject, body=text))

    log = await EmailLogRepository(session).create(
        tenant_id=ctx.tenant_id,
        to_email=body.client_email,
        subject=subject,
        body=text,
        demand_id=d.id,
        kind="share_link",
        provider=result["provider"],
        delivered=result["delivered"],
    )
    await session.commit()

    return {
        "status": "ok",
        "public_id": public_id,
        "preview_url": link,
        "email": {
            "id": str(log.id),
            "to": log.to_email,
            "delivered": log.delivered,
            "provider": log.provider,
        },
    }


@router.get("/demands/{public_id}/emails")
async def list_demand_emails(
    public_id: str,
    ctx: AuthContext = Depends(require_auth),
    session: AsyncSession = Depends(get_session),
) -> dict:
    d = await _load(session, ctx.tenant_id, public_id)
    rows = await EmailLogRepository(session).list_for_demand(d.id)
    return {
        "items": [
            {
                "id": str(e.id),
                "to": e.to_email,
                "subject": e.subject,
                "body": e.body,
                "kind": e.kind,
                "provider": e.provider,
                "delivered": e.delivered,
                "created_at": e.created_at.isoformat() if e.created_at else None,
            }
            for e in rows
        ]
    }


# ── Commit tracking (human + agent commits during production) ──────────

class CommitCreate(BaseModel):
    sha: str
    author: str
    message: str
    files_changed: int = 0
    branch: str = "main"
    is_agent: bool = False
    task_public_id: Optional[str] = None


@router.post("/demands/{public_id}/commits")
async def add_commit(
    public_id: str,
    body: CommitCreate,
    ctx: AuthContext = Depends(require_auth),
    session: AsyncSession = Depends(get_session),
) -> dict:
    d = await _load(session, ctx.tenant_id, public_id)
    task_uuid = None
    if body.task_public_id:
        from app.db.repositories import TaskRepository

        task = await TaskRepository(session).get_by_public_id(body.task_public_id)
        task_uuid = task.id if task else None

    commit = await CommitRepository(session).create(
        tenant_id=ctx.tenant_id,
        demand_id=d.id,
        sha=body.sha,
        author=body.author,
        message=body.message,
        files_changed=body.files_changed,
        branch=body.branch,
        is_agent=body.is_agent,
        task_id=task_uuid,
    )
    await session.commit()
    return {
        "id": str(commit.id),
        "sha": commit.sha,
        "author": commit.author,
        "message": commit.message,
        "files_changed": commit.files_changed,
        "branch": commit.branch,
        "is_agent": commit.is_agent,
        "created_at": commit.created_at.isoformat() if commit.created_at else None,
    }


@router.get("/demands/{public_id}/commits")
async def list_commits(
    public_id: str,
    ctx: AuthContext = Depends(require_auth),
    session: AsyncSession = Depends(get_session),
) -> dict:
    d = await _load(session, ctx.tenant_id, public_id)
    rows = await CommitRepository(session).list_for_demand(d.id)
    return {
        "items": [
            {
                "id": str(c.id),
                "sha": c.sha,
                "author": c.author,
                "message": c.message,
                "files_changed": c.files_changed,
                "branch": c.branch,
                "is_agent": c.is_agent,
                "created_at": c.created_at.isoformat() if c.created_at else None,
            }
            for c in rows
        ]
    }


# ── Team editing (add/remove members, trainers, AI-learners) ───────────

class TeamMemberEntry(BaseModel):
    name: str
    title: Optional[str] = None
    resource_type: str = "backend_engineer"
    seniority: Optional[str] = "senior"
    skills: list[str] = []
    cost_per_day: float = 0.0
    allocation_percentage: float = 1.0
    kind: str = "member"  # member | trainer | learner


class TeamEditRequest(BaseModel):
    add: Optional[list[TeamMemberEntry]] = None
    remove: Optional[list[str]] = None  # names to remove
    reason: Optional[str] = None


@router.get("/demands/team/catalog")
async def team_catalog(
    _ctx: AuthContext = Depends(require_auth),
) -> dict:
    """Resources a manager can add to a plan (bench + trainers + AI-learners)."""
    from app.planner.allocation import addable_catalog

    return {"items": addable_catalog()}


@router.patch("/demands/{public_id}/team")
async def edit_demand_team(
    public_id: str,
    body: TeamEditRequest,
    ctx: AuthContext = Depends(require_auth),
    session: AsyncSession = Depends(get_session),
) -> dict:
    """Add or remove team members (incl. trainers / AI-learners) on a plan."""
    d = await _load(session, ctx.tenant_id, public_id)
    allocation = dict(d.allocation or {})
    team: list[dict] = list(allocation.get("team") or [])

    removed: list[str] = []
    if body.remove:
        remove_set = {n.strip().lower() for n in body.remove}
        kept = [m for m in team if m.get("name", "").strip().lower() not in remove_set]
        removed = [m.get("name") for m in team if m.get("name", "").strip().lower() in remove_set]
        team = kept

    added: list[str] = []
    if body.add:
        existing = {m.get("name", "").strip().lower() for m in team}
        for entry in body.add:
            if entry.name.strip().lower() in existing:
                continue
            team.append({
                "resource_type": entry.resource_type,
                "name": entry.name,
                "title": entry.title,
                "seniority": entry.seniority,
                "allocation_percentage": entry.allocation_percentage,
                "skills": entry.skills,
                "cost_per_day": entry.cost_per_day,
                "match_score": 0.0,
                "reason": f"Added by manager ({entry.kind})",
                "kind": entry.kind,
                "currently_allocated_to": None,
                "move_recommended": False,
                "move_probability": 0.0,
                "move_importance": None,
                "move_rationale": None,
            })
            added.append(entry.name)

    allocation["team"] = team
    allocation["total_daily_cost"] = round(
        sum((m.get("cost_per_day", 0) or 0) * (m.get("allocation_percentage", 1) or 1) for m in team), 2
    )
    d.allocation = allocation
    await session.flush()

    from app.db.models import AuditEvent

    session.add(AuditEvent(
        tenant_id=ctx.tenant_id,
        entity_kind="demand",
        entity_id=str(d.id),
        actor_id=ctx.user_id,
        action="team_edited",
        diff={"added": added, "removed": removed},
        reason=body.reason,
    ))
    await notify(
        session,
        tenant_id=ctx.tenant_id,
        user_id=d.assigned_manager_id,
        kind="team_edited",
        title=f"Team updated on {d.public_id}",
        body=(
            f"Added: {', '.join(added) or 'none'}. Removed: {', '.join(removed) or 'none'}."
        ),
        entity_kind="demand",
        entity_id=d.public_id,
    )
    await session.commit()

    return {"status": "ok", "public_id": d.public_id, "allocation": allocation}
