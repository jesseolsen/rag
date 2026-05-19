from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from app.models.schemas import HealthResponse
from app.api import resume, generation, search, forms, field_answers
import os

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
app.include_router(forms.router)
app.include_router(field_answers.router)


@app.get("/", response_model=HealthResponse)
async def root():
    return HealthResponse(status="ok")


@app.get("/health", response_model=HealthResponse)
async def health():
    return HealthResponse(status="ok")


# Serve static files for frontend
static_dir = os.path.join(os.path.dirname(__file__), "..", "static")
if os.path.exists(static_dir):
    app.mount("/static", StaticFiles(directory=static_dir), name="static")


@app.get("/app")
async def frontend():
    """Serve the frontend application"""
    frontend_path = os.path.join(os.path.dirname(__file__), "..", "static", "index.html")
    if os.path.exists(frontend_path):
        return FileResponse(frontend_path)
    return {"message": "Frontend not found. Please create static/index.html"}
