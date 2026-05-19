# Testing Guide

How to test the Resume RAG application locally.

## Quick Test (No Database Required)

Run the unit test suite:

```bash
cd ~/code/jesseolsen/rag

# Create virtual environment (if not already done)
python3 -m venv venv
source venv/bin/activate

# Install dependencies
pip install -r requirements.txt

# Run tests
pytest -v
```

This runs tests covering:
- ✅ Health check endpoint
- ✅ Root endpoint
- ✅ API routes registration
- ✅ Text chunking logic
- ✅ Resume section chunking
- ✅ Empty section handling

**Expected output:** All tests pass

## Full Integration Test (With Database)

For full testing with database and API calls:

### Option 1: Docker (Recommended)

```bash
# Make sure you have .env file with API keys
cp .env.example .env
# Edit .env and add your actual API keys:
# OPENAI_API_KEY=sk-proj-...
# ANTHROPIC_API_KEY=sk-ant-...

# Start PostgreSQL and API server
docker-compose up

# API is now available at http://localhost:8000

# In another terminal, test the API
curl http://localhost:8000/health
# {"status":"ok"}
```

### Option 2: Local PostgreSQL

If you have PostgreSQL installed locally:

```bash
# Create database
createdb resume_rag

# Enable pgvector
psql resume_rag -c "CREATE EXTENSION IF NOT EXISTS vector;"

# Set up environment
cp .env.example .env
# Edit .env with your API keys and:
# DATABASE_URL=postgresql+asyncpg://localhost/resume_rag

# Apply migrations
alembic upgrade head

# Start server
source venv/bin/activate
uvicorn app.main:app --reload

# API is now available at http://localhost:8000
```

## Testing the API

### 1. Health Check

```bash
curl http://localhost:8000/health
# {"status":"ok"}
```

### 2. Upload a Resume

Create a simple test resume or use an existing one:

```bash
curl -X POST "http://localhost:8000/api/v1/resume/upload" \
  -H "Content-Type: multipart/form-data" \
  -F "file=@/path/to/resume.pdf"

# Response:
# {
#   "resume_id": "550e8400-e29b-41d4-a716-446655440000",
#   "filename": "resume.pdf",
#   "status": "processing",
#   "chunks": 0,
#   "uploaded_at": "2026-05-18T14:30:00Z"
# }
```

Save the `resume_id` from the response.

### 3. Check Processing Status

```bash
curl http://localhost:8000/api/v1/resume/550e8400-e29b-41d4-a716-446655440000

# Response:
# {
#   "resume_id": "550e8400-e29b-41d4-a716-446655440000",
#   "filename": "resume.pdf",
#   "status": "ready",
#   "chunks": 42,
#   "uploaded_at": "2026-05-18T14:30:00Z"
# }
```

Wait until `status` is `"ready"`.

### 4. Search Resume Content

```bash
curl -X POST "http://localhost:8000/api/v1/search/skills" \
  -H "Content-Type: application/json" \
  -d '{
    "query": "Python and database experience",
    "top_k": 5
  }'

# Response:
# {
#   "query": "Python and database experience",
#   "skills": [...],
#   "experiences": [...],
#   "projects": [...],
#   "result_count": 3
# }
```

### 5. Generate Cover Letter

```bash
curl -X POST "http://localhost:8000/api/v1/generate/cover-letter" \
  -H "Content-Type: application/json" \
  -d '{
    "job_title": "Senior Backend Engineer",
    "company": "Tech Company",
    "job_description": "We are looking for a Senior Backend Engineer with 5+ years of experience building scalable systems...",
    "specific_requirements": ["Python", "PostgreSQL", "Docker"]
  }'

# Response:
# {
#   "cover_letter": "Dear Hiring Manager,\n\n...",
#   "relevance_score": 0.87,
#   "citations": [...],
#   "metadata": {...}
# }
```

### 6. Generate Application Response

```bash
curl -X POST "http://localhost:8000/api/v1/generate/response" \
  -H "Content-Type: application/json" \
  -d '{
    "prompt": "Tell us about your experience with distributed systems",
    "job_context": "Senior Backend Engineer at Tech Company",
    "tone": "professional"
  }'

# Response:
# {
#   "response": "Throughout my career, I have...",
#   "relevance_score": 0.85,
#   "citations": [...],
#   "metadata": {...}
# }
```

## Interactive Testing

### Swagger UI

Once the API is running, visit:

```
http://localhost:8000/docs
```

This provides an interactive interface to test all endpoints with built-in documentation.

### Example Flow in Swagger

1. Click on `/api/v1/resume/upload` → "Try it out"
2. Select a resume file and click "Execute"
3. Copy the `resume_id` from the response
4. Use it in other endpoints
5. Test `/api/v1/generate/cover-letter` with job details
6. See the generated cover letter

## Chrome Extension Testing

### Manual Testing

1. **Setup**
   - Start backend: `uvicorn app.main:app --reload`
   - Load extension in Chrome: `chrome://extensions/` → Load unpacked → `static/extension/`
   - Verify you have a resume uploaded

2. **Test Steps**
   - Navigate to a Greenhouse job form (e.g., https://job-boards.greenhouse.io/embed/job_app?for=coalition)
   - Click the Resume RAG extension icon
   - Verify backend URL is `http://localhost:8000`
   - Click **"Fill Form"**

3. **Verify these fields get filled**
   - First Name: From your resume
   - Last Name: From your resume
   - Email: From your resume
   - Phone: From your resume
   - City: From your resume
   - Country: USA (selected, not text)
   - How did you hear about us?: LinkedIn (checkbox checked)

### Debugging Extension

Open Chrome DevTools (F12) and look at the Console tab for logs prefixed with `[RESUME_RAG]`:
- `Content script loaded` - Extension active
- `Found X combobox inputs` - Dropdown detection
- `✓ Found "Target Value" at arrow N` - Successful dropdown selection
- `Form submission detected` - Form captured on submit
- `Form data saved to backend` - Data persisted successfully

## Troubleshooting

### Tests Won't Run

```bash
# Make sure you're in the virtual environment
source venv/bin/activate

# Reinstall dependencies
pip install -r requirements.txt

# Try with verbose output
pytest -vv
```

### Database Connection Error

```bash
# Check PostgreSQL is running
psql -l

# Or use Docker Compose instead
docker-compose up
```

### API Not Responding

```bash
# Check server is running (should see "Uvicorn running on...")
# Check the terminal where you started uvicorn

# Health check should work
curl http://localhost:8000/health

# If not, restart:
# Ctrl+C to stop
# uvicorn app.main:app --reload
```

### Resume Not Processing

```bash
# Check resume status
curl http://localhost:8000/api/v1/resume/{resume_id}

# If status is "failed", check the resume_metadata field for error details
# Ensure the PDF is valid and not corrupted
# Try with a text file instead (.txt format)
```

## Test Coverage

To see test coverage:

```bash
pip install pytest-cov
pytest --cov=app --cov-report=html
# Opens htmlcov/index.html for detailed report
```

## Performance Testing

For large resumes or many chunks:

```python
import time
import asyncio
from app.services.search import search_resume_content
from app.db import AsyncSessionLocal

async def test_search_performance():
    async with AsyncSessionLocal() as db:
        start = time.time()
        results = await search_resume_content(
            db, 
            resume_id="...",
            query="Python and machine learning",
            top_k=10
        )
        elapsed = time.time() - start
        print(f"Search took {elapsed:.2f}s")

asyncio.run(test_search_performance())
```

## CI/CD Testing

To set up GitHub Actions for testing:

Create `.github/workflows/tests.yml`:

```yaml
name: Tests
on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v2
      - uses: actions/setup-python@v2
        with:
          python-version: "3.11"
      - run: pip install -r requirements.txt
      - run: pytest -v
```

---

**Next:** Once tests pass, you're ready to deploy! See DEVELOPMENT.md for deployment options.
