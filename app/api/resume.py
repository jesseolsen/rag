from fastapi import APIRouter, UploadFile, File, Depends, HTTPException, BackgroundTasks
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
import uuid
from datetime import datetime

from app.db import get_db
from app.models.database import Resume, ResumeSectionChunk, ResumeStatus
from app.models.schemas import ResumeUploadResponse
from app.services.resume_processor import extract_text_from_pdf, detect_resume_sections
from app.services.chunking import chunk_resume_by_section
from app.services.embeddings import generate_embeddings

router = APIRouter(prefix="/api/v1/resume", tags=["resume"])


async def process_resume_background(
    resume_id: uuid.UUID,
    text_content: str,
    db: AsyncSession
):
    try:
        # Detect sections
        sections = detect_resume_sections(text_content)

        # Chunk by section
        chunks_data = chunk_resume_by_section(sections)

        # Generate embeddings and save chunks
        for section, chunks in chunks_data.items():
            for chunk_index, chunk_text in enumerate(chunks):
                # Generate embedding
                embedding = await generate_embeddings(chunk_text)

                # Create chunk record
                chunk = ResumeSectionChunk(
                    id=uuid.uuid4(),
                    resume_id=resume_id,
                    section=section,
                    content=chunk_text,
                    embedding=embedding,
                    chunk_index=chunk_index
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
        result = await db.execute(
            select(Resume).where(Resume.id == resume_id)
        )
        resume = result.scalar_one()
        resume.status = ResumeStatus.FAILED
        resume.resume_metadata = {"error": str(e)}
        await db.commit()


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
    resume_id = uuid.uuid4()
    resume = Resume(
        id=resume_id,
        filename=file.filename,
        content_type=file.content_type,
        file_content=content,
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
            text_content,
            db
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
    result = await db.execute(
        select(Resume).where(Resume.id == resume_id)
    )
    resume = result.scalar_one_or_none()

    if not resume:
        raise HTTPException(status_code=404, detail="Resume not found")

    # Count chunks
    chunks_result = await db.execute(
        select(ResumeSectionChunk).where(ResumeSectionChunk.resume_id == resume_id)
    )
    chunk_count = len(chunks_result.scalars().all())

    return ResumeUploadResponse(
        resume_id=resume.id,
        filename=resume.filename,
        status=resume.status,
        chunks=chunk_count,
        uploaded_at=resume.uploaded_at
    )
