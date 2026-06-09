"""Add reason column to audit_events for change tracking.

Revision ID: 0006_audit_reason
Revises: 0005_extended_roles
"""

from alembic import op
import sqlalchemy as sa

revision = "0006_audit_reason"
down_revision = "0005_extended_roles"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("audit_events", sa.Column("reason", sa.Text, nullable=True))


def downgrade() -> None:
    op.drop_column("audit_events", "reason")
