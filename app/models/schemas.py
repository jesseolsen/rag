from pydantic import BaseModel
from datetime import datetime
from uuid import UUID
import enum
from typing import Optional, Dict, Any


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


class ResumeDataResponse(BaseModel):
    resume_id: str
    filename: str
    status: str
    name: Optional[str] = None
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    location: Optional[str] = None
    city: Optional[str] = None
    state: Optional[str] = None
    linkedin: Optional[str] = None
    website: Optional[str] = None
    summary: Optional[str] = None
    experience: list = []
    education: list = []
    skills: list = []
    projects: list = []


class FormResponseRequest(BaseModel):
    url: str
    timestamp: datetime
    data: Dict[str, Any]
    source: str = "extension"


class FormResponseResponse(BaseModel):
    id: str
    url: str
    form_data: Dict[str, Any]
    submitted_at: datetime
    source: str

    class Config:
        from_attributes = True


class FormFieldAnswerRequest(BaseModel):
    resume_id: Optional[str] = None
    question_text: str
    answer_text: str
    field_type: str = "text"
    field_id: Optional[str] = None


class FormFieldAnswerResponse(BaseModel):
    id: str
    resume_id: Optional[str]
    question_keywords: str
    question_text: str
    answer_text: str
    field_type: str
    created_at: datetime
    last_used_at: Optional[datetime]
    use_count: int

    class Config:
        from_attributes = True


class FormFieldAnswerListResponse(BaseModel):
    answers: list[FormFieldAnswerResponse]
    count: int
