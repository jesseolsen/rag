"""Initial schema for resume and chunks

Revision ID: 001
Revises:
Create Date: 2026-05-18

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = '001'
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Enable pgvector extension
    op.execute('CREATE EXTENSION IF NOT EXISTS vector')

    # Create resumes table
    op.create_table(
        'resumes',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column('filename', sa.String(255), nullable=False),
        sa.Column('content_type', sa.String(100)),
        sa.Column('file_content', sa.LargeBinary()),
        sa.Column('uploaded_at', sa.DateTime(timezone=True), server_default=sa.text('NOW()')),
        sa.Column('processed_at', sa.DateTime(timezone=True)),
        sa.Column('status', sa.Enum('pending', 'processing', 'ready', 'failed', name='resumestatus'), default='pending'),
        sa.Column('resume_metadata', postgresql.JSONB())
    )

    # Create resume_chunks table
    op.create_table(
        'resume_chunks',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column('resume_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('section', sa.String(50), nullable=False),
        sa.Column('content', sa.Text(), nullable=False),
        sa.Column('chunk_index', sa.Integer(), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('NOW()'))
    )

    # Add vector column
    op.execute('ALTER TABLE resume_chunks ADD COLUMN embedding vector(1536)')

    # Create indexes
    op.create_index('ix_resume_chunks_embedding', 'resume_chunks', [], postgresql_using='hnsw',
                    postgresql_where=sa.text('embedding IS NOT NULL'),
                    postgresql_ops={'embedding': 'vector_cosine_ops'})
    op.execute('CREATE INDEX ix_resume_chunks_embedding ON resume_chunks USING hnsw (embedding vector_cosine_ops)')
    op.create_index('ix_resume_chunks_resume_id', 'resume_chunks', ['resume_id'])
    op.create_index('ix_resume_chunks_section', 'resume_chunks', ['section'])


def downgrade() -> None:
    op.drop_index('ix_resume_chunks_section')
    op.drop_index('ix_resume_chunks_resume_id')
    op.drop_index('ix_resume_chunks_embedding')
    op.drop_table('resume_chunks')
    op.drop_table('resumes')
    op.execute('DROP EXTENSION IF EXISTS vector')
