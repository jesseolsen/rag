import tiktoken
from typing import List, Dict


def chunk_text(text: str, chunk_size: int = 800, overlap: int = 200) -> List[str]:
    """Chunk text by tokens with overlap."""
    try:
        encoding = tiktoken.encoding_for_model("gpt-3.5-turbo")
        tokens = encoding.encode(text)
    except:
        # Fallback: rough estimate (1 word ≈ 1.3 tokens)
        words = text.split()
        tokens = words
        chunk_size = int(chunk_size / 1.3)
        overlap = int(overlap / 1.3)

    chunks = []
    for i in range(0, len(tokens), chunk_size - overlap):
        chunk_tokens = tokens[i:i + chunk_size]
        if isinstance(chunk_tokens[0], int):
            # Token-based
            try:
                chunk_text = encoding.decode(chunk_tokens)
            except:
                chunk_text = " ".join(str(t) for t in chunk_tokens)
        else:
            # Word-based fallback
            chunk_text = " ".join(chunk_tokens)

        if chunk_text.strip():
            chunks.append(chunk_text.strip())

    return chunks


def chunk_resume_by_section(sections: Dict[str, str], chunk_size: int = 400) -> List[Dict[str, str]]:
    """Chunk resume by section with smaller chunks for better retrieval."""
    result = []

    for section_name, section_text in sections.items():
        if not section_text.strip():
            continue

        # Chunk each section separately
        chunks = chunk_text(section_text, chunk_size=chunk_size, overlap=100)

        for idx, chunk in enumerate(chunks):
            result.append({
                "section": section_name,
                "content": chunk,
                "chunk_index": idx,
            })

    return result
