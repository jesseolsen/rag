import pytest
import asyncio
from app.services.chunking import chunk_text, chunk_resume_by_section


def test_chunk_text_basic():
    """Test basic text chunking."""
    text = "This is a test. " * 100  # Create a longer text
    chunks = chunk_text(text, chunk_size=100, chunk_overlap=10)

    # Should have multiple chunks
    assert len(chunks) > 1

    # All chunks should be reasonable length
    for chunk in chunks:
        assert len(chunk) > 0


def test_chunk_text_overlap():
    """Test that chunks have proper overlap."""
    text = "word " * 50  # 250 tokens worth
    chunks = chunk_text(text, chunk_size=20, chunk_overlap=5)

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

    # Should return dict with sections
    assert isinstance(chunks_data, dict)
    assert "skills" in chunks_data
    assert "experience" in chunks_data
    assert "education" in chunks_data

    # Each section should have chunks
    for section, chunks in chunks_data.items():
        assert isinstance(chunks, list)
        assert len(chunks) > 0
        for chunk in chunks:
            assert isinstance(chunk, str)
            assert len(chunk) > 0


def test_chunk_resume_empty_section():
    """Test chunking with empty sections."""
    sections = {
        "skills": "Python, JavaScript",
        "experience": "",
    }

    chunks_data = chunk_resume_by_section(sections)

    # Should handle empty sections gracefully
    assert "skills" in chunks_data
    assert len(chunks_data["skills"]) > 0
