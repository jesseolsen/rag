import re
from typing import Dict, List, Any


def extract_contact_info(text: str) -> Dict[str, str]:
    """Extract name, email, phone, and location from resume text."""
    info = {}

    # Extract email
    email_pattern = r'[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}'
    email_match = re.search(email_pattern, text)
    if email_match:
        info['email'] = email_match.group()

    # Extract phone (various formats)
    phone_pattern = r'(?:\+?1[-.\s]?)?\(?([0-9]{3})\)?[-.\s]?([0-9]{3})[-.\s]?([0-9]{4})'
    phone_match = re.search(phone_pattern, text)
    if phone_match:
        info['phone'] = phone_match.group()

    # Extract location (look for city, state pattern)
    location_pattern = r'([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\s*,\s*[A-Z]{2}'
    location_match = re.search(location_pattern, text)
    if location_match:
        info['location'] = location_match.group()

    # Extract name (usually first line or before email)
    lines = text.split('\n')
    for line in lines[:5]:
        line = line.strip()
        if line and len(line) < 80 and not any(char.isdigit() for char in line if len(line) > 20):
            # Check if this looks like a name (words capitalized)
            if re.match(r'^[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*$', line):
                info['name'] = line
                break

    return info


def extract_summary(text: str) -> str:
    """Extract professional summary or objective."""
    lines = text.split('\n')
    summary_started = False
    summary_lines = []

    section_headers = ['summary', 'objective', 'about', 'professional summary', 'profile']

    for i, line in enumerate(lines):
        line_lower = line.lower().strip()

        # Check if this is a summary section header
        if any(header in line_lower for header in section_headers):
            summary_started = True
            continue

        # Stop if we hit another section
        if summary_started and any(word in line_lower for word in ['experience', 'education', 'skills', 'projects', 'awards']):
            break

        # Collect summary lines
        if summary_started and line.strip():
            summary_lines.append(line.strip())

    summary_text = ' '.join(summary_lines)
    # Return first ~300 characters
    return summary_text[:300] if summary_text else None


def extract_skills(sections: Dict[str, str]) -> List[str]:
    """Extract skills from resume sections."""
    skills = []

    if 'skills' in sections:
        # Split by common delimiters
        text = sections['skills']
        # Remove bullet points and common prefixes
        text = re.sub(r'^[\s•\-*]+', '', text, flags=re.MULTILINE)
        potential_skills = [s.strip() for s in re.split(r'[,•\n]', text)]
        skills = [s for s in potential_skills if s and len(s) < 100]

    return skills[:20]  # Limit to 20 skills


def extract_experience(text: str) -> List[Dict[str, Any]]:
    """Extract job experience entries."""
    experience = []

    # Look for common patterns: job title, company, dates
    # This is a simplified extraction
    lines = text.split('\n')
    in_experience = False

    for i, line in enumerate(lines):
        if 'experience' in line.lower() or 'work history' in line.lower():
            in_experience = True
            continue

        if in_experience and any(word in line.lower() for word in ['education', 'skills', 'projects']):
            break

        # Very simple: if line looks like it could be a job title (short, capitalized, no numbers)
        if in_experience and line.strip() and len(line.strip()) < 100:
            if re.match(r'^[A-Z]', line.strip()) and not re.match(r'^[\d]', line.strip()):
                experience.append({
                    'title': line.strip()[:50]
                })

    return experience[:5]  # Limit to 5 entries


def extract_education(text: str) -> List[Dict[str, Any]]:
    """Extract education entries."""
    education = []

    # Look for degree patterns
    degree_pattern = r'(?:B\.?S\.?|B\.?A\.?|M\.?S\.?|M\.?B\.?A\.?|Ph\.?D\.?|Associate|Bachelor|Master|Doctorate)'

    matches = re.finditer(degree_pattern, text, re.IGNORECASE)
    for match in matches:
        # Get surrounding context
        start = max(0, match.start() - 50)
        end = min(len(text), match.end() + 100)
        context = text[start:end].strip()

        education.append({
            'degree': match.group(),
            'context': context
        })

    return education[:3]  # Limit to 3 entries
