from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.db import get_db
from app.models.database import Resume, ResumeStatus
from app.models.schemas import (
    CoverLetterRequest,
    CoverLetterResponse,
    ResponseGenerationRequest,
    ResponseGenerationResponse
)
from app.services.search import search_resume_content, get_section_chunks
from app.services.generation import generate_cover_letter, generate_response

router = APIRouter(prefix="/api/v1/generate", tags=["generation"])


@router.post("/cover-letter", response_model=CoverLetterResponse)
async def create_cover_letter(
    request: CoverLetterRequest,
    db: AsyncSession = Depends(get_db)
):
    """Generate a personalized cover letter based on resume and job description."""
    # Get the most recent processed resume
    result = await db.execute(
        select(Resume)
        .where(Resume.status == ResumeStatus.READY)
        .order_by(Resume.processed_at.desc())
        .limit(1)
    )
    resume = result.scalar_one_or_none()

    if not resume:
        raise HTTPException(
            status_code=404,
            detail="No processed resume found. Please upload a resume first."
        )

    # Search for relevant content
    job_context = f"{request.job_title} at {request.company}\n\n{request.job_description}"

    skills_results = await search_resume_content(
        db,
        resume.id,
        job_context,
        top_k=5
    )

    # Get specific requirement matches
    requirement_matches = []
    for req in request.specific_requirements:
        matches = await search_resume_content(
            db,
            resume.id,
            req,
            top_k=3
        )
        requirement_matches.extend(matches)

    # Prepare context chunks
    context_chunks = [m['content'] for m in skills_results[:5]]

    # Generate cover letter
    cover_letter_text = await generate_cover_letter(
        job_title=request.job_title,
        company=request.company,
        job_description=request.job_description,
        resume_context="\n\n".join(context_chunks)
    )

    # Calculate relevance score (average of matched chunks)
    relevance_score = sum(m['relevance'] for m in skills_results) / len(skills_results) if skills_results else 0.0

    # Prepare citations
    citations = [
        {
            "section": m['section'],
            "excerpt": m['content'][:200] + "..." if len(m['content']) > 200 else m['content'],
            "relevance": m['relevance']
        }
        for m in skills_results[:3]
    ]

    return CoverLetterResponse(
        cover_letter=cover_letter_text,
        relevance_score=relevance_score,
        citations=citations,
        metadata={
            "job_title": request.job_title,
            "company": request.company,
            "chunks_used": len(context_chunks),
            "requirements_matched": len(requirement_matches)
        }
    )


@router.post("/response", response_model=ResponseGenerationResponse)
async def generate_application_response(
    request: ResponseGenerationRequest,
    db: AsyncSession = Depends(get_db)
):
    """Generate a response to an application question based on resume content."""
    # Get the most recent processed resume
    result = await db.execute(
        select(Resume)
        .where(Resume.status == ResumeStatus.READY)
        .order_by(Resume.processed_at.desc())
        .limit(1)
    )
    resume = result.scalar_one_or_none()

    if not resume:
        raise HTTPException(
            status_code=404,
            detail="No processed resume found. Please upload a resume first."
        )

    # Search for relevant content
    search_results = await search_resume_content(
        db,
        resume.id,
        request.prompt,
        top_k=5
    )

    if not search_results:
        raise HTTPException(
            status_code=400,
            detail="Could not find relevant resume content for this question"
        )

    # Prepare context chunks
    context_chunks = [m['content'] for m in search_results[:5]]

    # Generate response
    response_text = await generate_response(
        prompt=request.prompt,
        resume_context="\n\n".join(context_chunks),
        job_context=request.job_context,
        tone=request.tone
    )

    # Calculate relevance score
    relevance_score = sum(m['relevance'] for m in search_results) / len(search_results) if search_results else 0.0

    # Prepare citations
    citations = [
        {
            "section": m['section'],
            "excerpt": m['content'][:200] + "..." if len(m['content']) > 200 else m['content'],
            "relevance": m['relevance']
        }
        for m in search_results[:3]
    ]

    return ResponseGenerationResponse(
        response=response_text,
        relevance_score=relevance_score,
        citations=citations,
        metadata={
            "question": request.prompt[:100],
            "tone": request.tone,
            "chunks_used": len(context_chunks)
        }
    )
