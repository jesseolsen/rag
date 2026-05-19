"""Add form_responses table for capturing form submissions

Revision ID: 002
Revises: 001
Create Date: 2026-05-18

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = '002'
down_revision = '001'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Create form_responses table
    op.create_table(
        'form_responses',
        sa.Column('id', sa.String(36), primary_key=True),
        sa.Column('url', sa.Text(), nullable=False),
        sa.Column('form_data', sa.JSON(), nullable=False),
        sa.Column('submitted_at', sa.DateTime(timezone=True), server_default=sa.text('NOW()')),
        sa.Column('source', sa.String(50), default='extension'),
    )

    # Create index on submitted_at for efficient queries
    op.create_index('ix_form_responses_submitted_at', 'form_responses', ['submitted_at'])
    op.create_index('ix_form_responses_url', 'form_responses', ['url'])


def downgrade() -> None:
    op.drop_index('ix_form_responses_url')
    op.drop_index('ix_form_responses_submitted_at')
    op.drop_table('form_responses')
