# Resume RAG - Quick Start Guide

Get up and running with Resume RAG in 5 minutes.

## What You'll Need

- Python 3.9+
- PostgreSQL 14+ with pgvector
- OpenAI API key (for embeddings)
- Anthropic API key (for generation)

## Installation

### 1. Clone and Setup

```bash
cd ~/code/jesseolsen
git clone https://github.com/yourusername/rag.git
cd rag
```

### 2. Python Environment

```bash
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
```

### 3. Database

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

### 4. Configuration

```bash
cp .env.example .env
# Edit .env and add your API keys:
# OPENAI_API_KEY=sk-proj-...
# ANTHROPIC_API_KEY=sk-ant-...
```

### 5. Start Server

```bash
uvicorn app.main:app --reload
```

Visit: http://localhost:8000/docs

## Usage

### Upload Your Resume

```bash
curl -X POST "http://localhost:8000/api/v1/resume/upload" \
  -H "Content-Type: multipart/form-data" \
  -F "file=@my_resume.pdf"
```

### Generate a Cover Letter

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

### Answer an Application Question

```bash
curl -X POST "http://localhost:8000/api/v1/generate/response" \
  -H "Content-Type: application/json" \
  -d '{
    "prompt": "Tell us about your experience with distributed systems"
  }'
```

## API Documentation

Full API docs available at: http://localhost:8000/docs

All endpoints documented with examples.

## How It Works

1. **Upload Resume** → Extract text, detect sections, generate embeddings
2. **Job Description Input** → Parse requirements, search resume for matches
3. **Smart Retrieval** → Find most relevant skills and experiences
4. **AI Synthesis** → Claude creates personalized response
5. **Output** → Ready-to-use cover letter or application response

## Example Flow

```
You: Upload resume.pdf
↓
System: Processed! 42 chunks embedded
↓
You: Generate cover letter for "Backend Engineer at Google"
↓
System: Retrieving relevant experiences...
        Found: Python, distributed systems, API design...
        Generating with Claude...
↓
Result: Personalized 3-paragraph cover letter
```

## Tips

1. **Resume Format**: Clearly labeled sections help detection
   - Put "Skills", "Experience", "Education" as headers
   - One experience per bullet point
   - Clear section breaks

2. **Job Descriptions**: More detail = better results
   - Paste full job description
   - Include company description
   - List specific requirements

3. **Customization**: Generated content is a starting point
   - Edit before submitting
   - Add personal touches
   - Customize for each company

## Troubleshooting

**Can't connect to database?**
- Check PostgreSQL is running: `psql -l`
- Verify pgvector extension: `psql resume_rag -c "CREATE EXTENSION vector;"`
- Check DATABASE_URL in .env

**API Keys not working?**
- Check keys are valid
- Ensure no extra spaces in .env
- Verify .env is not in .gitignore

**Slow generation?**
- First request always slower (model initialization)
- Subsequent requests faster
- Check internet connection for API calls

**Resume not processing?**
- Ensure PDF is valid
- Try text-based resume format
- Check file size (should be <10MB)

## Next Steps

1. See API_REFERENCE.md for all endpoints
2. Check specs/architecture.md for how it works
3. Explore specs/prompts.md for generation strategies
4. Contribute improvements!

## Cost

- OpenAI embeddings: ~$0.01-0.05 per resume
- Claude generation: ~$0.01-0.05 per response
- Total: ~$0.02-0.10 per job application

## Support

- 📚 Full docs in README.md
- 🏗️ Architecture details in specs/architecture.md
- 💬 Questions? Open an issue!

---

Happy job hunting! 🚀
