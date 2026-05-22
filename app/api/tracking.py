"""API endpoints for tracking job applications."""

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional
import os
from datetime import datetime

from app.services.google_sheets import get_sheets_service


router = APIRouter(prefix="/api/v1/tracking", tags=["tracking"])


class JobApplicationRequest(BaseModel):
    """Request to track a job application."""
    company_name: str
    job_url: str
    position: Optional[str] = None
    date_applied: Optional[str] = None
    notes: Optional[str] = None


class JobApplicationResponse(BaseModel):
    """Response after tracking a job application."""
    success: bool
    message: str
    company_name: str
    job_url: str


@router.post("/job-application", response_model=JobApplicationResponse)
async def track_job_application(request: JobApplicationRequest):
    """Track a job application by adding it to Google Sheets.

    This endpoint is called when a job application form is submitted.
    It adds a row to the configured Google Spreadsheet with the company name
    and a link to the job application page.

    Requires:
        - GOOGLE_SPREADSHEET env variable with the spreadsheet URL
        - GOOGLE_SHEETS_CREDENTIALS_FILE env variable with path to service account JSON
    """
    # Check if Google Sheets integration is enabled
    spreadsheet_url = os.getenv('GOOGLE_SPREADSHEET')
    if not spreadsheet_url:
        return JobApplicationResponse(
            success=False,
            message="Google Sheets integration not configured (GOOGLE_SPREADSHEET env var not set)",
            company_name=request.company_name,
            job_url=request.job_url
        )

    # Get sheets service
    sheets_service = get_sheets_service()
    if not sheets_service:
        return JobApplicationResponse(
            success=False,
            message="Google Sheets service not available. Check GOOGLE_SHEETS_CREDENTIALS_FILE.",
            company_name=request.company_name,
            job_url=request.job_url
        )

    # Build additional data
    additional_data = {}
    if request.position:
        additional_data['position'] = request.position
    if request.date_applied:
        additional_data['date'] = request.date_applied
    else:
        # Auto-add today's date
        additional_data['date'] = datetime.now().strftime('%Y-%m-%d')

    if request.notes:
        additional_data['notes'] = request.notes

    # Add to spreadsheet
    success = sheets_service.add_job_application(
        spreadsheet_url=spreadsheet_url,
        company_name=request.company_name,
        job_url=request.job_url,
        additional_data=additional_data
    )

    if success:
        return JobApplicationResponse(
            success=True,
            message=f"Successfully tracked application to {request.company_name}",
            company_name=request.company_name,
            job_url=request.job_url
        )
    else:
        return JobApplicationResponse(
            success=False,
            message="Failed to add to Google Sheets. Check server logs.",
            company_name=request.company_name,
            job_url=request.job_url
        )


@router.get("/status")
async def get_tracking_status():
    """Get the status of Google Sheets tracking integration."""
    spreadsheet_url = os.getenv('GOOGLE_SPREADSHEET')
    credentials_file = os.getenv('GOOGLE_SHEETS_CREDENTIALS_FILE')

    sheets_service = get_sheets_service()

    return {
        "enabled": bool(spreadsheet_url and sheets_service),
        "spreadsheet_configured": bool(spreadsheet_url),
        "credentials_configured": bool(credentials_file and os.path.exists(credentials_file or '')),
        "service_initialized": bool(sheets_service),
        "spreadsheet_url": spreadsheet_url if spreadsheet_url else None
    }
