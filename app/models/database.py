from sqlalchemy import Column, String, DateTime, Enum, Text, Integer, LargeBinary, Float, JSON
from sqlalchemy.sql import func
import uuid
import enum
from app.db import Base


class ResumeStatus(str, enum.Enum):
    PENDING = "pending"
    PROCESSING = "processing"
    READY = "ready"
    FAILED = "failed"


class Resume(Base):
    __tablename__ = "resumes"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    filename = Column(String(255), nullable=False)
    content_type = Column(String(100))
    file_content = Column(LargeBinary, nullable=True)
    uploaded_at = Column(DateTime(timezone=True), server_default=func.now())
    processed_at = Column(DateTime(timezone=True), nullable=True)
    status = Column(Enum(ResumeStatus), default=ResumeStatus.PENDING)
    resume_metadata = Column(JSON, nullable=True)


class ResumeSectionChunk(Base):
    __tablename__ = "resume_chunks"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    resume_id = Column(String(36), nullable=False)
    section = Column(String(50), nullable=False)  # e.g., "skills", "experience", "education"
    content = Column(Text, nullable=False)
    embedding = Column(JSON, nullable=True)  # Store as JSON array for SQLite compatibility
    chunk_index = Column(Integer, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())


class FormResponse(Base):
    __tablename__ = "form_responses"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    url = Column(Text, nullable=False)
    form_data = Column(JSON, nullable=False)
    submitted_at = Column(DateTime(timezone=True), server_default=func.now())
    source = Column(String(50), default="extension")  # "extension" or "playwright"
