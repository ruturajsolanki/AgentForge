"""SQLAlchemy ORM models.

Every row carries a `tenant_id` for cheap multi-tenant isolation;
joins should always filter by it.
"""

from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Optional

from pgvector.sqlalchemy import Vector
from sqlalchemy import (
    JSON,
    DateTime,
    Float,
    ForeignKey,
    Index,
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
    public_id: Mapped[str] = mapped_column(String(40), unique=True)  # "DMD-ABCD1234"
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

    created_at: Mapped[datetime] = mapped_column(_TS, default=_now)
    updated_at: Mapped[datetime] = mapped_column(_TS, default=_now, onupdate=_now)
    completed_at: Mapped[Optional[datetime]] = mapped_column(_TS, nullable=True)

    agent_runs = relationship("AgentRun", back_populates="demand", cascade="all, delete-orphan")
    artifacts = relationship("Artifact", back_populates="demand", cascade="all, delete-orphan")


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
    storage_prefix: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    embedding: Mapped[Optional[list[float]]] = mapped_column(Vector(EMBEDDING_DIM), nullable=True)
    created_at: Mapped[datetime] = mapped_column(_TS, default=_now)


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
