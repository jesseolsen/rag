from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.models.schemas import HealthResponse
from app.api import resume, generation, search

app = FastAPI(
    title="Resume RAG",
    description="AI-powered resume-based job application assistant",
    version="0.1.0"
)

# Configure CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include routers
app.include_router(resume.router)
app.include_router(generation.router)
app.include_router(search.router)


@app.get("/", response_model=HealthResponse)
async def root():
    return HealthResponse(status="ok")


@app.get("/health", response_model=HealthResponse)
async def health():
    return HealthResponse(status="ok")
