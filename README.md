# Resume RAG - AI-Powered Job Application Assistant

A Chrome extension that automatically fills job application forms with your resume data, plus a backend API for generating tailored cover letters and responses.

## Quick Start

### Chrome Extension (Primary Use Case)

1. Start the backend: `uvicorn app.main:app --reload`
2. Load the extension in Chrome: `chrome://extensions/` → Load unpacked → select `static/extension/`
3. Upload your resume via the extension popup
4. Navigate to a job application form and click "Fill Form"

See [CHROME_EXTENSION.md](CHROME_EXTENSION.md) for detailed setup and usage.

### Backend API

```bash
# Install dependencies
pip install -r requirements.txt

# Setup database
createdb resume_rag
psql resume_rag -c "CREATE EXTENSION vector;"
alembic upgrade head

# Start server
uvicorn app.main:app --reload
```

API documentation available at http://localhost:8000/docs

## Features

- **Chrome Extension**: Auto-fills Greenhouse job application forms with resume data
- **Resume Management**: Upload and manage multiple resumes
- **Smart Field Matching**: Recognizes common form field patterns
- **Backend API**: Generate cover letters and responses using RAG
- **Semantic Search**: Find relevant skills and experiences in your resume

## Technology Stack

- **Backend**: FastAPI (Python)
- **Database**: PostgreSQL + pgvector (vector embeddings)
- **Embeddings**: Sentence Transformers (all-MiniLM-L6-v2, local model)
- **Generation**: Claude (Anthropic)
- **Extension**: Chrome Extension Manifest V3

## Documentation

- [CHROME_EXTENSION.md](CHROME_EXTENSION.md) - Extension setup and usage
- [API_REFERENCE.md](API_REFERENCE.md) - Complete API documentation
- [DEVELOPMENT.md](DEVELOPMENT.md) - Development guide
- [TESTING.md](TESTING.md) - Testing procedures

## File Structure

```
rag/
├── app/                    # FastAPI backend
│   ├── api/               # API endpoints
│   ├── models/            # Database models and schemas
│   └── services/         # Business logic
├── static/extension/      # Chrome extension
├── alembic/               # Database migrations
├── specs/                 # Architecture documentation
└── tests/                 # Test suite
```

## Contributing

Contributions welcome! Please follow the spec-first approach documented in `/specs/`.

## License

MIT
