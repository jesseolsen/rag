# Resume RAG - Specifications

This directory contains all design and planning documents for the Resume RAG project.

## Philosophy

- **Spec-first development**: All features are documented before implementation
- **Transparency**: All prompts, algorithms, and decisions are visible
- **No secrets**: This is a public repository - no credentials, API keys, or PII
- **Clean architecture**: Clear separation of concerns, well-organized code

## Structure

```
specs/
├── README.md              # This file
├── architecture.md        # System design and data flow
├── prompts.md            # Prompt engineering guide
└── phase-*.md            # Implementation plans for each phase
```

## Development Workflow

1. **Plan**: Document feature in specs/
2. **Design**: Create architecture and prompts
3. **Implement**: Code following the design
4. **Test**: Verify with real resume data
5. **Document**: Update specs with decisions
6. **Commit**: Single meaningful commit

## Phases

### Phase 1: Core RAG (Current)
- Resume upload and processing
- Semantic search of resume content
- Cover letter generation
- Job-specific response generation
- Basic API endpoints

### Phase 2: Enhancement
- Resume optimization suggestions
- Interview preparation Q&A
- Application templates

### Phase 3: Scale
- Web UI (Next.js)
- Browser extension
- Job board integration

## Key Decisions

- **Why pgvector?** : HNSW indexes are efficient for similarity search, no separate vector DB needed
- **Why Claude?** : Better at synthesis, larger context window, superior instruction following
- **Why FastAPI?** : Modern async framework, excellent for RAG applications
- **Local-first?** : All data processing can run locally, optional cloud deployment

## No Secrets Policy

This repository is public on GitHub. It contains:
- ✅ All code and algorithms
- ✅ All prompt templates
- ✅ Architecture and design decisions
- ❌ API keys (environment variables only)
- ❌ Personal PII (example names, emails only)
- ❌ Resume samples with real data

See .env.example for configuration template - users provide their own credentials.

## Contributing

Want to help? Great!
1. Fork the repo
2. Follow the spec-first approach
3. Document in specs/ before coding
4. Submit a pull request

See individual spec files for detailed information.
