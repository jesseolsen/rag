from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text, select
from app.models.database import ResumeSectionChunk
from app.services.embeddings import generate_embeddings
from typing import List, Dict
import uuid


class SearchError(Exception):
    pass


async def search_resume_content(
    db: AsyncSession,
    resume_id: uuid.UUID,
    query: str,
    top_k: int = 5,
    similarity_threshold: float = 0.65
) -> List[Dict]:
    """Search resume content by semantic similarity."""
    try:
        # Generate embedding for query
        embedding = await generate_embeddings(query)

        # Calculate max distance for threshold
        max_distance = 1 - similarity_threshold

        # Search using pgvector
        results = await db.execute(
            select(
                ResumeSectionChunk.id,
                ResumeSectionChunk.section,
                ResumeSectionChunk.content,
                text(f"(embedding <-> CAST('{embedding}' AS vector)) AS distance")
            ).filter(
                ResumeSectionChunk.resume_id == resume_id
            ).order_by(
                text(f"embedding <-> CAST('{embedding}' AS vector)")
            ).limit(top_k)
        )
        rows = results.all()

        # Format results
        formatted_results = []
        for chunk_id, section, content, distance in rows:
            similarity = max(0, min(1, 1 - distance))
            formatted_results.append({
                "chunk_id": str(chunk_id),
                "section": section,
                "content": content,
                "relevance": similarity
            })

        return formatted_results

    except Exception as e:
        raise SearchError(f"Search failed: {str(e)}")


async def get_section_chunks(
    db: AsyncSession,
    resume_id: uuid.UUID,
    section: str,
    limit: int = 10
) -> List[Dict]:
    """Get all chunks from a specific resume section."""
    try:
        result = await db.execute(
            select(
                ResumeSectionChunk.id,
                ResumeSectionChunk.content,
                ResumeSectionChunk.chunk_index
            ).filter(
                ResumeSectionChunk.resume_id == resume_id,
                ResumeSectionChunk.section == section
            ).order_by(
                ResumeSectionChunk.chunk_index
            ).limit(limit)
        )
        chunks = result.all()

        return [
            {
                "chunk_id": str(c[0]),
                "content": c[1],
                "index": c[2]
            }
            for c in chunks
        ]

    except Exception as e:
        raise SearchError(f"Failed to fetch section chunks: {str(e)}")
