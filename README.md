# Resume RAG - AI-Powered Job Application Assistant

A Retrieval-Augmented Generation (RAG) system that uses your resume to generate tailored job application materials. Upload your resume once, then quickly generate customized cover letters, response answers, and application materials for job postings.

## Overview

**Problem**: Job applications are repetitive and time-consuming. You write similar content over and over: "Tell us about your experience", "Why do you want this job?", etc.

**Solution**: Upload your resume once. Then for each job posting, the system:
1. Reads the job description
2. Retrieves relevant experience from your resume
3. Generates tailored application materials

## Features

- 📄 **Resume Ingestion**: Upload your resume (PDF or text)
- 🔍 **Semantic Search**: Find relevant skills and experiences
- ✍️ **Smart Generation**: Tailored cover letters and responses
- 📋 **Multiple Formats**: Generate different types of application materials
- 💾 **No Storage**: Your resume data stays local (when using locally)
- 🔓 **Open Source**: All code and prompts visible

## Technology Stack

- **Backend**: FastAPI (Python)
- **Database**: PostgreSQL + pgvector (vector embeddings)
- **Embeddings**: OpenAI text-embedding-3-small
- **Generation**: Claude 3 (Anthropic)
- **Search**: pgvector HNSW index

## Quick Start

### Prerequisites
- Python 3.9+
- PostgreSQL 14+ with pgvector
- OpenAI API key (for embeddings)
- Anthropic API key (for generation)

### Installation

```bash
# Clone the repo
git clone https://github.com/jesseolsen/rag.git
cd rag

# Create virtual environment
python3 -m venv venv
source venv/bin/activate

# Install dependencies
pip install -r requirements.txt

# Copy example environment
cp .env.example .env
# Edit .env with your API keys
```

### Database Setup

```bash
# Create database
createdb resume_rag

# Enable pgvector
psql resume_rag
CREATE EXTENSION vector;
\q

# Run migrations
alembic upgrade head
```

### Start the Server

```bash
source venv/bin/activate
uvicorn app.main:app --reload
```

Visit: http://localhost:8000/docs

## Usage Examples

### 1. Upload Your Resume

```bash
curl -X POST "http://localhost:8000/api/v1/resume/upload" \
  -H "Content-Type: multipart/form-data" \
  -F "file=@my_resume.pdf"
```

Response:
```json
{
  "resume_id": "uuid",
  "filename": "my_resume.pdf",
  "status": "processed",
  "chunks": 42,
  "uploaded_at": "2026-05-18T10:30:00Z"
}
```

### 2. Generate Cover Letter

```bash
curl -X POST "http://localhost:8000/api/v1/generate/cover-letter" \
  -H "Content-Type: application/json" \
  -d '{
    "job_title": "Senior Backend Engineer",
    "company": "Acme Corp",
    "job_description": "We are looking for a Senior Backend Engineer...",
    "specific_requirements": ["Python", "PostgreSQL", "Kubernetes"]
  }'
```

### 3. Generate Response to Prompt

```bash
curl -X POST "http://localhost:8000/api/v1/generate/response" \
  -H "Content-Type: application/json" \
  -d '{
    "prompt": "Tell us about your experience with distributed systems",
    "job_context": "SRE role at a scale-up"
  }'
```

## API Endpoints

### Resume Management
- `POST /api/v1/resume/upload` - Upload resume
- `GET /api/v1/resume` - Get current resume
- `DELETE /api/v1/resume` - Delete resume

### Generation
- `POST /api/v1/generate/cover-letter` - Generate cover letter
- `POST /api/v1/generate/response` - Generate prompt response
- `POST /api/v1/generate/about` - Generate "About You" section
- `GET /api/v1/generate/templates` - Get prompt templates

### Search
- `POST /api/v1/search/skills` - Find relevant skills
- `POST /api/v1/search/experiences` - Find relevant experiences
- `POST /api/v1/search/projects` - Find relevant projects

## File Structure

```
rag/
├── README.md                    # This file
├── requirements.txt             # Python dependencies
├── .env.example                 # Environment variables template
├── app/
│   ├── main.py                 # FastAPI application
│   ├── config.py               # Configuration
│   ├── db.py                   # Database connection
│   ├── models/
│   │   ├── database.py         # SQLAlchemy models
│   │   └── schemas.py          # Pydantic schemas
│   ├── api/
│   │   ├── resume.py           # Resume endpoints
│   │   ├── generation.py       # Generation endpoints
│   │   └── search.py           # Search endpoints
│   └── services/
│       ├── resume_processor.py # Resume text extraction
│       ├── chunking.py         # Text chunking strategy
│       ├── embeddings.py       # OpenAI embeddings
│       ├── generation.py       # Claude generation
│       └── search.py           # Semantic search
├── alembic/                     # Database migrations
└── specs/
    ├── README.md               # Development principles
    ├── architecture.md         # System architecture
    └── prompts.md             # Prompt engineering guide
```

## Development

### Project Philosophy

- **Spec-first**: All features planned before coding
- **Vertical slices**: Each feature is end-to-end
- **Transparency**: All prompts visible in /specs/
- **No secrets in repo**: Environment variables only
- **Clean code**: Well-organized, documented

### Adding a Feature

1. Document in `/specs/`
2. Plan implementation in `/specs/feature-plan.md`
3. Implement with clear separation of concerns
4. Test with real data
5. Commit with descriptive message

## Privacy & Security

- ✅ No resume data stored permanently (clean up after generation)
- ✅ API keys in .env only (never committed)
- ✅ All prompts visible (no black boxes)
- ✅ Open source (code review possible)
- ✅ Local-first design (can run entirely locally)

## Cost

- **Infrastructure**: $0 if self-hosted, ~$10-50/month for cloud DB
- **API Usage**:
  - OpenAI embeddings: ~$0.01-0.05 per resume upload
  - Claude generation: ~$0.01-0.05 per application response
- **Estimated**: $0-50/month depending on usage

## Roadmap

### Phase 1 (Current)
- ✅ Resume upload and processing
- ✅ Semantic search of resume content
- ✅ Cover letter generation
- ✅ Response generation

### Phase 2
- [ ] Resume optimization suggestions
- [ ] Interview prep Q&A
- [ ] Salary negotiation guides

### Phase 3
- [ ] Job posting tracker
- [ ] Application history
- [ ] Success rate analytics

### Phase 4
- [ ] Web UI (Next.js)
- [ ] Browser extension for job boards
- [ ] Multi-resume support

## Contributing

Contributions welcome! Please:
1. Fork the repo
2. Create a feature branch
3. Follow the spec-first approach
4. Submit a PR with description

## License

MIT - Feel free to use and modify

## Support

- 📚 See QUICKSTART.md for detailed examples
- 🤔 Check /specs/ for design decisions
- 💬 Open an issue for bugs or feature requests

---

Made with ❤️ for job seekers who value their time
