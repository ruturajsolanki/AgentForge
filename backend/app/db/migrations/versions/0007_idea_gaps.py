"""Idea-gap features: notifications, email logs, commits.

Revision ID: 0007_idea_gaps
Revises: 0006_audit_reason
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "0007_idea_gaps"
down_revision = "0006_audit_reason"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # ── notifications ──
    op.create_table(
        "notifications",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("tenant_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=True, index=True),
        sa.Column("kind", sa.String(40), server_default="info"),
        sa.Column("title", sa.String(200), nullable=False),
        sa.Column("body", sa.Text, nullable=True),
        sa.Column("entity_kind", sa.String(40), nullable=True),
        sa.Column("entity_id", sa.String(80), nullable=True),
        sa.Column("read", sa.Boolean, server_default=sa.false(), index=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_index(
        "ix_notifications_user_unread",
        "notifications",
        ["tenant_id", "user_id", "read", sa.text("created_at DESC")],
    )

    # ── email_logs ──
    op.create_table(
        "email_logs",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("tenant_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("demand_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("demand_requests.id", ondelete="CASCADE"), nullable=True, index=True),
        sa.Column("to_email", sa.String(200), nullable=False),
        sa.Column("subject", sa.String(300), nullable=False),
        sa.Column("body", sa.Text, nullable=False),
        sa.Column("kind", sa.String(40), server_default="generic"),
        sa.Column("delivered", sa.Boolean, server_default=sa.true()),
        sa.Column("provider", sa.String(40), server_default="demo"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )

    # ── commits ──
    op.create_table(
        "commits",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("tenant_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("demand_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("demand_requests.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("task_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("tasks.id", ondelete="SET NULL"), nullable=True),
        sa.Column("sha", sa.String(64), nullable=False),
        sa.Column("author", sa.String(160), nullable=False),
        sa.Column("message", sa.Text, nullable=False),
        sa.Column("files_changed", sa.Integer, server_default="0"),
        sa.Column("branch", sa.String(120), server_default="main"),
        sa.Column("is_agent", sa.Boolean, server_default=sa.false()),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_index(
        "ix_commits_demand",
        "commits",
        ["tenant_id", "demand_id", sa.text("created_at DESC")],
    )


def downgrade() -> None:
    op.drop_index("ix_commits_demand", table_name="commits")
    op.drop_table("commits")
    op.drop_table("email_logs")
    op.drop_index("ix_notifications_user_unread", table_name="notifications")
    op.drop_table("notifications")
