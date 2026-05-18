from sqlalchemy.orm import Session
from sqlalchemy import text
from app.models.database import ResumeSectionChunk
from app.services.embeddings import generate_embeddings
from typing import List, Dict


class SearchError(Exception):
    pass


def search_resume_content(
    db: Session,
    query: str,
    resume_id: str,
    top_k: int = 5,
    similarity_threshold: float = 0.65
) -> List[Dict]:
    """Search resume content by semantic similarity."""
    try:
        # Generate embedding for query
        embeddings = generate_embeddings([query])
        query_embedding = embeddings[0]

        # Calculate max distance for threshold
        max_distance = 1 - similarity_threshold

        # Search using pgvector
        results = db.query(
            ResumeSectionChunk.id,
            ResumeSectionChunk.section,
            ResumeSectionChunk.content,
            text(f"(embedding <-> CAST('{query_embedding}' AS vector)) AS distance")
        ).filter(
            ResumeSectionChunk.resume_id == resume_id
        ).order_by(
            text(f"embedding <-> CAST('{query_embedding}' AS vector)")
        ).limit(top_k).all()

        # Format results
        formatted_results = []
        for chunk_id, section, content, distance in results:
            similarity = max(0, min(1, 1 - distance))
            formatted_results.append({
                "chunk_id": str(chunk_id),
                "section": section,
                "content": content,
                "relevance_score": similarity
            })

        return formatted_results

    except Exception as e:
        raise SearchError(f"Search failed: {str(e)}")


def get_section_chunks(
    db: Session,
    resume_id: str,
    section: str,
    limit: int = 10
) -> List[Dict]:
    """Get all chunks from a specific resume section."""
    try:
        chunks = db.query(
            ResumeSectionChunk.id,
            ResumeSectionChunk.content,
            ResumeSectionChunk.chunk_index
        ).filter(
            ResumeSectionChunk.resume_id == resume_id,
            ResumeSectionChunk.section == section
        ).order_by(
            ResumeSectionChunk.chunk_index
        ).limit(limit).all()

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
