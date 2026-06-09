"""Add portal request and team management tables.

Revision ID: 0003_portal_requests_team
Revises: 0002_project_chat_messages
Create Date: 2026-05-26
"""

from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0003_portal_requests_team"
down_revision: Union[str, None] = "0002_project_chat_messages"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "portal_requests",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "tenant_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("tenants.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "demand_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("demand_requests.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("public_id", sa.String(40), nullable=False, unique=True),
        sa.Column("client_name", sa.String(160), nullable=False),
        sa.Column("client_email", sa.String(255), nullable=False),
        sa.Column("client_company", sa.String(160), nullable=False),
        sa.Column("industry", sa.String(120), nullable=False),
        sa.Column("priority", sa.String(20), nullable=False),
        sa.Column("timeline", sa.String(120), nullable=False),
        sa.Column("budget_range", sa.String(120), nullable=False),
        sa.Column("description", sa.Text(), nullable=False),
        sa.Column("status", sa.String(40), nullable=False),
        sa.Column("source", sa.String(30), nullable=False),
        sa.Column("plan", postgresql.JSONB(), nullable=False),
        sa.Column("approved_team", postgresql.JSONB(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_portal_requests_tenant", "portal_requests", ["tenant_id"])
    op.create_index("ix_portal_requests_demand", "portal_requests", ["demand_id"])
    op.create_index("ix_portal_requests_status", "portal_requests", ["status"])

    op.create_table(
        "portal_messages",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "tenant_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("tenants.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "request_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("portal_requests.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("author", sa.String(160), nullable=False),
        sa.Column("role", sa.String(30), nullable=False),
        sa.Column("body", sa.Text(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_portal_messages_tenant", "portal_messages", ["tenant_id"])
    op.create_index("ix_portal_messages_request", "portal_messages", ["request_id"])

    op.create_table(
        "team_members",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "tenant_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("tenants.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("name", sa.String(160), nullable=False),
        sa.Column("role", sa.String(120), nullable=False),
        sa.Column("experience", sa.String(80), nullable=False),
        sa.Column("ai_readiness", sa.String(40), nullable=False),
        sa.Column("skills", sa.Text(), nullable=False),
        sa.Column("availability", sa.String(40), nullable=False),
        sa.Column("current_project", sa.String(160), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_team_members_tenant", "team_members", ["tenant_id"])


def downgrade() -> None:
    op.drop_index("ix_team_members_tenant", table_name="team_members")
    op.drop_table("team_members")
    op.drop_index("ix_portal_messages_request", table_name="portal_messages")
    op.drop_index("ix_portal_messages_tenant", table_name="portal_messages")
    op.drop_table("portal_messages")
    op.drop_index("ix_portal_requests_status", table_name="portal_requests")
    op.drop_index("ix_portal_requests_demand", table_name="portal_requests")
    op.drop_index("ix_portal_requests_tenant", table_name="portal_requests")
    op.drop_table("portal_requests")
