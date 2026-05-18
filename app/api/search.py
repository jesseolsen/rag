from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.db import get_db
from app.models.database import Resume, ResumeStatus
from app.models.schemas import SearchSkillsRequest, SearchSkillsResponse
from app.services.search import search_resume_content, get_section_chunks

router = APIRouter(prefix="/api/v1/search", tags=["search"])


@router.post("/skills", response_model=SearchSkillsResponse)
async def search_skills(
    request: SearchSkillsRequest,
    db: AsyncSession = Depends(get_db)
):
    """Search for relevant skills and experiences in the resume."""
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
        request.query,
        top_k=request.top_k
    )

    # Organize by section
    skills = []
    experiences = []
    projects = []

    for result in search_results:
        item = {
            "content": result['content'],
            "section": result['section'],
            "relevance": result['relevance']
        }

        if result['section'] == 'skills':
            skills.append(item)
        elif result['section'] == 'experience':
            experiences.append(item)
        elif result['section'] == 'projects':
            projects.append(item)

    return SearchSkillsResponse(
        query=request.query,
        skills=skills,
        experiences=experiences,
        projects=projects,
        result_count=len(search_results)
    )
