"""add attendance reviews

Revision ID: f1a3c8d5b207
Revises: e7c9d41f0a26
Create Date: 2026-07-11 12:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'f1a3c8d5b207'
down_revision: Union[str, Sequence[str], None] = 'e7c9d41f0a26'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    # Distinguish a self-review pass from a teacher override on existing records.
    op.add_column(
        'attendance_records',
        sa.Column('via_review', sa.Boolean(), server_default=sa.false(), nullable=True),
    )

    op.create_table(
        'attendance_reviews',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('session_id', sa.Integer(), nullable=False),
        sa.Column('student_id', sa.Integer(), nullable=False),
        sa.Column('image_id', sa.Integer(), nullable=True),
        sa.Column('region_x', sa.Float(), nullable=False),
        sa.Column('region_y', sa.Float(), nullable=False),
        sa.Column('region_w', sa.Float(), nullable=False),
        sa.Column('region_h', sa.Float(), nullable=False),
        sa.Column('shape', sa.String(), nullable=True),
        sa.Column('status', sa.String(), nullable=False),
        sa.Column('distance', sa.Float(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=True),
        sa.Column('decided_at', sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(['session_id'], ['attendance_sessions.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['student_id'], ['users.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['image_id'], ['session_images.id'], ondelete='SET NULL'),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('session_id', 'student_id', name='uq_review_session_student'),
    )
    op.create_index(op.f('ix_attendance_reviews_id'), 'attendance_reviews', ['id'], unique=False)
    op.create_index(op.f('ix_attendance_reviews_session_id'), 'attendance_reviews', ['session_id'], unique=False)
    op.create_index(op.f('ix_attendance_reviews_student_id'), 'attendance_reviews', ['student_id'], unique=False)


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_index(op.f('ix_attendance_reviews_student_id'), table_name='attendance_reviews')
    op.drop_index(op.f('ix_attendance_reviews_session_id'), table_name='attendance_reviews')
    op.drop_index(op.f('ix_attendance_reviews_id'), table_name='attendance_reviews')
    op.drop_table('attendance_reviews')
    op.drop_column('attendance_records', 'via_review')
