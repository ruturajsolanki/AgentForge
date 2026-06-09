"""TCS delivery layer: roles, SWON/WON, tasks, handoffs, audit.

Revision ID: 0004_tcs_delivery_layer
Revises: 0003_portal_requests_team
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "0004_tcs_delivery_layer"
down_revision = "0003_portal_requests_team"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # ── roles ──
    op.create_table(
        "roles",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("slug", sa.String(40), unique=True, nullable=False),
        sa.Column("label", sa.String(80), nullable=False),
        sa.Column("hierarchy_level", sa.Integer, nullable=False, server_default="1"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    # Seed roles
    op.execute("""
        INSERT INTO roles (slug, label, hierarchy_level) VALUES
        ('higher_manager', 'Higher Manager', 5),
        ('manager', 'Manager', 4),
        ('middleware', 'Middleware', 3),
        ('leader', 'Leader', 2),
        ('member', 'Team Member', 1),
        ('client', 'Client', 0)
        ON CONFLICT (slug) DO NOTHING
    """)

    # ── user_role_assignments ──
    op.create_table(
        "user_role_assignments",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("tenant_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("role_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("roles.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("scope", sa.String(120), server_default="tenant"),
        sa.Column("granted_by", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("granted_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )

    # ── swon_records ──
    op.create_table(
        "swon_records",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("tenant_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("demand_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("demand_requests.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("public_id", sa.String(40), unique=True, nullable=False),
        sa.Column("customer_loa_ref", sa.String(120), nullable=True),
        sa.Column("sow_summary", sa.Text, nullable=True),
        sa.Column("lifecycle_state", sa.String(40), server_default="Initiated"),
        sa.Column("opened_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("closed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("total_value_inr", sa.Float, nullable=True),
        sa.Column("billing_currency", sa.String(10), server_default="INR"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )

    # ── won_records ──
    op.create_table(
        "won_records",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("tenant_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("swon_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("swon_records.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("public_id", sa.String(40), unique=True, nullable=False),
        sa.Column("billable", sa.Boolean, server_default="true"),
        sa.Column("resource_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("cost_centre", sa.String(80), nullable=True),
        sa.Column("allocation_pct", sa.Float, server_default="100.0"),
        sa.Column("start_date", sa.Date, nullable=True),
        sa.Column("end_date", sa.Date, nullable=True),
        sa.Column("monthly_value_inr", sa.Float, nullable=True),
        sa.Column("state", sa.String(30), server_default="Active"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )

    # ── tasks ──
    op.create_table(
        "tasks",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("tenant_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("demand_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("demand_requests.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("swon_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("swon_records.id", ondelete="SET NULL"), nullable=True),
        sa.Column("parent_task_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("tasks.id", ondelete="SET NULL"), nullable=True),
        sa.Column("public_id", sa.String(40), unique=True, nullable=False),
        sa.Column("title", sa.String(255), nullable=False),
        sa.Column("description", sa.Text, nullable=True),
        sa.Column("owner_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("status", sa.String(30), server_default="Todo"),
        sa.Column("priority", sa.String(20), server_default="medium"),
        sa.Column("est_hours", sa.Float, nullable=True),
        sa.Column("actual_hours", sa.Float, server_default="0"),
        sa.Column("sla_due_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("blocked_reason", sa.Text, nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
    )

    # ── task_updates ──
    op.create_table(
        "task_updates",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("tenant_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("task_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("tasks.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("author_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("body", sa.Text, nullable=False),
        sa.Column("kind", sa.String(30), server_default="comment"),
        sa.Column("payload", postgresql.JSONB, nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )

    # ── task_handoffs ──
    op.create_table(
        "task_handoffs",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("tenant_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("task_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("tasks.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("from_user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("to_user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("reason", sa.Text, nullable=True),
        sa.Column("accepted", sa.Boolean, server_default="false"),
        sa.Column("accepted_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )

    # ── audit_events ──
    op.create_table(
        "audit_events",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("tenant_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("entity_kind", sa.String(40), nullable=False),
        sa.Column("entity_id", sa.String(80), nullable=False),
        sa.Column("actor_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("action", sa.String(40), nullable=False),
        sa.Column("diff", postgresql.JSONB, nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_index(
        "ix_audit_events_lookup",
        "audit_events",
        ["tenant_id", "entity_kind", "entity_id", sa.text("created_at DESC")],
    )

    # ── New columns on demand_requests ──
    op.add_column("demand_requests", sa.Column("swon_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("swon_records.id", ondelete="SET NULL"), nullable=True))
    op.add_column("demand_requests", sa.Column("assigned_manager_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True))
    op.add_column("demand_requests", sa.Column("assigned_leader_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True))
    op.add_column("demand_requests", sa.Column("assigned_middleware_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True))

    # ── New column on past_projects ──
    op.add_column("past_projects", sa.Column("reuse_rationale", postgresql.JSONB, nullable=True))


def downgrade() -> None:
    op.drop_column("past_projects", "reuse_rationale")
    op.drop_column("demand_requests", "assigned_middleware_id")
    op.drop_column("demand_requests", "assigned_leader_id")
    op.drop_column("demand_requests", "assigned_manager_id")
    op.drop_column("demand_requests", "swon_id")
    op.drop_index("ix_audit_events_lookup", table_name="audit_events")
    op.drop_table("audit_events")
    op.drop_table("task_handoffs")
    op.drop_table("task_updates")
    op.drop_table("tasks")
    op.drop_table("won_records")
    op.drop_table("swon_records")
    op.drop_table("user_role_assignments")
    op.drop_table("roles")
