"""SQLAlchemy ORM models.

Every row carries a `tenant_id` for cheap multi-tenant isolation;
joins should always filter by it.
"""

from __future__ import annotations

import uuid
from datetime import date, datetime, timezone
from typing import Optional

from pgvector.sqlalchemy import Vector
from sqlalchemy import (
    JSON,
    Boolean,
    Date,
    DateTime,
    Float,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    func,
)
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship


_TS = DateTime(timezone=True)

from app.config import EMBEDDING_DIM


def _uuid() -> uuid.UUID:
    return uuid.uuid4()


def _now() -> datetime:
    return datetime.now(timezone.utc)


class Base(DeclarativeBase):
    pass


# ── Tenant + auth ────────────────────────────────────────────────────


class Tenant(Base):
    __tablename__ = "tenants"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=_uuid)
    name: Mapped[str] = mapped_column(String(120))
    slug: Mapped[str] = mapped_column(String(60), unique=True)
    created_at: Mapped[datetime] = mapped_column(_TS, default=_now)


class User(Base):
    __tablename__ = "users"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=_uuid)
    tenant_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("tenants.id", ondelete="CASCADE"))
    clerk_user_id: Mapped[Optional[str]] = mapped_column(String(80), unique=True, nullable=True)
    email: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    role: Mapped[str] = mapped_column(String(40), default="member")
    created_at: Mapped[datetime] = mapped_column(_TS, default=_now)

    role_assignments = relationship(
        "UserRoleAssignment", back_populates="user",
        foreign_keys="[UserRoleAssignment.user_id]",
        cascade="all, delete-orphan",
    )


# ── RBAC ──────────────────────────────────────────────────────────────


class Role(Base):
    __tablename__ = "roles"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=_uuid)
    slug: Mapped[str] = mapped_column(String(40), unique=True)
    label: Mapped[str] = mapped_column(String(80))
    hierarchy_level: Mapped[int] = mapped_column(Integer, default=1)
    created_at: Mapped[datetime] = mapped_column(_TS, default=_now)


class UserRoleAssignment(Base):
    __tablename__ = "user_role_assignments"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=_uuid)
    tenant_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("tenants.id", ondelete="CASCADE"), index=True
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), index=True
    )
    role_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("roles.id", ondelete="CASCADE"), index=True
    )
    scope: Mapped[str] = mapped_column(String(120), default="tenant")
    granted_by: Mapped[Optional[uuid.UUID]] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    granted_at: Mapped[datetime] = mapped_column(_TS, default=_now)

    user = relationship("User", back_populates="role_assignments", foreign_keys=[user_id])
    role = relationship("Role")


# ── Demand & planning ────────────────────────────────────────────────


class DemandRequest(Base):
    __tablename__ = "demand_requests"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=_uuid)
    tenant_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("tenants.id", ondelete="CASCADE"), index=True
    )
    created_by: Mapped[Optional[uuid.UUID]] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    public_id: Mapped[str] = mapped_column(String(40), unique=True)
    raw_text: Mapped[str] = mapped_column(Text)
    source: Mapped[str] = mapped_column(String(40), default="manual")
    stage: Mapped[str] = mapped_column(String(40), default="ingested", index=True)

    understanding: Mapped[Optional[dict]] = mapped_column(JSONB, nullable=True)
    decision: Mapped[Optional[dict]] = mapped_column(JSONB, nullable=True)
    allocation: Mapped[Optional[dict]] = mapped_column(JSONB, nullable=True)
    similar_projects: Mapped[Optional[dict]] = mapped_column(JSONB, nullable=True)
    reuse_score: Mapped[float] = mapped_column(Float, default=0.0)
    executor_plan: Mapped[Optional[dict]] = mapped_column(JSONB, nullable=True)
    artifacts_prefix: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    preview_url: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    explanation: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    error: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    swon_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        ForeignKey("swon_records.id", ondelete="SET NULL"), nullable=True
    )
    assigned_manager_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    assigned_leader_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    assigned_middleware_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )

    created_at: Mapped[datetime] = mapped_column(_TS, default=_now)
    updated_at: Mapped[datetime] = mapped_column(_TS, default=_now, onupdate=_now)
    completed_at: Mapped[Optional[datetime]] = mapped_column(_TS, nullable=True)

    agent_runs = relationship("AgentRun", back_populates="demand", cascade="all, delete-orphan")
    artifacts = relationship("Artifact", back_populates="demand", cascade="all, delete-orphan")
    swon = relationship("SwonRecord", foreign_keys=[swon_id], uselist=False)
    tasks = relationship("Task", back_populates="demand", cascade="all, delete-orphan", foreign_keys="[Task.demand_id]")


class AgentRun(Base):
    __tablename__ = "agent_runs"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=_uuid)
    tenant_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("tenants.id", ondelete="CASCADE"), index=True
    )
    demand_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("demand_requests.id", ondelete="CASCADE"), index=True
    )
    agent_id: Mapped[str] = mapped_column(String(40))  # frontend_dev, backend_dev, ...
    task_title: Mapped[str] = mapped_column(String(255))
    status: Mapped[str] = mapped_column(String(20), default="pending")
    progress: Mapped[int] = mapped_column(default=0)
    model_used: Mapped[Optional[str]] = mapped_column(String(120), nullable=True)
    prompt_tokens: Mapped[Optional[int]] = mapped_column(nullable=True)
    output_tokens: Mapped[Optional[int]] = mapped_column(nullable=True)
    log: Mapped[list] = mapped_column(JSONB, default=list)

    started_at: Mapped[Optional[datetime]] = mapped_column(_TS, nullable=True)
    completed_at: Mapped[Optional[datetime]] = mapped_column(_TS, nullable=True)
    created_at: Mapped[datetime] = mapped_column(_TS, default=_now)

    demand = relationship("DemandRequest", back_populates="agent_runs")


class Artifact(Base):
    __tablename__ = "artifacts"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=_uuid)
    tenant_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("tenants.id", ondelete="CASCADE"), index=True
    )
    demand_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("demand_requests.id", ondelete="CASCADE"), index=True
    )
    storage_key: Mapped[str] = mapped_column(String(500))  # e.g. tenants/xx/projects/yy/src/App.tsx
    path: Mapped[str] = mapped_column(String(500))         # relative file path
    size_bytes: Mapped[int] = mapped_column(default=0)
    content_type: Mapped[Optional[str]] = mapped_column(String(80), nullable=True)
    sha256: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    created_at: Mapped[datetime] = mapped_column(_TS, default=_now)

    demand = relationship("DemandRequest", back_populates="artifacts")


class ProjectChatMessage(Base):
    __tablename__ = "project_chat_messages"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=_uuid)
    tenant_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("tenants.id", ondelete="CASCADE"), index=True
    )
    demand_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("demand_requests.id", ondelete="CASCADE"), index=True
    )
    role: Mapped[str] = mapped_column(String(20))
    content: Mapped[str] = mapped_column(Text)
    file_edits: Mapped[Optional[list]] = mapped_column(JSONB, nullable=True)
    created_at: Mapped[datetime] = mapped_column(_TS, default=_now)


class PortalRequest(Base):
    __tablename__ = "portal_requests"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=_uuid)
    tenant_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("tenants.id", ondelete="CASCADE"), index=True
    )
    demand_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        ForeignKey("demand_requests.id", ondelete="SET NULL"), nullable=True, index=True
    )
    public_id: Mapped[str] = mapped_column(String(40), unique=True)
    client_name: Mapped[str] = mapped_column(String(160))
    client_email: Mapped[str] = mapped_column(String(255))
    client_company: Mapped[str] = mapped_column(String(160))
    industry: Mapped[str] = mapped_column(String(120))
    priority: Mapped[str] = mapped_column(String(20))
    timeline: Mapped[str] = mapped_column(String(120))
    budget_range: Mapped[str] = mapped_column(String(120))
    description: Mapped[str] = mapped_column(Text)
    status: Mapped[str] = mapped_column(String(40), default="ai_processed", index=True)
    source: Mapped[str] = mapped_column(String(30), default="api")
    plan: Mapped[dict] = mapped_column(JSONB, default=dict)
    approved_team: Mapped[list] = mapped_column(JSONB, default=list)
    created_at: Mapped[datetime] = mapped_column(_TS, default=_now)
    updated_at: Mapped[datetime] = mapped_column(_TS, default=_now, onupdate=_now)

    messages = relationship("PortalMessage", back_populates="request", cascade="all, delete-orphan")


class PortalMessage(Base):
    __tablename__ = "portal_messages"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=_uuid)
    tenant_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("tenants.id", ondelete="CASCADE"), index=True
    )
    request_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("portal_requests.id", ondelete="CASCADE"), index=True
    )
    author: Mapped[str] = mapped_column(String(160))
    role: Mapped[str] = mapped_column(String(30))
    body: Mapped[str] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(_TS, default=_now)

    request = relationship("PortalRequest", back_populates="messages")


class TeamMember(Base):
    __tablename__ = "team_members"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=_uuid)
    tenant_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("tenants.id", ondelete="CASCADE"), index=True
    )
    name: Mapped[str] = mapped_column(String(160))
    role: Mapped[str] = mapped_column(String(120))
    experience: Mapped[str] = mapped_column(String(80))
    ai_readiness: Mapped[str] = mapped_column(String(40))
    skills: Mapped[str] = mapped_column(Text)
    availability: Mapped[str] = mapped_column(String(40))
    current_project: Mapped[str] = mapped_column(String(160), default="Available")
    created_at: Mapped[datetime] = mapped_column(_TS, default=_now)
    updated_at: Mapped[datetime] = mapped_column(_TS, default=_now, onupdate=_now)


# ── Memory & reuse ───────────────────────────────────────────────────


class EmbeddingChunk(Base):
    """Chunk-level embeddings of past demands / files for reuse + chat context."""

    __tablename__ = "embedding_chunks"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=_uuid)
    tenant_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("tenants.id", ondelete="CASCADE"), index=True
    )
    source_kind: Mapped[str] = mapped_column(String(30))  # demand | file | past_project
    source_id: Mapped[Optional[str]] = mapped_column(String(80), nullable=True)
    text: Mapped[str] = mapped_column(Text)
    embedding: Mapped[list[float]] = mapped_column(Vector(EMBEDDING_DIM))
    meta: Mapped[Optional[dict]] = mapped_column(JSONB, nullable=True)
    created_at: Mapped[datetime] = mapped_column(_TS, default=_now)


class PastProject(Base):
    """Curated reuse library. Each row is a past delivery the planner can fork."""

    __tablename__ = "past_projects"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=_uuid)
    tenant_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("tenants.id", ondelete="CASCADE"), index=True
    )
    public_id: Mapped[str] = mapped_column(String(40), unique=True)
    description: Mapped[str] = mapped_column(Text)
    domain: Mapped[str] = mapped_column(String(40))
    problem_type: Mapped[str] = mapped_column(String(40))
    complexity: Mapped[str] = mapped_column(String(20))
    reuse_components: Mapped[list] = mapped_column(JSONB, default=list)
    reuse_rationale: Mapped[Optional[dict]] = mapped_column(JSONB, nullable=True)
    storage_prefix: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    embedding: Mapped[Optional[list[float]]] = mapped_column(Vector(EMBEDDING_DIM), nullable=True)
    created_at: Mapped[datetime] = mapped_column(_TS, default=_now)


# ── SWON & WON (TCS work order tracking) ─────────────────────────────


class SwonRecord(Base):
    """Service Work Order Number — one per approved demand."""

    __tablename__ = "swon_records"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=_uuid)
    tenant_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("tenants.id", ondelete="CASCADE"), index=True
    )
    demand_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("demand_requests.id", ondelete="CASCADE"), index=True
    )
    public_id: Mapped[str] = mapped_column(String(40), unique=True)
    customer_loa_ref: Mapped[Optional[str]] = mapped_column(String(120), nullable=True)
    sow_summary: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    lifecycle_state: Mapped[str] = mapped_column(String(40), default="Initiated")
    opened_at: Mapped[datetime] = mapped_column(_TS, default=_now)
    closed_at: Mapped[Optional[datetime]] = mapped_column(_TS, nullable=True)
    total_value_inr: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    billing_currency: Mapped[str] = mapped_column(String(10), default="INR")
    created_at: Mapped[datetime] = mapped_column(_TS, default=_now)
    updated_at: Mapped[datetime] = mapped_column(_TS, default=_now, onupdate=_now)

    demand = relationship("DemandRequest", foreign_keys=[demand_id])
    won_records = relationship("WonRecord", back_populates="swon", cascade="all, delete-orphan")


class WonRecord(Base):
    """Work Order Number — one per billable resource allocation."""

    __tablename__ = "won_records"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=_uuid)
    tenant_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("tenants.id", ondelete="CASCADE"), index=True
    )
    swon_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("swon_records.id", ondelete="CASCADE"), index=True
    )
    public_id: Mapped[str] = mapped_column(String(40), unique=True)
    billable: Mapped[bool] = mapped_column(Boolean, default=True)
    resource_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    cost_centre: Mapped[Optional[str]] = mapped_column(String(80), nullable=True)
    allocation_pct: Mapped[float] = mapped_column(Float, default=100.0)
    start_date: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    end_date: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    monthly_value_inr: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    state: Mapped[str] = mapped_column(String(30), default="Active")
    created_at: Mapped[datetime] = mapped_column(_TS, default=_now)
    updated_at: Mapped[datetime] = mapped_column(_TS, default=_now, onupdate=_now)

    swon = relationship("SwonRecord", back_populates="won_records")


# ── Tasks (granular sub-work inside a demand) ─────────────────────────


class Task(Base):
    __tablename__ = "tasks"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=_uuid)
    tenant_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("tenants.id", ondelete="CASCADE"), index=True
    )
    demand_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("demand_requests.id", ondelete="CASCADE"), index=True
    )
    swon_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        ForeignKey("swon_records.id", ondelete="SET NULL"), nullable=True
    )
    parent_task_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        ForeignKey("tasks.id", ondelete="SET NULL"), nullable=True
    )
    public_id: Mapped[str] = mapped_column(String(40), unique=True)
    title: Mapped[str] = mapped_column(String(255))
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    owner_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    status: Mapped[str] = mapped_column(String(30), default="Todo")
    priority: Mapped[str] = mapped_column(String(20), default="medium")
    est_hours: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    actual_hours: Mapped[Optional[float]] = mapped_column(Float, nullable=True, default=0.0)
    sla_due_at: Mapped[Optional[datetime]] = mapped_column(_TS, nullable=True)
    blocked_reason: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(_TS, default=_now)
    updated_at: Mapped[datetime] = mapped_column(_TS, default=_now, onupdate=_now)
    completed_at: Mapped[Optional[datetime]] = mapped_column(_TS, nullable=True)

    demand = relationship("DemandRequest", back_populates="tasks")
    updates = relationship("TaskUpdate", back_populates="task", cascade="all, delete-orphan")
    handoffs = relationship("TaskHandoff", back_populates="task", cascade="all, delete-orphan")
    children = relationship("Task", back_populates="parent")
    parent = relationship("Task", back_populates="children", remote_side="Task.id")


class TaskUpdate(Base):
    __tablename__ = "task_updates"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=_uuid)
    tenant_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("tenants.id", ondelete="CASCADE"), index=True
    )
    task_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("tasks.id", ondelete="CASCADE"), index=True
    )
    author_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    body: Mapped[str] = mapped_column(Text)
    kind: Mapped[str] = mapped_column(String(30), default="comment")
    payload: Mapped[Optional[dict]] = mapped_column(JSONB, nullable=True)
    created_at: Mapped[datetime] = mapped_column(_TS, default=_now)

    task = relationship("Task", back_populates="updates")


class TaskHandoff(Base):
    __tablename__ = "task_handoffs"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=_uuid)
    tenant_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("tenants.id", ondelete="CASCADE"), index=True
    )
    task_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("tasks.id", ondelete="CASCADE"), index=True
    )
    from_user_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    to_user_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    reason: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    accepted: Mapped[bool] = mapped_column(Boolean, default=False)
    accepted_at: Mapped[Optional[datetime]] = mapped_column(_TS, nullable=True)
    created_at: Mapped[datetime] = mapped_column(_TS, default=_now)

    task = relationship("Task", back_populates="handoffs")


# ── Audit ─────────────────────────────────────────────────────────────


class AuditEvent(Base):
    __tablename__ = "audit_events"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=_uuid)
    tenant_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("tenants.id", ondelete="CASCADE"), index=True
    )
    entity_kind: Mapped[str] = mapped_column(String(40))
    entity_id: Mapped[str] = mapped_column(String(80))
    actor_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    action: Mapped[str] = mapped_column(String(40))
    diff: Mapped[Optional[dict]] = mapped_column(JSONB, nullable=True)
    reason: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(_TS, default=_now)


Index(
    "ix_audit_events_lookup",
    AuditEvent.tenant_id,
    AuditEvent.entity_kind,
    AuditEvent.entity_id,
    AuditEvent.created_at.desc(),
)


# ── Notifications, email, commits (idea-gap features) ─────────────────


class Notification(Base):
    """Durable, per-user notification feed (approvals, handoffs, routing…)."""

    __tablename__ = "notifications"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=_uuid)
    tenant_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("tenants.id", ondelete="CASCADE"), index=True
    )
    user_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), nullable=True, index=True
    )
    kind: Mapped[str] = mapped_column(String(40), default="info")
    title: Mapped[str] = mapped_column(String(200))
    body: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    entity_kind: Mapped[Optional[str]] = mapped_column(String(40), nullable=True)
    entity_id: Mapped[Optional[str]] = mapped_column(String(80), nullable=True)
    read: Mapped[bool] = mapped_column(Boolean, default=False, index=True)
    created_at: Mapped[datetime] = mapped_column(_TS, default=_now)


class EmailLog(Base):
    """Outbox of emails sent (or captured in demo mode) — e.g. live-link shares."""

    __tablename__ = "email_logs"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=_uuid)
    tenant_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("tenants.id", ondelete="CASCADE"), index=True
    )
    demand_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        ForeignKey("demand_requests.id", ondelete="CASCADE"), nullable=True, index=True
    )
    to_email: Mapped[str] = mapped_column(String(200))
    subject: Mapped[str] = mapped_column(String(300))
    body: Mapped[str] = mapped_column(Text)
    kind: Mapped[str] = mapped_column(String(40), default="generic")
    delivered: Mapped[bool] = mapped_column(Boolean, default=True)
    provider: Mapped[str] = mapped_column(String(40), default="demo")
    created_at: Mapped[datetime] = mapped_column(_TS, default=_now)


class Commit(Base):
    """Human/agent code commits tracked against a demand (and optionally a task)."""

    __tablename__ = "commits"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=_uuid)
    tenant_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("tenants.id", ondelete="CASCADE"), index=True
    )
    demand_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("demand_requests.id", ondelete="CASCADE"), index=True
    )
    task_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        ForeignKey("tasks.id", ondelete="SET NULL"), nullable=True
    )
    sha: Mapped[str] = mapped_column(String(64))
    author: Mapped[str] = mapped_column(String(160))
    message: Mapped[str] = mapped_column(Text)
    files_changed: Mapped[int] = mapped_column(Integer, default=0)
    branch: Mapped[str] = mapped_column(String(120), default="main")
    is_agent: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(_TS, default=_now)


Index(
    "ix_notifications_user_unread",
    Notification.tenant_id,
    Notification.user_id,
    Notification.read,
    Notification.created_at.desc(),
)
Index(
    "ix_commits_demand",
    Commit.tenant_id,
    Commit.demand_id,
    Commit.created_at.desc(),
)


Index(
    "ix_embeddings_hnsw",
    EmbeddingChunk.embedding,
    postgresql_using="hnsw",
    postgresql_with={"m": 16, "ef_construction": 64},
    postgresql_ops={"embedding": "vector_cosine_ops"},
)
Index(
    "ix_past_projects_hnsw",
    PastProject.embedding,
    postgresql_using="hnsw",
    postgresql_with={"m": 16, "ef_construction": 64},
    postgresql_ops={"embedding": "vector_cosine_ops"},
)
