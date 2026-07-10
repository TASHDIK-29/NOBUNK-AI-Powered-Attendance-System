"""add session images

Revision ID: e7c9d41f0a26
Revises: c3a5f1e29d47
Create Date: 2026-07-10 10:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'e7c9d41f0a26'
down_revision: Union[str, Sequence[str], None] = 'c3a5f1e29d47'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.create_table(
        'session_images',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('session_id', sa.Integer(), nullable=False),
        sa.Column('url', sa.String(), nullable=False),
        sa.Column('public_id', sa.String(), nullable=False),
        sa.Column('width', sa.Integer(), nullable=True),
        sa.Column('height', sa.Integer(), nullable=True),
        sa.Column('format', sa.String(), nullable=True),
        sa.Column('bytes', sa.Integer(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=True),
        sa.ForeignKeyConstraint(['session_id'], ['attendance_sessions.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index(op.f('ix_session_images_id'), 'session_images', ['id'], unique=False)
    op.create_index(op.f('ix_session_images_session_id'), 'session_images', ['session_id'], unique=False)
    op.create_index(op.f('ix_session_images_public_id'), 'session_images', ['public_id'], unique=False)


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_index(op.f('ix_session_images_public_id'), table_name='session_images')
    op.drop_index(op.f('ix_session_images_session_id'), table_name='session_images')
    op.drop_index(op.f('ix_session_images_id'), table_name='session_images')
    op.drop_table('session_images')
