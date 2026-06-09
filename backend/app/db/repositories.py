"""Thin repositories — keep query/IO concerns out of the engines."""

from __future__ import annotations

import secrets
import uuid
from datetime import datetime, timezone
from typing import Optional

from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import (
    AgentRun,
    Artifact,
    AuditEvent,
    Commit,
    DemandRequest,
    EmailLog,
    EmbeddingChunk,
    Notification,
    PastProject,
    Role,
    SwonRecord,
    Task,
    TaskHandoff,
    TaskUpdate,
    UserRoleAssignment,
    WonRecord,
)


class DemandRepository:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    async def create(
        self,
        *,
        tenant_id: uuid.UUID,
        public_id: str,
        raw_text: str,
        source: str = "manual",
        created_by: Optional[uuid.UUID] = None,
    ) -> DemandRequest:
        demand = DemandRequest(
            tenant_id=tenant_id,
            public_id=public_id,
            raw_text=raw_text,
            source=source,
            created_by=created_by,
        )
        self.session.add(demand)
        await self.session.flush()
        return demand

    async def update_stage(self, demand_id: uuid.UUID, stage: str, **fields) -> None:
        await self.session.execute(
            update(DemandRequest)
            .where(DemandRequest.id == demand_id)
            .values(stage=stage, **fields)
        )

    async def get_by_public_id(
        self, tenant_id: uuid.UUID, public_id: str
    ) -> Optional[DemandRequest]:
        stmt = select(DemandRequest).where(
            DemandRequest.tenant_id == tenant_id,
            DemandRequest.public_id == public_id,
        )
        return (await self.session.execute(stmt)).scalar_one_or_none()

    async def list_recent(self, tenant_id: uuid.UUID, limit: int = 50) -> list[DemandRequest]:
        stmt = (
            select(DemandRequest)
            .where(DemandRequest.tenant_id == tenant_id)
            .order_by(DemandRequest.created_at.desc())
            .limit(limit)
        )
        return list((await self.session.execute(stmt)).scalars())


class AgentRunRepository:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    async def create(
        self,
        *,
        tenant_id: uuid.UUID,
        demand_id: uuid.UUID,
        agent_id: str,
        task_title: str,
        model_used: Optional[str] = None,
    ) -> AgentRun:
        run = AgentRun(
            tenant_id=tenant_id,
            demand_id=demand_id,
            agent_id=agent_id,
            task_title=task_title,
            model_used=model_used,
        )
        self.session.add(run)
        await self.session.flush()
        return run

    async def update(self, run_id: uuid.UUID, **fields) -> None:
        await self.session.execute(
            update(AgentRun).where(AgentRun.id == run_id).values(**fields)
        )

    async def list_for_demand(self, demand_id: uuid.UUID) -> list[AgentRun]:
        stmt = (
            select(AgentRun)
            .where(AgentRun.demand_id == demand_id)
            .order_by(AgentRun.created_at.asc())
        )
        return list((await self.session.execute(stmt)).scalars())


class ArtifactRepository:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    async def add_many(self, artifacts: list[Artifact]) -> None:
        self.session.add_all(artifacts)
        await self.session.flush()

    async def list_for_demand(self, demand_id: uuid.UUID) -> list[Artifact]:
        stmt = (
            select(Artifact)
            .where(Artifact.demand_id == demand_id)
            .order_by(Artifact.path.asc())
        )
        return list((await self.session.execute(stmt)).scalars())


class EmbeddingRepository:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    async def add(
        self,
        *,
        tenant_id: uuid.UUID,
        source_kind: str,
        text: str,
        embedding: list[float],
        source_id: Optional[str] = None,
        meta: Optional[dict] = None,
    ) -> EmbeddingChunk:
        chunk = EmbeddingChunk(
            tenant_id=tenant_id,
            source_kind=source_kind,
            text=text,
            embedding=embedding,
            source_id=source_id,
            meta=meta or {},
        )
        self.session.add(chunk)
        await self.session.flush()
        return chunk

    async def similar(
        self,
        *,
        tenant_id: uuid.UUID,
        embedding: list[float],
        source_kind: Optional[str] = None,
        limit: int = 5,
    ) -> list[tuple[EmbeddingChunk, float]]:
        """Return (chunk, distance) ordered by cosine distance ascending."""
        distance = EmbeddingChunk.embedding.cosine_distance(embedding).label("distance")
        stmt = (
            select(EmbeddingChunk, distance)
            .where(EmbeddingChunk.tenant_id == tenant_id)
        )
        if source_kind:
            stmt = stmt.where(EmbeddingChunk.source_kind == source_kind)
        stmt = stmt.order_by("distance").limit(limit)
        result = await self.session.execute(stmt)
        return [(row[0], float(row[1])) for row in result.all()]


class PastProjectRepository:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    async def add(self, project: PastProject) -> PastProject:
        self.session.add(project)
        await self.session.flush()
        return project

    async def similar(
        self,
        *,
        tenant_id: uuid.UUID,
        embedding: list[float],
        limit: int = 5,
    ) -> list[tuple[PastProject, float]]:
        distance = PastProject.embedding.cosine_distance(embedding).label("distance")
        stmt = (
            select(PastProject, distance)
            .where(PastProject.tenant_id == tenant_id)
            .where(PastProject.embedding.is_not(None))
            .order_by("distance")
            .limit(limit)
        )
        result = await self.session.execute(stmt)
        return [(row[0], float(row[1])) for row in result.all()]


def _gen_id(prefix: str) -> str:
    return f"{prefix}-{secrets.token_hex(4).upper()}"


class SwonRepository:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    async def create(self, *, tenant_id: uuid.UUID, demand_id: uuid.UUID,
                     customer_loa_ref: Optional[str] = None,
                     sow_summary: Optional[str] = None,
                     total_value_inr: Optional[float] = None) -> SwonRecord:
        rec = SwonRecord(
            tenant_id=tenant_id, demand_id=demand_id,
            public_id=_gen_id("SWON"),
            customer_loa_ref=customer_loa_ref,
            sow_summary=sow_summary,
            total_value_inr=total_value_inr,
        )
        self.session.add(rec)
        await self.session.flush()
        return rec

    async def get(self, swon_id: uuid.UUID) -> Optional[SwonRecord]:
        return (await self.session.execute(
            select(SwonRecord).where(SwonRecord.id == swon_id)
        )).scalar_one_or_none()

    async def get_by_public_id(self, public_id: str) -> Optional[SwonRecord]:
        return (await self.session.execute(
            select(SwonRecord).where(SwonRecord.public_id == public_id)
        )).scalar_one_or_none()

    async def list_for_tenant(self, tenant_id: uuid.UUID, limit: int = 100) -> list[SwonRecord]:
        stmt = select(SwonRecord).where(SwonRecord.tenant_id == tenant_id).order_by(SwonRecord.created_at.desc()).limit(limit)
        return list((await self.session.execute(stmt)).scalars())

    async def update_state(self, swon_id: uuid.UUID, state: str) -> None:
        vals: dict = {"lifecycle_state": state}
        if state == "Closed":
            vals["closed_at"] = datetime.now(timezone.utc)
        await self.session.execute(update(SwonRecord).where(SwonRecord.id == swon_id).values(**vals))


class WonRepository:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    async def create(self, *, tenant_id: uuid.UUID, swon_id: uuid.UUID,
                     billable: bool = True, resource_id: Optional[uuid.UUID] = None,
                     cost_centre: Optional[str] = None, allocation_pct: float = 100.0,
                     monthly_value_inr: Optional[float] = None) -> WonRecord:
        rec = WonRecord(
            tenant_id=tenant_id, swon_id=swon_id,
            public_id=_gen_id("WON"),
            billable=billable, resource_id=resource_id,
            cost_centre=cost_centre, allocation_pct=allocation_pct,
            monthly_value_inr=monthly_value_inr,
        )
        self.session.add(rec)
        await self.session.flush()
        return rec

    async def list_for_swon(self, swon_id: uuid.UUID) -> list[WonRecord]:
        stmt = select(WonRecord).where(WonRecord.swon_id == swon_id).order_by(WonRecord.created_at.desc())
        return list((await self.session.execute(stmt)).scalars())

    async def update_state(self, won_id: uuid.UUID, state: str) -> None:
        await self.session.execute(update(WonRecord).where(WonRecord.id == won_id).values(state=state))


class TaskRepository:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    async def create(self, *, tenant_id: uuid.UUID, demand_id: uuid.UUID,
                     title: str, description: Optional[str] = None,
                     owner_id: Optional[uuid.UUID] = None,
                     swon_id: Optional[uuid.UUID] = None,
                     parent_task_id: Optional[uuid.UUID] = None,
                     priority: str = "medium",
                     est_hours: Optional[float] = None,
                     sla_due_at: Optional[datetime] = None) -> Task:
        t = Task(
            tenant_id=tenant_id, demand_id=demand_id,
            public_id=_gen_id("TSK"),
            title=title, description=description,
            owner_id=owner_id, swon_id=swon_id,
            parent_task_id=parent_task_id,
            priority=priority, est_hours=est_hours,
            sla_due_at=sla_due_at,
        )
        self.session.add(t)
        await self.session.flush()
        return t

    async def get(self, task_id: uuid.UUID) -> Optional[Task]:
        return (await self.session.execute(
            select(Task).where(Task.id == task_id)
        )).scalar_one_or_none()

    async def get_by_public_id(self, public_id: str) -> Optional[Task]:
        return (await self.session.execute(
            select(Task).where(Task.public_id == public_id)
        )).scalar_one_or_none()

    async def list_for_demand(self, demand_id: uuid.UUID) -> list[Task]:
        stmt = select(Task).where(Task.demand_id == demand_id).order_by(Task.created_at.asc())
        return list((await self.session.execute(stmt)).scalars())

    async def list_for_owner(self, owner_id: uuid.UUID, limit: int = 50) -> list[Task]:
        stmt = select(Task).where(Task.owner_id == owner_id).order_by(Task.created_at.desc()).limit(limit)
        return list((await self.session.execute(stmt)).scalars())

    async def update_status(self, task_id: uuid.UUID, status: str, **extra) -> None:
        vals: dict = {"status": status, **extra}
        if status == "Done":
            vals["completed_at"] = datetime.now(timezone.utc)
        await self.session.execute(update(Task).where(Task.id == task_id).values(**vals))

    async def add_update(self, *, tenant_id: uuid.UUID, task_id: uuid.UUID,
                         author_id: Optional[uuid.UUID], body: str,
                         kind: str = "comment",
                         payload: Optional[dict] = None) -> TaskUpdate:
        tu = TaskUpdate(
            tenant_id=tenant_id, task_id=task_id,
            author_id=author_id, body=body,
            kind=kind, payload=payload,
        )
        self.session.add(tu)
        await self.session.flush()
        return tu

    async def list_updates(self, task_id: uuid.UUID) -> list[TaskUpdate]:
        stmt = select(TaskUpdate).where(TaskUpdate.task_id == task_id).order_by(TaskUpdate.created_at.asc())
        return list((await self.session.execute(stmt)).scalars())

    async def add_handoff(self, *, tenant_id: uuid.UUID, task_id: uuid.UUID,
                          from_user_id: Optional[uuid.UUID],
                          to_user_id: Optional[uuid.UUID],
                          reason: Optional[str] = None) -> TaskHandoff:
        h = TaskHandoff(
            tenant_id=tenant_id, task_id=task_id,
            from_user_id=from_user_id, to_user_id=to_user_id,
            reason=reason,
        )
        self.session.add(h)
        await self.session.flush()
        return h

    async def list_handoffs(self, task_id: uuid.UUID) -> list[TaskHandoff]:
        stmt = select(TaskHandoff).where(TaskHandoff.task_id == task_id).order_by(TaskHandoff.created_at.asc())
        return list((await self.session.execute(stmt)).scalars())


class AuditRepository:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    async def record(self, *, tenant_id: uuid.UUID, entity_kind: str,
                     entity_id: str, action: str,
                     actor_id: Optional[uuid.UUID] = None,
                     diff: Optional[dict] = None) -> AuditEvent:
        ev = AuditEvent(
            tenant_id=tenant_id, entity_kind=entity_kind,
            entity_id=entity_id, action=action,
            actor_id=actor_id, diff=diff,
        )
        self.session.add(ev)
        await self.session.flush()
        return ev

    async def list_for_entity(self, entity_kind: str, entity_id: str, limit: int = 100) -> list[AuditEvent]:
        stmt = (
            select(AuditEvent)
            .where(AuditEvent.entity_kind == entity_kind, AuditEvent.entity_id == entity_id)
            .order_by(AuditEvent.created_at.desc())
            .limit(limit)
        )
        return list((await self.session.execute(stmt)).scalars())

    async def list_for_tenant(self, tenant_id: uuid.UUID, *,
                              entity_kind: Optional[str] = None,
                              since: Optional[datetime] = None,
                              actions: Optional[list[str]] = None,
                              limit: int = 100, offset: int = 0) -> list[AuditEvent]:
        stmt = select(AuditEvent).where(AuditEvent.tenant_id == tenant_id)
        if entity_kind:
            stmt = stmt.where(AuditEvent.entity_kind == entity_kind)
        if since:
            stmt = stmt.where(AuditEvent.created_at >= since)
        if actions:
            stmt = stmt.where(AuditEvent.action.in_(actions))
        stmt = stmt.order_by(AuditEvent.created_at.desc()).offset(offset).limit(limit)
        return list((await self.session.execute(stmt)).scalars())


class NotificationRepository:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    async def create(self, *, tenant_id: uuid.UUID,
                     user_id: Optional[uuid.UUID],
                     kind: str, title: str,
                     body: Optional[str] = None,
                     entity_kind: Optional[str] = None,
                     entity_id: Optional[str] = None) -> Notification:
        n = Notification(
            tenant_id=tenant_id, user_id=user_id,
            kind=kind, title=title, body=body,
            entity_kind=entity_kind, entity_id=entity_id,
        )
        self.session.add(n)
        await self.session.flush()
        return n

    async def list_for_user(self, tenant_id: uuid.UUID,
                            user_id: Optional[uuid.UUID], *,
                            unread_only: bool = False,
                            limit: int = 50) -> list[Notification]:
        stmt = select(Notification).where(Notification.tenant_id == tenant_id)
        if user_id is not None:
            stmt = stmt.where(
                (Notification.user_id == user_id) | (Notification.user_id.is_(None))
            )
        if unread_only:
            stmt = stmt.where(Notification.read.is_(False))
        stmt = stmt.order_by(Notification.created_at.desc()).limit(limit)
        return list((await self.session.execute(stmt)).scalars())

    async def unread_count(self, tenant_id: uuid.UUID,
                           user_id: Optional[uuid.UUID]) -> int:
        from sqlalchemy import func as _func

        stmt = select(_func.count(Notification.id)).where(
            Notification.tenant_id == tenant_id,
            Notification.read.is_(False),
        )
        if user_id is not None:
            stmt = stmt.where(
                (Notification.user_id == user_id) | (Notification.user_id.is_(None))
            )
        return int((await self.session.execute(stmt)).scalar() or 0)

    async def mark_read(self, tenant_id: uuid.UUID, notification_id: uuid.UUID) -> None:
        await self.session.execute(
            update(Notification)
            .where(Notification.tenant_id == tenant_id, Notification.id == notification_id)
            .values(read=True)
        )

    async def mark_all_read(self, tenant_id: uuid.UUID,
                            user_id: Optional[uuid.UUID]) -> None:
        stmt = update(Notification).where(
            Notification.tenant_id == tenant_id,
            Notification.read.is_(False),
        )
        if user_id is not None:
            stmt = stmt.where(
                (Notification.user_id == user_id) | (Notification.user_id.is_(None))
            )
        await self.session.execute(stmt.values(read=True))


class EmailLogRepository:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    async def create(self, *, tenant_id: uuid.UUID,
                     to_email: str, subject: str, body: str,
                     demand_id: Optional[uuid.UUID] = None,
                     kind: str = "generic",
                     provider: str = "demo",
                     delivered: bool = True) -> EmailLog:
        log = EmailLog(
            tenant_id=tenant_id, to_email=to_email,
            subject=subject, body=body, demand_id=demand_id,
            kind=kind, provider=provider, delivered=delivered,
        )
        self.session.add(log)
        await self.session.flush()
        return log

    async def list_for_demand(self, demand_id: uuid.UUID) -> list[EmailLog]:
        stmt = (
            select(EmailLog)
            .where(EmailLog.demand_id == demand_id)
            .order_by(EmailLog.created_at.desc())
        )
        return list((await self.session.execute(stmt)).scalars())


class CommitRepository:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    async def create(self, *, tenant_id: uuid.UUID, demand_id: uuid.UUID,
                     sha: str, author: str, message: str,
                     files_changed: int = 0, branch: str = "main",
                     is_agent: bool = False,
                     task_id: Optional[uuid.UUID] = None) -> Commit:
        c = Commit(
            tenant_id=tenant_id, demand_id=demand_id,
            sha=sha, author=author, message=message,
            files_changed=files_changed, branch=branch,
            is_agent=is_agent, task_id=task_id,
        )
        self.session.add(c)
        await self.session.flush()
        return c

    async def list_for_demand(self, demand_id: uuid.UUID, limit: int = 100) -> list[Commit]:
        stmt = (
            select(Commit)
            .where(Commit.demand_id == demand_id)
            .order_by(Commit.created_at.desc())
            .limit(limit)
        )
        return list((await self.session.execute(stmt)).scalars())


class RoleRepository:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    async def get_by_slug(self, slug: str) -> Optional[Role]:
        return (await self.session.execute(
            select(Role).where(Role.slug == slug)
        )).scalar_one_or_none()

    async def all_roles(self) -> list[Role]:
        return list((await self.session.execute(
            select(Role).order_by(Role.hierarchy_level.desc())
        )).scalars())

    async def assign(self, *, tenant_id: uuid.UUID, user_id: uuid.UUID,
                     role_slug: str, scope: str = "tenant",
                     granted_by: Optional[uuid.UUID] = None) -> UserRoleAssignment:
        role = await self.get_by_slug(role_slug)
        if not role:
            raise ValueError(f"Unknown role: {role_slug}")
        # Avoid duplicate
        existing = (await self.session.execute(
            select(UserRoleAssignment).where(
                UserRoleAssignment.user_id == user_id,
                UserRoleAssignment.role_id == role.id,
                UserRoleAssignment.scope == scope,
            )
        )).scalar_one_or_none()
        if existing:
            return existing
        ura = UserRoleAssignment(
            tenant_id=tenant_id, user_id=user_id,
            role_id=role.id, scope=scope,
            granted_by=granted_by,
        )
        self.session.add(ura)
        await self.session.flush()
        return ura

    async def get_user_roles(self, user_id: uuid.UUID) -> list[str]:
        stmt = (
            select(Role.slug)
            .join(UserRoleAssignment, UserRoleAssignment.role_id == Role.id)
            .where(UserRoleAssignment.user_id == user_id)
        )
        result = await self.session.execute(stmt)
        return [row[0] for row in result.all()]
