"""Add project IDE chat history.

Revision ID: 0002_project_chat_messages
Revises: 0001_initial
Create Date: 2026-05-25
"""

from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0002_project_chat_messages"
down_revision: Union[str, None] = "0001_initial"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "project_chat_messages",
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
            sa.ForeignKey("demand_requests.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("role", sa.String(20), nullable=False),
        sa.Column("content", sa.Text(), nullable=False),
        sa.Column("file_edits", postgresql.JSONB(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_project_chat_messages_tenant", "project_chat_messages", ["tenant_id"])
    op.create_index("ix_project_chat_messages_demand", "project_chat_messages", ["demand_id"])


def downgrade() -> None:
    op.drop_index("ix_project_chat_messages_demand", table_name="project_chat_messages")
    op.drop_index("ix_project_chat_messages_tenant", table_name="project_chat_messages")
    op.drop_table("project_chat_messages")
