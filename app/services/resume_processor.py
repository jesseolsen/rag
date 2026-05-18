import fitz
from typing import Tuple, Dict, List


class ResumeProcessingError(Exception):
    pass


def extract_text_from_pdf(file_content: bytes) -> Tuple[str, Dict]:
    """Extract text from PDF using PyMuPDF."""
    try:
        pdf = fitz.open(stream=file_content, filetype="pdf")

        full_text = ""
        metadata = {}

        # Extract metadata
        try:
            metadata = pdf.metadata or {}
        except:
            pass

        # Extract text
        for page_num in range(len(pdf)):
            page = pdf[page_num]
            full_text += page.get_text()

        pdf.close()

        return full_text, metadata

    except Exception as e:
        raise ResumeProcessingError(f"Failed to extract PDF text: {str(e)}")


def detect_resume_sections(text: str) -> Dict[str, str]:
    """Detect common resume sections."""
    sections = {}
    current_section = "other"
    current_content = []

    section_keywords = {
        "skills": ["skills", "technical skills", "competencies", "expertise"],
        "experience": ["experience", "work history", "professional experience", "employment"],
        "education": ["education", "degree", "university", "college"],
        "projects": ["projects", "portfolio", "case studies"],
        "summary": ["summary", "objective", "about", "professional summary"],
    }

    for line in text.split("\n"):
        line_lower = line.lower().strip()

        # Check if this line starts a new section
        for section, keywords in section_keywords.items():
            if any(keyword in line_lower for keyword in keywords):
                if current_section and current_content:
                    sections[current_section] = "\n".join(current_content)
                current_section = section
                current_content = []
                break
        else:
            # Not a section header, add to current section
            if line.strip():
                current_content.append(line)

    # Add last section
    if current_section and current_content:
        sections[current_section] = "\n".join(current_content)

    return sections
