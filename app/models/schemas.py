from pydantic import BaseModel
from datetime import datetime
from uuid import UUID
import enum


class ResumeStatus(str, enum.Enum):
    PENDING = "pending"
    PROCESSING = "processing"
    READY = "ready"
    FAILED = "failed"


class ResumeUploadResponse(BaseModel):
    resume_id: UUID
    filename: str
    status: ResumeStatus
    chunks: int
    uploaded_at: datetime

    class Config:
        from_attributes = True


class CoverLetterRequest(BaseModel):
    job_title: str
    company: str
    job_description: str
    specific_requirements: list[str] = []


class CoverLetterResponse(BaseModel):
    cover_letter: str
    relevance_score: float
    citations: list[dict]
    metadata: dict


class ResponseGenerationRequest(BaseModel):
    prompt: str
    job_context: str = ""
    tone: str = "professional"


class ResponseGenerationResponse(BaseModel):
    response: str
    relevance_score: float
    citations: list[dict]
    metadata: dict


class SearchSkillsRequest(BaseModel):
    query: str
    top_k: int = 5


class SearchSkillsResponse(BaseModel):
    query: str
    skills: list[dict]
    experiences: list[dict]
    projects: list[dict]
    result_count: int


class HealthResponse(BaseModel):
    status: str
