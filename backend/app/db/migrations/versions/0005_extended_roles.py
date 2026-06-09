"""Add executive, delivery_team, contributor, viewer roles.

Revision ID: 0005_extended_roles
Revises: 0004_tcs_delivery_layer
"""

from alembic import op

revision = "0005_extended_roles"
down_revision = "0004_tcs_delivery_layer"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("""
        INSERT INTO roles (slug, label, hierarchy_level) VALUES
        ('executive', 'Executive', 6),
        ('delivery_team', 'Delivery Team', 2),
        ('contributor', 'Contributor', 1),
        ('viewer', 'Viewer', 0)
        ON CONFLICT (slug) DO NOTHING
    """)


def downgrade() -> None:
    op.execute("""
        DELETE FROM roles WHERE slug IN ('executive', 'delivery_team', 'contributor', 'viewer')
    """)
