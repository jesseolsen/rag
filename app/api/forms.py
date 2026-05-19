from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
import uuid

from app.db import get_db
from app.models.database import FormResponse
from app.models.schemas import FormResponseRequest, FormResponseResponse

router = APIRouter(prefix="/api/v1", tags=["forms"])


@router.post("/form-response", response_model=FormResponseResponse)
async def save_form_response(
    request: FormResponseRequest,
    db: AsyncSession = Depends(get_db)
):
    """
    Save form response data from Chrome extension or automation.
    Called when user submits a job application form.
    """
    form_response = FormResponse(
        id=str(uuid.uuid4()),
        url=request.url,
        form_data=request.data,
        source=request.source
    )
    db.add(form_response)
    await db.commit()
    await db.refresh(form_response)
    return form_response
