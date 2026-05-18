# Resume RAG API Reference

Complete API documentation for the Resume RAG system.

## Base URL

```
http://localhost:8000
```

## Authentication

All endpoints are public (no authentication required for local/development use).

## Health Endpoints

### Health Check

```http
GET /health
```

Returns server status.

**Response:**
```json
{
  "status": "ok"
}
```

---

## Resume Management

### Upload Resume

```http
POST /api/v1/resume/upload
Content-Type: multipart/form-data
```

Upload a resume PDF or text file for processing.

**Parameters:**
- `file` (required): PDF or text file

**Response:**
```json
{
  "resume_id": "550e8400-e29b-41d4-a716-446655440000",
  "filename": "resume.pdf",
  "status": "processing",
  "chunks": 0,
  "uploaded_at": "2026-05-18T14:30:00Z"
}
```

**Status Values:**
- `pending` - Queued for processing
- `processing` - Currently being processed
- `ready` - Processing complete, ready to use
- `failed` - Processing failed

**Example:**
```bash
curl -X POST "http://localhost:8000/api/v1/resume/upload" \
  -H "Content-Type: multipart/form-data" \
  -F "file=@my_resume.pdf"
```

### Get Resume Status

```http
GET /api/v1/resume/{resume_id}
```

Get the processing status of a resume.

**Parameters:**
- `resume_id` (path, required): UUID of the resume

**Response:**
```json
{
  "resume_id": "550e8400-e29b-41d4-a716-446655440000",
  "filename": "resume.pdf",
  "status": "ready",
  "chunks": 42,
  "uploaded_at": "2026-05-18T14:30:00Z"
}
```

**Example:**
```bash
curl -X GET "http://localhost:8000/api/v1/resume/550e8400-e29b-41d4-a716-446655440000"
```

---

## Generation Endpoints

### Generate Cover Letter

```http
POST /api/v1/generate/cover-letter
Content-Type: application/json
```

Generate a personalized cover letter based on resume and job details.

**Request Body:**
```json
{
  "job_title": "Senior Backend Engineer",
  "company": "Tech Company Inc",
  "job_description": "We are looking for a Senior Backend Engineer with 5+ years of experience...",
  "specific_requirements": ["Python", "PostgreSQL", "Kubernetes"]
}
```

**Response:**
```json
{
  "cover_letter": "Dear Hiring Manager,\n\nI am writing to express my strong interest...",
  "relevance_score": 0.87,
  "citations": [
    {
      "section": "experience",
      "excerpt": "Led development of microservices architecture...",
      "relevance": 0.92
    }
  ],
  "metadata": {
    "job_title": "Senior Backend Engineer",
    "company": "Tech Company Inc",
    "chunks_used": 5,
    "requirements_matched": 3
  }
}
```

**Example:**
```bash
curl -X POST "http://localhost:8000/api/v1/generate/cover-letter" \
  -H "Content-Type: application/json" \
  -d '{
    "job_title": "Senior Backend Engineer",
    "company": "Tech Company Inc",
    "job_description": "We are looking for...",
    "specific_requirements": ["Python", "PostgreSQL"]
  }'
```

### Generate Application Response

```http
POST /api/v1/generate/response
Content-Type: application/json
```

Generate a response to a specific application question.

**Request Body:**
```json
{
  "prompt": "Tell us about your experience with distributed systems",
  "job_context": "Senior Backend Engineer at Tech Company",
  "tone": "professional"
}
```

**Response:**
```json
{
  "response": "Throughout my career, I have developed extensive experience with distributed systems...",
  "relevance_score": 0.85,
  "citations": [
    {
      "section": "experience",
      "excerpt": "Designed and implemented a distributed task queue...",
      "relevance": 0.91
    }
  ],
  "metadata": {
    "question": "Tell us about your experience with distributed systems",
    "tone": "professional",
    "chunks_used": 5
  }
}
```

**Parameters:**
- `prompt` (required): The application question
- `job_context` (optional): Context about the job to tailor response
- `tone` (optional, default: "professional"): Tone for the response

**Example:**
```bash
curl -X POST "http://localhost:8000/api/v1/generate/response" \
  -H "Content-Type: application/json" \
  -d '{
    "prompt": "Tell us about your experience with distributed systems",
    "job_context": "Senior Backend Engineer",
    "tone": "professional"
  }'
```

---

## Search Endpoints

### Search Skills and Experiences

```http
POST /api/v1/search/skills
Content-Type: application/json
```

Search for relevant skills and experiences in the resume.

**Request Body:**
```json
{
  "query": "Python and PostgreSQL experience",
  "top_k": 5
}
```

**Response:**
```json
{
  "query": "Python and PostgreSQL experience",
  "skills": [
    {
      "content": "Python, JavaScript, TypeScript, Go, PostgreSQL, Redis",
      "section": "skills",
      "relevance": 0.93
    }
  ],
  "experiences": [
    {
      "content": "Built a data pipeline using Python and PostgreSQL...",
      "section": "experience",
      "relevance": 0.88
    }
  ],
  "projects": [
    {
      "content": "Open source Python ORM for PostgreSQL",
      "section": "projects",
      "relevance": 0.85
    }
  ],
  "result_count": 3
}
```

**Parameters:**
- `query` (required): Search query
- `top_k` (optional, default: 5): Number of results to return

**Example:**
```bash
curl -X POST "http://localhost:8000/api/v1/search/skills" \
  -H "Content-Type: application/json" \
  -d '{
    "query": "Python and PostgreSQL experience",
    "top_k": 5
  }'
```

---

## Error Responses

All error responses follow this format:

```json
{
  "detail": "Error description"
}
```

### Common Status Codes

- `200` - Success
- `400` - Bad request (invalid parameters)
- `404` - Resource not found
- `422` - Validation error
- `500` - Server error

### Example Error Response

```json
{
  "detail": "No processed resume found. Please upload a resume first."
}
```

---

## Workflow Example

### Step 1: Upload Resume

```bash
curl -X POST "http://localhost:8000/api/v1/resume/upload" \
  -F "file=@resume.pdf"

# Response:
# {"resume_id": "550e8400-e29b-41d4-a716-446655440000", "status": "processing", ...}
```

### Step 2: Check Processing Status

```bash
curl -X GET "http://localhost:8000/api/v1/resume/550e8400-e29b-41d4-a716-446655440000"

# Response:
# {"status": "ready", "chunks": 42, ...}
```

### Step 3: Search for Relevant Skills

```bash
curl -X POST "http://localhost:8000/api/v1/search/skills" \
  -H "Content-Type: application/json" \
  -d '{"query": "Python and distributed systems", "top_k": 5}'
```

### Step 4: Generate Cover Letter

```bash
curl -X POST "http://localhost:8000/api/v1/generate/cover-letter" \
  -H "Content-Type: application/json" \
  -d '{
    "job_title": "Senior Backend Engineer",
    "company": "Tech Company",
    "job_description": "We are looking for...",
    "specific_requirements": ["Python", "PostgreSQL"]
  }'
```

### Step 5: Answer Application Questions

```bash
curl -X POST "http://localhost:8000/api/v1/generate/response" \
  -H "Content-Type: application/json" \
  -d '{
    "prompt": "Tell us about your experience with distributed systems",
    "job_context": "Senior Backend Engineer at Tech Company"
  }'
```

---

## Rate Limiting

Currently no rate limiting is implemented. For production use, add rate limiting via:
- API Gateway (if using cloud deployment)
- SlowAPI middleware in FastAPI
- Reverse proxy configuration (nginx, etc.)

## CORS

CORS is enabled for all origins by default. In production, restrict this in `app/main.py`:

```python
app.add_middleware(
    CORSMiddleware,
    allow_origins=["https://yourfrontend.com"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
```
