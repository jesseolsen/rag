from fastapi import APIRouter, UploadFile, File, Depends, HTTPException, BackgroundTasks
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
import uuid
from datetime import datetime

from app.db import get_db
from app.models.database import Resume, ResumeSectionChunk, ResumeStatus
from app.models.schemas import ResumeUploadResponse, ResumeDataResponse
from app.services.resume_processor import extract_text_from_pdf, detect_resume_sections
from app.services.chunking import chunk_resume_by_section
from app.services.embeddings import generate_embeddings
from app.services.resume_parser import extract_contact_info, extract_summary, extract_skills, extract_experience, extract_education

router = APIRouter(prefix="/api/v1/resume", tags=["resume"])


async def process_resume_background(
    resume_id: uuid.UUID,
    text_content: str
):
    from app.db import AsyncSessionLocal

    async with AsyncSessionLocal() as db:
        try:
            # Detect sections
            sections = detect_resume_sections(text_content)

            # Chunk by section
            chunks_list = chunk_resume_by_section(sections)

            # Generate embeddings and save chunks
            for chunk_data in chunks_list:
                # Generate embedding
                embedding = await generate_embeddings(chunk_data["content"])

                # Create chunk record
                chunk = ResumeSectionChunk(
                    id=str(uuid.uuid4()),
                    resume_id=str(resume_id),
                    section=chunk_data["section"],
                    content=chunk_data["content"],
                    embedding=embedding,
                    chunk_index=chunk_data["chunk_index"]
                )
                db.add(chunk)

            # Update resume status
            result = await db.execute(
                select(Resume).where(Resume.id == resume_id)
            )
            resume = result.scalar_one()
            resume.status = ResumeStatus.READY
            resume.processed_at = datetime.utcnow()

            await db.commit()
        except Exception as e:
            # Update status to failed
            async with AsyncSessionLocal() as db2:
                result = await db2.execute(
                    select(Resume).where(Resume.id == resume_id)
                )
                resume = result.scalar_one()
                resume.status = ResumeStatus.FAILED
                resume.resume_metadata = {"error": str(e)}
                await db2.commit()


@router.post("/upload", response_model=ResumeUploadResponse)
async def upload_resume(
    file: UploadFile = File(...),
    background_tasks: BackgroundTasks = None,
    db: AsyncSession = Depends(get_db)
):
    """Upload a resume PDF and begin processing."""
    if not file.filename.lower().endswith(('.pdf', '.txt')):
        raise HTTPException(
            status_code=400,
            detail="Only PDF and text files are supported"
        )

    # Read file content
    content = await file.read()

    # Extract text from PDF
    try:
        if file.filename.lower().endswith('.pdf'):
            text_content, metadata = extract_text_from_pdf(content)
        else:
            text_content = content.decode('utf-8')
            metadata = {}
    except Exception as e:
        raise HTTPException(
            status_code=400,
            detail=f"Failed to process file: {str(e)}"
        )

    # Create resume record
    resume_id = str(uuid.uuid4())
    resume = Resume(
        id=resume_id,
        filename=file.filename,
        content_type=file.content_type,
        file_content=bytes(content),
        status=ResumeStatus.PROCESSING,
        resume_metadata=metadata
    )

    db.add(resume)
    await db.commit()
    await db.refresh(resume)

    # Start background processing
    if background_tasks:
        background_tasks.add_task(
            process_resume_background,
            resume_id,
            text_content
        )

    return ResumeUploadResponse(
        resume_id=resume.id,
        filename=resume.filename,
        status=resume.status,
        chunks=0,
        uploaded_at=resume.uploaded_at
    )


@router.get("/{resume_id}")
async def get_resume_status(
    resume_id: uuid.UUID,
    db: AsyncSession = Depends(get_db)
):
    """Get resume processing status."""
    resume_id_str = str(resume_id)
    result = await db.execute(
        select(Resume).where(Resume.id == resume_id_str)
    )
    resume = result.scalar_one_or_none()

    if not resume:
        raise HTTPException(status_code=404, detail="Resume not found")

    # Count chunks
    chunks_result = await db.execute(
        select(ResumeSectionChunk).where(ResumeSectionChunk.resume_id == resume_id_str)
    )
    chunk_count = len(chunks_result.scalars().all())

    return ResumeUploadResponse(
        resume_id=resume.id,
        filename=resume.filename,
        status=resume.status,
        chunks=chunk_count,
        uploaded_at=resume.uploaded_at
    )


@router.get("/latest/data")
async def get_latest_resume_data(
    db: AsyncSession = Depends(get_db)
):
    """Get structured resume data for the most recently uploaded resume."""
    result = await db.execute(
        select(Resume).order_by(Resume.uploaded_at.desc()).limit(1)
    )
    resume = result.scalar_one_or_none()

    if not resume:
        raise HTTPException(status_code=404, detail="No resume found")

    if resume.status != ResumeStatus.READY:
        raise HTTPException(status_code=400, detail="Resume processing not complete")

    # Extract text from file content
    if resume.filename.lower().endswith('.pdf'):
        try:
            text_content, _ = extract_text_from_pdf(resume.file_content)
        except:
            raise HTTPException(status_code=500, detail="Failed to extract resume text")
    else:
        text_content = resume.file_content.decode('utf-8')

    # Parse resume sections
    sections = detect_resume_sections(text_content)

    # Extract structured data
    contact_info = extract_contact_info(text_content)
    summary = extract_summary(text_content)
    skills = extract_skills(sections)
    experience = extract_experience(text_content)
    education = extract_education(text_content)

    return ResumeDataResponse(
        resume_id=resume.id,
        filename=resume.filename,
        status=resume.status.value,
        name=contact_info.get('name'),
        first_name=contact_info.get('first_name'),
        last_name=contact_info.get('last_name'),
        email=contact_info.get('email'),
        phone=contact_info.get('phone'),
        location=contact_info.get('location'),
        city=contact_info.get('city'),
        state=contact_info.get('state'),
        summary=summary,
        experience=experience,
        education=education,
        skills=skills
    )


@router.get("/{resume_id}/data")
async def get_resume_data(
    resume_id: uuid.UUID,
    db: AsyncSession = Depends(get_db)
):
    """Get structured resume data for form filling."""
    resume_id_str = str(resume_id)
    result = await db.execute(
        select(Resume).where(Resume.id == resume_id_str)
    )
    resume = result.scalar_one_or_none()

    if not resume:
        raise HTTPException(status_code=404, detail="Resume not found")

    if resume.status != ResumeStatus.READY:
        raise HTTPException(status_code=400, detail="Resume processing not complete")

    # Extract text from file content
    if resume.filename.lower().endswith('.pdf'):
        try:
            text_content, _ = extract_text_from_pdf(resume.file_content)
        except:
            raise HTTPException(status_code=500, detail="Failed to extract resume text")
    else:
        text_content = resume.file_content.decode('utf-8')

    # Parse resume sections
    sections = detect_resume_sections(text_content)

    # Extract structured data
    contact_info = extract_contact_info(text_content)
    summary = extract_summary(text_content)
    skills = extract_skills(sections)
    experience = extract_experience(text_content)
    education = extract_education(text_content)

    return ResumeDataResponse(
        resume_id=resume.id,
        filename=resume.filename,
        status=resume.status.value,
        name=contact_info.get('name'),
        first_name=contact_info.get('first_name'),
        last_name=contact_info.get('last_name'),
        email=contact_info.get('email'),
        phone=contact_info.get('phone'),
        location=contact_info.get('location'),
        city=contact_info.get('city'),
        state=contact_info.get('state'),
        summary=summary,
        experience=experience,
        education=education,
        skills=skills
    )
