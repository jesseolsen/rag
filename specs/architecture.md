# Resume RAG - System Architecture

## Overview

Resume RAG is a Retrieval-Augmented Generation (RAG) system that:
1. Ingests a user's resume
2. Extracts and embeds relevant content
3. Searches for relevant experiences for each job application
4. Generates tailored application materials using Claude

## Data Flow

```
┌─────────────────┐
│  Resume (PDF)   │
└────────┬────────┘
         │
         ▼
┌──────────────────────┐
│  Extract Text (PyMuPDF)
│  Detect Sections     │
└────────┬─────────────┘
         │
         ▼
┌──────────────────────┐
│  Chunk by Section    │
│  (~400 token chunks) │
└────────┬─────────────┘
         │
         ▼
┌──────────────────────┐
│ Generate Embeddings  │
│ (OpenAI, 1536-dim)   │
└────────┬─────────────┘
         │
         ▼
┌──────────────────────┐
│ Store in PostgreSQL  │
│ (with pgvector)      │
└──────────────────────┘

Application Request:
┌──────────────────────┐
│  Job Description     │
│  Application Prompt  │
└────────┬─────────────┘
         │
         ▼
┌──────────────────────┐
│  Semantic Search     │
│  Find Relevant       │
│  Experiences (top-10)│
└────────┬─────────────┘
         │
         ▼
┌──────────────────────┐
│  Generate Response   │
│  Using Claude 3      │
│  + Context           │
└────────┬─────────────┘
         │
         ▼
┌──────────────────────┐
│ Personalized Output  │
│ - Cover Letter       │
│ - Response Answer    │
│ - About Section      │
└──────────────────────┘
```

## Components

### 1. Resume Processing Pipeline
**Files**: `services/resume_processor.py`, `services/chunking.py`

**Process**:
- Extract text from PDF using PyMuPDF
- Detect resume sections (skills, experience, education, projects)
- Chunk by section to preserve context
- Create sections: "skills", "experience", "education", "projects", "summary"

**Chunking Strategy**:
- Target: ~400 tokens per chunk (smaller than document chunks for precision)
- Overlap: ~100 tokens (maintain continuity)
- Section-aware: Keep related content together

### 2. Embedding Generation
**Files**: `services/embeddings.py`

**Process**:
- Use OpenAI text-embedding-3-small (1536 dimensions)
- Generate embeddings for each chunk
- Store in PostgreSQL with pgvector

**Cost**: ~$0.01-0.05 per resume (all chunks embedded once)

### 3. Semantic Search
**Files**: `services/search.py`

**Process**:
- Generate embedding for job description or prompt
- Search using pgvector cosine similarity
- Filter by threshold (default 0.65)
- Return top-10 most relevant chunks

**Why pgvector?**
- Native PostgreSQL, no separate database
- HNSW index for O(1) approximate nearest neighbor search
- Cosine distance suitable for text embeddings

### 4. Generation Service
**Files**: `services/generation.py`

**Process**:
- Retrieve top-10 relevant resume chunks
- Combine with job description/prompt
- Send to Claude 3 Opus for generation
- Return personalized output with metadata

**Prompts**:
- System prompt defines Claude's role
- User prompt includes job context + resume snippets
- Template for cover letters vs. Q&A responses

**Cost**: ~$0.01-0.05 per response

### 5. API Layer
**Files**: `api/resume.py`, `api/generation.py`, `api/search.py`

**Endpoints**:
- `POST /api/v1/resume/upload` - Upload and process resume
- `POST /api/v1/generate/cover-letter` - Generate cover letter
- `POST /api/v1/generate/response` - Answer application question
- `POST /api/v1/search/skills` - Search resume for skills

## Database Schema

### resumes table
```sql
CREATE TABLE resumes (
    id UUID PRIMARY KEY,
    filename VARCHAR(255),
    content_type VARCHAR(100),
    file_content BYTEA,
    uploaded_at TIMESTAMP,
    processed_at TIMESTAMP,
    status ENUM('pending', 'processing', 'ready', 'failed'),
    resume_metadata JSONB
);
```

### resume_chunks table
```sql
CREATE TABLE resume_chunks (
    id UUID PRIMARY KEY,
    resume_id UUID REFERENCES resumes(id),
    section VARCHAR(50),  -- 'skills', 'experience', 'education', 'projects', 'summary'
    content TEXT,
    embedding vector(1536),
    chunk_index INTEGER,
    created_at TIMESTAMP
);

CREATE INDEX idx_embedding ON resume_chunks 
    USING hnsw(embedding vector_cosine_ops);
CREATE INDEX idx_resume_id ON resume_chunks(resume_id);
CREATE INDEX idx_section ON resume_chunks(section);
```

## Data Flow for Generation

```
Job Posting Input
├─ Job Title
├─ Company
├─ Job Description
└─ Specific Requirements

        ↓

Resume Context Retrieval
├─ Search for relevant skills
├─ Search for relevant experiences
├─ Search for relevant projects
└─ Compile top-10 chunks

        ↓

Prompt Assembly
├─ System: Generation guidelines
├─ Context: Retrieved resume chunks
└─ User: Job description + instruction

        ↓

Claude 3 Opus
├─ Synthesize personalized content
└─ Maintain authenticity to resume

        ↓

Output
├─ Generated text (cover letter / response)
├─ Relevance score
└─ Citations (which chunks were used)
```

## Key Design Decisions

### 1. Section-Aware Chunking
Rather than chunking the entire resume as a single document, we:
- Detect resume sections
- Chunk within each section
- Tag chunks with section type
- This improves relevance when searching for specific skills/experiences

### 2. Small Chunk Size (400 tokens)
- Reduces noise in search results
- More precise matching for queries
- Multiple chunks per section provides options
- Tradeoff: More chunks to embed (higher cost)

### 3. Semantic Search Over Keyword
- "Backend engineer" query finds Python, Golang, etc.
- "Distributed systems" query finds scaling experiences
- Handles paraphrasing and synonyms
- More robust than regex/keyword matching

### 4. Claude for Generation
Chosen over GPT-4 because:
- Better synthesis of long contexts
- Larger context window (200k vs 128k)
- Superior instruction following
- Better at maintaining voice/tone

### 5. No Persistent Storage
- Resume chunks NOT stored permanently
- Generated after processing
- User controls data lifecycle
- Privacy-friendly

## Technology Rationale

| Component | Choice | Rationale |
|-----------|--------|-----------|
| Framework | FastAPI | Async, modern, great for RAG |
| Database | PostgreSQL | pgvector native support, reliable |
| Embeddings | OpenAI | Quality, pricing, reliability |
| Generation | Claude | Best synthesis, large context |
| Vector Search | pgvector | No separate DB, efficient HNSW |
| Chunking | Token-based | Precise, language-aware |

## Scalability Considerations

### Current (Single Resume)
- One resume at a time
- Real-time processing
- <1 minute for most resumes

### Future (Multiple Resumes)
- Database for storing multiple user resumes
- Background processing queue
- Resume versioning

### Performance
- Embedding generation: Batch API calls
- Search: O(1) with HNSW index
- Generation: Streaming responses for large outputs

## Privacy & Security

- ✅ No resume data persisted (optional)
- ✅ API keys in .env only
- ✅ All prompts visible (no black boxes)
- ✅ Open source (code audit possible)
- ✅ Local-first design

## Cost Breakdown

Per resume + application:
- Resume upload & embed: ~$0.01-0.05
- Per generation: ~$0.01-0.05
- **Total: $0.02-0.10 per job application**

At scale (100 applications): ~$2-10
