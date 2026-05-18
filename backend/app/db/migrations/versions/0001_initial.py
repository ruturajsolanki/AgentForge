"""Initial ForgeOS schema with pgvector.

Revision ID: 0001_initial
Revises:
Create Date: 2026-05-18

"""
from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from pgvector.sqlalchemy import Vector
from sqlalchemy.dialects import postgresql

revision: str = "0001_initial"
down_revision: Union[str, None] = None
branch_labels = None
depends_on = None


EMBEDDING_DIM = 768


def upgrade() -> None:
    op.execute("CREATE EXTENSION IF NOT EXISTS vector;")
    op.execute('CREATE EXTENSION IF NOT EXISTS "uuid-ossp";')

    op.create_table(
        "tenants",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("name", sa.String(120), nullable=False),
        sa.Column("slug", sa.String(60), nullable=False, unique=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )

    op.create_table(
        "users",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("tenant_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False),
        sa.Column("clerk_user_id", sa.String(80), unique=True, nullable=True),
        sa.Column("email", sa.String(255), nullable=True),
        sa.Column("role", sa.String(40), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )

    op.create_table(
        "demand_requests",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("tenant_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False),
        sa.Column("created_by", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("public_id", sa.String(40), unique=True, nullable=False),
        sa.Column("raw_text", sa.Text(), nullable=False),
        sa.Column("source", sa.String(40), nullable=False),
        sa.Column("stage", sa.String(40), nullable=False),
        sa.Column("understanding", postgresql.JSONB(), nullable=True),
        sa.Column("decision", postgresql.JSONB(), nullable=True),
        sa.Column("allocation", postgresql.JSONB(), nullable=True),
        sa.Column("similar_projects", postgresql.JSONB(), nullable=True),
        sa.Column("reuse_score", sa.Float(), nullable=False),
        sa.Column("executor_plan", postgresql.JSONB(), nullable=True),
        sa.Column("artifacts_prefix", sa.String(255), nullable=True),
        sa.Column("preview_url", sa.String(500), nullable=True),
        sa.Column("explanation", sa.Text(), nullable=True),
        sa.Column("error", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index("ix_demand_requests_tenant", "demand_requests", ["tenant_id"])
    op.create_index("ix_demand_requests_stage", "demand_requests", ["stage"])

    op.create_table(
        "agent_runs",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("tenant_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False),
        sa.Column("demand_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("demand_requests.id", ondelete="CASCADE"), nullable=False),
        sa.Column("agent_id", sa.String(40), nullable=False),
        sa.Column("task_title", sa.String(255), nullable=False),
        sa.Column("status", sa.String(20), nullable=False),
        sa.Column("progress", sa.Integer(), nullable=False),
        sa.Column("model_used", sa.String(120), nullable=True),
        sa.Column("prompt_tokens", sa.Integer(), nullable=True),
        sa.Column("output_tokens", sa.Integer(), nullable=True),
        sa.Column("log", postgresql.JSONB(), nullable=False),
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_agent_runs_tenant", "agent_runs", ["tenant_id"])
    op.create_index("ix_agent_runs_demand", "agent_runs", ["demand_id"])

    op.create_table(
        "artifacts",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("tenant_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False),
        sa.Column("demand_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("demand_requests.id", ondelete="CASCADE"), nullable=False),
        sa.Column("storage_key", sa.String(500), nullable=False),
        sa.Column("path", sa.String(500), nullable=False),
        sa.Column("size_bytes", sa.Integer(), nullable=False),
        sa.Column("content_type", sa.String(80), nullable=True),
        sa.Column("sha256", sa.String(64), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_artifacts_tenant", "artifacts", ["tenant_id"])
    op.create_index("ix_artifacts_demand", "artifacts", ["demand_id"])

    op.create_table(
        "embedding_chunks",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("tenant_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False),
        sa.Column("source_kind", sa.String(30), nullable=False),
        sa.Column("source_id", sa.String(80), nullable=True),
        sa.Column("text", sa.Text(), nullable=False),
        sa.Column("embedding", Vector(EMBEDDING_DIM), nullable=False),
        sa.Column("meta", postgresql.JSONB(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_embedding_chunks_tenant", "embedding_chunks", ["tenant_id"])
    op.execute(
        "CREATE INDEX ix_embeddings_hnsw ON embedding_chunks "
        "USING hnsw (embedding vector_cosine_ops) WITH (m = 16, ef_construction = 64);"
    )

    op.create_table(
        "past_projects",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("tenant_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False),
        sa.Column("public_id", sa.String(40), unique=True, nullable=False),
        sa.Column("description", sa.Text(), nullable=False),
        sa.Column("domain", sa.String(40), nullable=False),
        sa.Column("problem_type", sa.String(40), nullable=False),
        sa.Column("complexity", sa.String(20), nullable=False),
        sa.Column("reuse_components", postgresql.JSONB(), nullable=False),
        sa.Column("storage_prefix", sa.String(255), nullable=True),
        sa.Column("embedding", Vector(EMBEDDING_DIM), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_past_projects_tenant", "past_projects", ["tenant_id"])
    op.execute(
        "CREATE INDEX ix_past_projects_hnsw ON past_projects "
        "USING hnsw (embedding vector_cosine_ops) WITH (m = 16, ef_construction = 64);"
    )


def downgrade() -> None:
    op.drop_index("ix_past_projects_hnsw", table_name="past_projects")
    op.drop_index("ix_past_projects_tenant", table_name="past_projects")
    op.drop_table("past_projects")

    op.drop_index("ix_embeddings_hnsw", table_name="embedding_chunks")
    op.drop_index("ix_embedding_chunks_tenant", table_name="embedding_chunks")
    op.drop_table("embedding_chunks")

    op.drop_index("ix_artifacts_demand", table_name="artifacts")
    op.drop_index("ix_artifacts_tenant", table_name="artifacts")
    op.drop_table("artifacts")

    op.drop_index("ix_agent_runs_demand", table_name="agent_runs")
    op.drop_index("ix_agent_runs_tenant", table_name="agent_runs")
    op.drop_table("agent_runs")

    op.drop_index("ix_demand_requests_stage", table_name="demand_requests")
    op.drop_index("ix_demand_requests_tenant", table_name="demand_requests")
    op.drop_table("demand_requests")

    op.drop_table("users")
    op.drop_table("tenants")
