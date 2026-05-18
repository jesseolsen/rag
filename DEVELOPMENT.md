# Development Guide

Guide for developing and extending the Resume RAG system.

## Local Development Setup

### Prerequisites

- Python 3.11+
- PostgreSQL 14+ with pgvector
- Git

### Installation

```bash
# Clone the repository
git clone https://github.com/yourusername/rag.git
cd rag

# Create virtual environment
python3 -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt

# Create database
createdb resume_rag

# Enable pgvector extension
psql resume_rag -c "CREATE EXTENSION IF NOT EXISTS vector;"

# Copy and configure environment
cp .env.example .env
# Edit .env with your API keys:
# OPENAI_API_KEY=sk-proj-...
# ANTHROPIC_API_KEY=sk-ant-...

# Run migrations
alembic upgrade head

# Start development server
uvicorn app.main:app --reload
```

The API will be available at `http://localhost:8000/docs` (Swagger UI).

## Project Structure

```
rag/
├── app/
│   ├── __init__.py
│   ├── main.py                 # FastAPI application
│   ├── config.py               # Configuration and settings
│   ├── db.py                   # Database setup
│   ├── api/                    # API route handlers
│   │   ├── __init__.py
│   │   ├── resume.py           # Resume upload/status endpoints
│   │   ├── generation.py       # Cover letter/response generation
│   │   └── search.py           # Search endpoints
│   ├── models/
│   │   ├── __init__.py
│   │   ├── database.py         # SQLAlchemy ORM models
│   │   └── schemas.py          # Pydantic request/response models
│   └── services/               # Business logic
│       ├── __init__.py
│       ├── embeddings.py       # OpenAI embeddings
│       ├── resume_processor.py # PDF parsing, section detection
│       ├── chunking.py         # Text chunking logic
│       ├── search.py           # Vector search
│       └── generation.py       # Claude generation
├── alembic/                    # Database migrations
│   ├── env.py
│   ├── versions/
│   │   └── 001_initial_schema.py
│   └── script.py.mako
├── specs/                      # Architecture documentation
├── requirements.txt
├── .env.example
├── .gitignore
├── alembic.ini
├── Dockerfile
├── docker-compose.yml
├── README.md
├── QUICKSTART.md
├── API_REFERENCE.md
└── DEVELOPMENT.md
```

## Key Components

### Services

**embeddings.py**
- `generate_embeddings(text)` - Generate OpenAI embeddings (async)
- Handles single strings or lists
- Returns vectors for pgvector storage

**resume_processor.py**
- `extract_text_from_pdf(content)` - Extract text from PDF using PyMuPDF
- `detect_resume_sections(text)` - Detect and categorize resume sections

**chunking.py**
- `chunk_text(text, chunk_size, overlap)` - Token-based text splitting
- `chunk_resume_by_section(sections)` - Section-aware chunking

**search.py**
- `search_resume_content(db, resume_id, query, top_k)` - Semantic search (async)
- `get_section_chunks(db, resume_id, section, limit)` - Fetch specific sections (async)

**generation.py**
- `generate_cover_letter(job_title, company, job_description, resume_context)` - Generate cover letter (async)
- `generate_response(prompt, resume_context, job_context, tone)` - Generate Q&A response (async)

### Database Models

**Resume**
- `id` (UUID): Primary key
- `filename` (String)
- `content_type` (String)
- `file_content` (LargeBinary)
- `uploaded_at` (DateTime, auto)
- `processed_at` (DateTime, nullable)
- `status` (Enum: pending, processing, ready, failed)
- `resume_metadata` (JSONB)

**ResumeSectionChunk**
- `id` (UUID): Primary key
- `resume_id` (UUID): Foreign key
- `section` (String): skills, experience, education, projects, summary
- `content` (Text): Chunk content
- `embedding` (Vector(1536)): OpenAI embedding
- `chunk_index` (Integer): Position in section
- `created_at` (DateTime, auto)

## Development Workflows

### Adding a New API Endpoint

1. **Define schema** in `app/models/schemas.py`:
```python
class NewRequest(BaseModel):
    param1: str
    param2: int

class NewResponse(BaseModel):
    result: str
```

2. **Create service** in `app/services/`:
```python
async def new_operation(param1: str, param2: int) -> str:
    # Implementation
    pass
```

3. **Add endpoint** in `app/api/new_feature.py`:
```python
from fastapi import APIRouter, Depends

router = APIRouter(prefix="/api/v1/new", tags=["new"])

@router.post("/operation", response_model=NewResponse)
async def new_endpoint(request: NewRequest, db: AsyncSession = Depends(get_db)):
    result = await new_operation(request.param1, request.param2)
    return NewResponse(result=result)
```

4. **Register router** in `app/main.py`:
```python
from app.api import new_feature
app.include_router(new_feature.router)
```

### Adding a Migration

```bash
# Create migration
alembic revision --autogenerate -m "description of changes"

# The migration file is created in alembic/versions/

# Apply migration
alembic upgrade head

# Rollback (if needed)
alembic downgrade -1
```

### Running Tests

```bash
# Install test dependencies
pip install pytest pytest-asyncio pytest-httpx

# Run tests
pytest

# Run with coverage
pytest --cov=app tests/
```

## Configuration

Environment variables in `.env`:

```bash
# Database
DATABASE_URL=postgresql+asyncpg://user:password@localhost/resume_rag

# APIs
OPENAI_API_KEY=sk-proj-...
ANTHROPIC_API_KEY=sk-ant-...

# Server
HOST=localhost
PORT=8000
DEBUG=true

# Search
SIMILARITY_THRESHOLD=0.65
SEARCH_TOP_K=5

# Generation
GENERATION_MODEL=claude-3-opus-20240229
MAX_GENERATION_TOKENS=2000
```

## Async Patterns

This codebase uses async/await throughout:

```python
# Endpoint
@router.post("/example")
async def example_endpoint(db: AsyncSession = Depends(get_db)):
    # Query
    result = await db.execute(select(Model).where(...))
    
    # Service call
    output = await service_function(...)
    
    return output

# Service
async def service_function(param: str) -> str:
    # Can call other async functions
    result = await another_async_function(param)
    return result
```

## Performance Considerations

1. **Embeddings** - Cache frequently searched queries
2. **Chunks** - Keep under 1000 tokens for better retrieval
3. **Connections** - Use connection pooling (default in asyncpg)
4. **Indexes** - HNSW index on embeddings for O(log n) search
5. **Batch operations** - Use session.add_all() for bulk inserts

## Debugging

### Enable SQL logging
```bash
# In .env or code
DEBUG=true
```

### Test API manually
```bash
# In Python shell
python3
>>> import asyncio
>>> from app.services.search import search_resume_content
>>> from app.db import AsyncSessionLocal
>>> async def test():
...     async with AsyncSessionLocal() as db:
...         results = await search_resume_content(db, resume_id, "Python")
...         print(results)
>>> asyncio.run(test())
```

### Database queries
```bash
# Connect to database
psql resume_rag

# Useful queries
SELECT count(*) FROM resume_chunks;
SELECT section, count(*) FROM resume_chunks GROUP BY section;
```

## Deployment

### Docker

```bash
# Build image
docker build -t resume-rag .

# Run with docker-compose
docker-compose up -d

# View logs
docker-compose logs -f api
```

### Production Checklist

- [ ] Set `DEBUG=false`
- [ ] Use strong database password
- [ ] Configure CORS for your frontend domain
- [ ] Set up monitoring/logging
- [ ] Use environment variables for all secrets
- [ ] Enable rate limiting
- [ ] Set up automated backups
- [ ] Use a reverse proxy (nginx, etc.)
- [ ] Enable HTTPS/TLS
- [ ] Set up alerting for failed jobs

## Contributing

1. Create a feature branch: `git checkout -b feature/your-feature`
2. Make changes and commit: `git commit -am "Add your feature"`
3. Push to branch: `git push origin feature/your-feature`
4. Submit a pull request

## Troubleshooting

### Import errors
```bash
# Reinstall dependencies
pip install -r requirements.txt --force-reinstall
```

### Database connection errors
```bash
# Test connection
psql resume_rag -c "SELECT 1;"

# Reset database
dropdb resume_rag
createdb resume_rag
psql resume_rag -c "CREATE EXTENSION vector;"
alembic upgrade head
```

### API not responding
```bash
# Check if server is running
curl http://localhost:8000/health

# View logs
# Check terminal where uvicorn is running
```

## Performance Profiling

```python
# In a script or endpoint
import time

start = time.time()
# Code to profile
elapsed = time.time() - start
print(f"Took {elapsed:.2f}s")
```

## Further Reading

- [FastAPI Documentation](https://fastapi.tiangolo.com/)
- [SQLAlchemy 2.0](https://docs.sqlalchemy.org/en/20/)
- [pgvector Documentation](https://github.com/pgvector/pgvector)
- [OpenAI API](https://platform.openai.com/docs/api-reference)
- [Anthropic API](https://docs.anthropic.com/)
