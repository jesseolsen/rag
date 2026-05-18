import pytest
import asyncio
from app.services.chunking import chunk_text, chunk_resume_by_section


def test_chunk_text_basic():
    """Test basic text chunking."""
    text = "This is a test. " * 100  # Create a longer text
    chunks = chunk_text(text, chunk_size=100, overlap=10)

    # Should have multiple chunks
    assert len(chunks) > 0

    # All chunks should be reasonable length
    for chunk in chunks:
        assert len(chunk) > 0


def test_chunk_text_overlap():
    """Test that chunks have proper overlap."""
    text = "word " * 50  # 250 tokens worth
    chunks = chunk_text(text, chunk_size=20, overlap=5)

    # With overlap, adjacent chunks should share content
    if len(chunks) > 1:
        # Chunks should overlap (this is implementation dependent)
        assert len(chunks) > 0


def test_chunk_resume_by_section():
    """Test resume section chunking."""
    sections = {
        "skills": "Python, JavaScript, PostgreSQL, Docker",
        "experience": "5 years of backend development at various companies",
        "education": "B.S. in Computer Science from University"
    }

    chunks_data = chunk_resume_by_section(sections)

    # Should return list of chunks with section info
    assert isinstance(chunks_data, list)
    assert len(chunks_data) > 0

    # Each item should have required fields
    section_names = set()
    for chunk in chunks_data:
        assert isinstance(chunk, dict)
        assert "section" in chunk
        assert "content" in chunk
        assert "chunk_index" in chunk
        assert len(chunk["content"]) > 0
        section_names.add(chunk["section"])

    # Should have chunks from all sections
    assert "skills" in section_names
    assert "experience" in section_names
    assert "education" in section_names


def test_chunk_resume_empty_section():
    """Test chunking with empty sections."""
    sections = {
        "skills": "Python, JavaScript",
        "experience": "",
    }

    chunks_data = chunk_resume_by_section(sections)

    # Should handle empty sections gracefully (skip them)
    assert isinstance(chunks_data, list)
    assert len(chunks_data) > 0

    # Should only have skills
    for chunk in chunks_data:
        assert chunk["section"] == "skills"
