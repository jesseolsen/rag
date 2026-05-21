from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from datetime import datetime
import uuid
import re

from app.db import get_db
from app.models.database import FormFieldAnswer
from app.models.schemas import FormFieldAnswerRequest, FormFieldAnswerResponse, FormFieldAnswerListResponse

router = APIRouter(prefix="/api/v1/field-answers", tags=["field-answers"])


def extract_keywords(question_text: str) -> str:
    """Extract key phrases from question text for fuzzy matching.

    Removes stop words and common phrases, keeps meaningful keywords.
    Example: "What is your experience with backend development in a team production environment using Python?"
    -> "backend development team python"
    """
    # Remove common stop words and punctuation
    stop_words = {
        'what', 'is', 'your', 'the', 'a', 'in', 'on', 'at', 'to', 'for', 'of', 'and', 'or',
        'have', 'has', 'do', 'does', 'are', 'am', 'be', 'been', 'being', 'with', 'by',
        'please', 'explain', 'describe', 'provide', 'tell', 'give', 'us', 'them',
        'as', 'an', 'if', 'this', 'that', 'these', 'those', 'would', 'could', 'should',
        'can', 'will', 'may', 'must', 'environment', 'using', 'about'
    }

    # Convert to lowercase and split into words
    words = re.findall(r'\b\w+\b', question_text.lower())

    # Filter out stop words and keep meaningful keywords
    keywords = [w for w in words if w not in stop_words and len(w) > 2]

    # Return as space-separated string for storage
    return ' '.join(keywords)


def fuzzy_match_keywords(query_keywords: str, stored_keywords: str, min_matches: int = 2) -> float:
    """Calculate fuzzy match score between two keyword sets.

    Returns a score from 0 to 1 where 1 is a perfect match.
    min_matches: minimum number of matching keywords required to consider it a match
    """
    query_set = set(query_keywords.split())
    stored_set = set(stored_keywords.split())

    if not query_set or not stored_set:
        return 0.0

    # Calculate intersection
    matching = query_set & stored_set

    # Need minimum matches
    if len(matching) < min_matches:
        return 0.0

    # Jaccard similarity: intersection / union
    union = query_set | stored_set
    similarity = len(matching) / len(union)

    return similarity


@router.post("/", response_model=FormFieldAnswerResponse)
async def save_field_answer(
    request: FormFieldAnswerRequest,
    db: AsyncSession = Depends(get_db)
):
    """Save a field answer for future form pre-filling."""

    # Extract keywords from question for fuzzy matching
    keywords = extract_keywords(request.question_text)

    # Check if we already have this answer (same question keywords + answer)
    result = await db.execute(
        select(FormFieldAnswer).where(
            FormFieldAnswer.question_keywords == keywords,
            FormFieldAnswer.answer_text == request.answer_text
        )
    )
    existing = result.scalar_one_or_none()

    if existing:
        # Update last_used_at and increment use_count
        existing.last_used_at = datetime.utcnow()
        existing.use_count += 1
        await db.commit()
        await db.refresh(existing)
        return FormFieldAnswerResponse.from_orm(existing)

    # Create new answer
    field_answer = FormFieldAnswer(
        id=str(uuid.uuid4()),
        resume_id=request.resume_id,
        question_keywords=keywords,
        question_text=request.question_text,
        answer_text=request.answer_text,
        field_type=request.field_type,
        field_id=request.field_id,
        last_used_at=datetime.utcnow(),
        use_count=1
    )

    db.add(field_answer)
    await db.commit()
    await db.refresh(field_answer)

    return FormFieldAnswerResponse.from_orm(field_answer)


@router.get("/", response_model=FormFieldAnswerListResponse)
async def list_field_answers(
    resume_id: str = None,
    db: AsyncSession = Depends(get_db)
):
    """List all saved field answers, optionally filtered by resume."""

    query = select(FormFieldAnswer).order_by(FormFieldAnswer.created_at.desc())

    if resume_id:
        query = query.where(FormFieldAnswer.resume_id == resume_id)

    result = await db.execute(query)
    answers = result.scalars().all()

    return FormFieldAnswerListResponse(
        answers=[FormFieldAnswerResponse.from_orm(a) for a in answers],
        count=len(answers)
    )


@router.get("/{answer_id}", response_model=FormFieldAnswerResponse)
async def get_field_answer(
    answer_id: str,
    db: AsyncSession = Depends(get_db)
):
    """Get a specific field answer by ID."""

    result = await db.execute(
        select(FormFieldAnswer).where(FormFieldAnswer.id == answer_id)
    )
    answer = result.scalar_one_or_none()

    if not answer:
        raise HTTPException(status_code=404, detail="Field answer not found")

    return FormFieldAnswerResponse.from_orm(answer)


@router.get("/search/by-question")
async def search_field_answers(
    question_text: str = "",
    db: AsyncSession = Depends(get_db)
):
    """Search for matching field answers using fuzzy keyword matching.

    Returns list of matching answers sorted by relevance score.
    """

    query_keywords = extract_keywords(question_text)

    # Get all stored answers
    result = await db.execute(select(FormFieldAnswer))
    all_answers = result.scalars().all()

    # Determine minimum matches based on query length (adaptive)
    query_keyword_count = len(query_keywords.split()) if query_keywords else 0
    min_matches = 1 if query_keyword_count <= 2 else 2

    # Score each answer
    scored_answers = []
    for answer in all_answers:
        score = fuzzy_match_keywords(query_keywords, answer.question_keywords, min_matches=min_matches)
        if score > 0:  # Only return matches with score > 0
            scored_answers.append({
                'id': answer.id,
                'question_text': answer.question_text,
                'answer_text': answer.answer_text,
                'field_type': answer.field_type,
                'score': score,
                'use_count': answer.use_count,
                'last_used_at': answer.last_used_at
            })

    # Sort by score (descending) then by use_count (descending)
    scored_answers.sort(key=lambda x: (-x['score'], -x['use_count']))

    return {
        'query': question_text,
        'query_keywords': query_keywords,
        'matches': scored_answers,
        'match_count': len(scored_answers)
    }


@router.put("/{answer_id}", response_model=FormFieldAnswerResponse)
async def update_field_answer(
    answer_id: str,
    request: FormFieldAnswerRequest,
    db: AsyncSession = Depends(get_db)
):
    """Update a field answer."""

    result = await db.execute(
        select(FormFieldAnswer).where(FormFieldAnswer.id == answer_id)
    )
    answer = result.scalar_one_or_none()

    if not answer:
        raise HTTPException(status_code=404, detail="Field answer not found")

    # Update fields
    answer.question_text = request.question_text
    answer.question_keywords = extract_keywords(request.question_text)
    answer.answer_text = request.answer_text
    answer.field_type = request.field_type

    await db.commit()
    await db.refresh(answer)

    return FormFieldAnswerResponse.from_orm(answer)


@router.delete("/{answer_id}")
async def delete_field_answer(
    answer_id: str,
    db: AsyncSession = Depends(get_db)
):
    """Delete a field answer."""

    result = await db.execute(
        select(FormFieldAnswer).where(FormFieldAnswer.id == answer_id)
    )
    answer = result.scalar_one_or_none()

    if not answer:
        raise HTTPException(status_code=404, detail="Field answer not found")

    await db.delete(answer)
    await db.commit()

    return {"success": True, "deleted_id": answer_id}
